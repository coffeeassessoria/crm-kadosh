import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import { env } from '../config/env';
import type { AdReferral, Agendamento, AgendaItem, Lead, PixSolicitacao, PropostaAgendamento } from '../types';

/** Soma `dias` a uma data ISO (YYYY-MM-DD) e retorna também no formato ISO. */
export function addDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

/** Dias da semana (0-6, Date.getDay()) com diária promocional, conforme PROMO_DIAS_SEMANA. */
function promoDiasSemanaNumeros(): number[] {
  return env.PROMO_DIAS_SEMANA.split(',')
    .map((d) => DIAS_SEMANA[d.trim().toLowerCase()])
    .filter((n) => n !== undefined);
}

/** Data de hoje (YYYY-MM-DD) no fuso horário da empresa, não do servidor. */
export function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: env.TIMEZONE });
}

const NOMES_DIA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Nome do dia da semana (em português) de uma data ISO (YYYY-MM-DD) — calculado em código, nunca "de cabeça" pelo modelo. */
export function nomeDiaSemana(dataISO: string): string {
  return NOMES_DIA_SEMANA[new Date(`${dataISO}T00:00:00`).getDay()];
}

/**
 * Preço da diária (1º dia, já incluso entrega + retirada) para uma data de ENTREGA.
 * Confirmado com o proprietário: a promoção vale se a ENTREGA cair num dos PROMO_DIAS_SEMANA
 * (ex: terça/quarta), não importa em que dia o pedido foi fechado. A diária adicional (dias
 * extras de permanência) NÃO entra nessa promoção.
 */
export function precoDiariaParaData(dataEntregaISO: string): { preco: number; promocao_aplicada: boolean } {
  const diaSemana = new Date(`${dataEntregaISO}T00:00:00`).getDay();
  const promocao_aplicada = promoDiasSemanaNumeros().includes(diaSemana);
  return { preco: promocao_aplicada ? env.PRECO_LOCACAO_PROMOCIONAL : env.PRECO_LOCACAO, promocao_aplicada };
}

/** RF01.2 / RF01.3 — recupera o lead pelo telefone ou cria um novo com origem WhatsApp. */
export async function findOrCreateLeadByPhone(
  telefone: string,
  nome?: string,
  adReferral?: AdReferral,
  rawFirstMessage?: unknown,
): Promise<Lead> {
  const { data: existing, error: findError } = await supabase
    .from('leads')
    .select('*')
    .eq('telefone', telefone)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as Lead;

  const { data: created, error: createError } = await supabase
    .from('leads')
    .insert({
      nome: nome || 'Lead WhatsApp',
      telefone,
      origem: adReferral ? 'anuncio_meta' : 'whatsapp_agente',
      campanha: adReferral?.idFonte ?? adReferral?.titulo ?? null,
      utm_medium: adReferral?.tipoFonte ?? null,
      utm_content: adReferral?.ctwaClid ?? adReferral?.corpo ?? null,
      primeiro_contato_raw: rawFirstMessage ?? null,
      status: 'novo',
    })
    .select('*')
    .single();

  if (createError) throw createError;

  await addHistorico(created.id, 'criado', 'Lead criado automaticamente pelo agente Kadu via WhatsApp.');
  return created as Lead;
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
  const { data, error } = await supabase.from('leads').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Lead;
}

/** Busca um lead pelo telefone sem criar um novo (usado para detectar atendimento humano manual). */
export async function findLeadByPhone(telefone: string): Promise<Lead | null> {
  const { data, error } = await supabase.from('leads').select('*').eq('telefone', telefone).maybeSingle();
  if (error) throw error;
  return (data as Lead) ?? null;
}

/** Atualiza o campo resumo_conversa do lead com o resumo gerado por IA. */
export async function updateResumoConversa(leadId: string, resumo: string): Promise<void> {
  const { error } = await supabase.from('leads').update({ resumo_conversa: resumo }).eq('id', leadId);
  if (error) logger.error({ error, leadId }, 'Falha ao salvar resumo da conversa');
}

/** Libera o lead de volta para o Kadu, zerando o flag de atendimento humano. */
export async function liberarParaKadu(leadId: string): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({ atendimento_humano_em: null })
    .eq('id', leadId);

  if (error) logger.error({ error, leadId }, 'Falha ao liberar lead para o Kadu');
}

/** Registra que um humano respondeu manualmente — pausa o agente Kadu por 24h para este lead. */
export async function setAtendimentoHumano(leadId: string, timestamp: Date): Promise<void> {
  const { error } = await supabase
    .from('leads')
    .update({ atendimento_humano_em: timestamp.toISOString() })
    .eq('id', leadId);

  if (error) logger.error({ error, leadId }, 'Falha ao registrar atendimento humano');
}

/** Registra uma entrada na timeline do lead (visível no CRM). */
export async function addHistorico(leadId: string, tipo: string, texto: string) {
  const { error } = await supabase.from('historico_lead').insert({ lead_id: leadId, tipo, texto });
  if (error) logger.error({ error, leadId, tipo }, 'Falha ao registrar histórico do lead');
}

/** RNF01.5 — log de auditoria imutável de toda mensagem trocada com o cliente. */
export async function logMensagem(
  leadId: string,
  direcao: 'inbound' | 'outbound',
  tipo: string,
  conteudo: string,
  whatsappMessageId?: string,
  isFollowup = false,
) {
  const { error } = await supabase.from('mensagens').insert({
    lead_id: leadId,
    direcao,
    tipo,
    conteudo,
    whatsapp_message_id: whatsappMessageId ?? null,
    is_followup: isFollowup,
  });

  if (error) logger.error({ error, leadId }, 'Falha ao registrar mensagem (auditoria)');
}

export interface UltimaMensagemLead {
  lead_id: string;
  direcao: 'inbound' | 'outbound';
  is_followup: boolean;
  created_at: string;
}

/**
 * Última mensagem de cada lead, só entre as trocadas nos últimos `minutosJanela` minutos —
 * usada pela rotina de follow-up pra achar quem está em silêncio recente sem precisar de uma
 * query por lead (evita N+1: um único SELECT cobre todos os leads ativos).
 */
export async function getUltimasMensagensRecentes(minutosJanela: number): Promise<Map<string, UltimaMensagemLead>> {
  const desde = new Date(Date.now() - minutosJanela * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('mensagens')
    .select('lead_id, direcao, is_followup, created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const porLead = new Map<string, UltimaMensagemLead>();
  for (const row of (data ?? []) as UltimaMensagemLead[]) {
    // Já ordenado desc — a primeira ocorrência de cada lead_id é a mensagem mais recente dele.
    if (!porLead.has(row.lead_id)) porLead.set(row.lead_id, row);
  }
  return porLead;
}

/** Leads em conversa ativa (fora dos status resolvidos) — candidatos à rotina de follow-up automático. */
export async function leadsAtivosParaFollowUp(statusResolvidos: string[]): Promise<Lead[]> {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('status', 'in', `(${statusResolvidos.join(',')})`);

  if (error) throw error;
  return (data ?? []) as Lead[];
}

/** Recupera as últimas mensagens da conversa no formato genérico (user/assistant). */
export async function getConversationHistory(
  leadId: string,
  limit = 20,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  const { data, error } = await supabase
    .from('mensagens')
    .select('direcao, conteudo')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error({ error, leadId }, 'Falha ao buscar histórico de mensagens');
    return [];
  }

  return (data ?? [])
    .reverse()
    .map((m) => ({
      role: m.direcao === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: m.conteudo,
    }));
}

/**
 * Verifica se um lead já tem agendamento não cancelado pra uma data de entrega — usado antes
 * de confirmar uma proposta de reconciliação, pra não duplicar um agendamento que já foi criado
 * por outro caminho (ex: cliente fechou pelo fluxo normal antes de alguém confirmar a proposta).
 */
export async function leadJaTemAgendamentoNaData(leadId: string, dataEntrega: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('lead_id', leadId)
    .eq('data_entrega', dataEntrega)
    .neq('status', 'cancelado')
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Cria um evento visível no calendário do CRM a partir de um agendamento.
 * A tabela `eventos` é a fonte de dados do calendário — sem este registro
 * o agendamento não aparece no calendário do CRM.
 */
export async function createEventoAgendamento(input: {
  leadId: string;
  titulo: string;
  descricao: string;
  dataEvento: string;
  horaInicio: string | null;
}): Promise<void> {
  const { error } = await supabase.from('eventos').insert({
    lead_id: input.leadId,
    titulo: input.titulo,
    descricao: input.descricao,
    data_evento: input.dataEvento,
    hora_inicio: input.horaInicio ?? null,
    cor: '#8B5CF6',
  });

  if (error) logger.error({ error, leadId: input.leadId }, 'Falha ao criar evento no calendário do CRM');
}

/**
 * RF03.4 — verifica se há caçambas livres o suficiente pro período pedido.
 * Uma caçamba entregue em `data_entrega` e retirada em `data_retirada` ocupa a frota
 * em todo o intervalo [data_entrega, data_retirada). Soma a quantidade de todos os
 * agendamentos não cancelados cujo período sobrepõe a data pedida e compara contra
 * o tamanho total da frota (FROTA_TOTAL_CACAMBAS).
 * O preco_diaria retornado depende da data de ENTREGA (dataEntrega), conforme a promoção.
 */
export async function checkAvailability(
  dataEntrega: string,
  quantidadeSolicitada: number,
  diasPermanencia = 1,
): Promise<{
  disponivel: boolean;
  cacambas_disponiveis: number;
  cacambas_ocupadas: number;
  frota_total: number;
  preco_diaria: number;
  promocao_aplicada: boolean;
  dia_semana: string;
}> {
  const dataRetirada = addDias(dataEntrega, diasPermanencia);

  const { data: rows, error } = await supabase
    .from('agendamentos')
    .select('quantidade_cacambas')
    .neq('status', 'cancelado')
    .lt('data_entrega', dataRetirada)
    .gt('data_retirada', dataEntrega);

  if (error) throw error;

  const ocupadas = (rows ?? []).reduce((soma, r) => soma + Number(r.quantidade_cacambas), 0);
  const disponiveis = Math.max(0, env.FROTA_TOTAL_CACAMBAS - ocupadas);
  const { preco, promocao_aplicada } = precoDiariaParaData(dataEntrega);

  return {
    disponivel: disponiveis >= quantidadeSolicitada,
    cacambas_disponiveis: disponiveis,
    cacambas_ocupadas: ocupadas,
    frota_total: env.FROTA_TOTAL_CACAMBAS,
    preco_diaria: preco,
    promocao_aplicada,
    dia_semana: nomeDiaSemana(dataEntrega),
  };
}

type NovoAgendamento = Omit<Agendamento, 'id' | 'created_at' | 'updated_at' | 'google_event_id' | 'numero_pedido'> & {
  status?: Agendamento['status'];
  numero_pedido?: number | null;
};

export async function createAgendamento(input: NovoAgendamento): Promise<Agendamento> {
  const { data, error } = await supabase
    .from('agendamentos')
    .insert({ ...input, status: input.status ?? 'confirmado' })
    .select('*')
    .single();

  if (error) throw error;
  return data as Agendamento;
}

export async function updateAgendamento(id: string, patch: Partial<Agendamento>): Promise<Agendamento> {
  const { data, error } = await supabase.from('agendamentos').update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Agendamento;
}

/** RF04.2 — cria o registro de solicitação de sinal via PIX. */
export async function createPixSolicitacao(leadId: string, valor: number): Promise<PixSolicitacao> {
  const { data, error } = await supabase
    .from('pix_solicitacoes')
    .insert({ lead_id: leadId, valor, status: 'pendente' })
    .select('*')
    .single();

  if (error) throw error;
  return data as PixSolicitacao;
}

/** RF04.3 — confirma o recebimento do comprovante e libera o agendamento. */
export async function confirmPixSolicitacao(id: string, comprovanteUrl?: string): Promise<PixSolicitacao> {
  const { data, error } = await supabase
    .from('pix_solicitacoes')
    .update({
      status: 'confirmado',
      confirmed_at: new Date().toISOString(),
      comprovante_url: comprovanteUrl ?? null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as PixSolicitacao;
}

/** RF05.2 — entregas e retiradas do dia para o briefing operacional. */
export async function getAgendaDoDia(data: string): Promise<{ entregas: AgendaItem[]; retiradas: AgendaItem[] }> {
  const { data: entregas, error: errEntregas } = await supabase
    .from('agendamentos')
    .select('id, endereco_completo, quantidade_cacambas, tipo_residuo, horario_entrega, leads(nome)')
    .eq('data_entrega', data)
    .eq('status', 'confirmado')
    .order('horario_entrega', { ascending: true });

  if (errEntregas) throw errEntregas;

  const { data: retiradas, error: errRetiradas } = await supabase
    .from('agendamentos')
    .select('id, endereco_completo, quantidade_cacambas, tipo_residuo, horario_entrega, leads(nome)')
    .eq('data_retirada', data)
    .eq('status', 'confirmado')
    .order('horario_entrega', { ascending: true });

  if (errRetiradas) throw errRetiradas;

  return {
    entregas: (entregas ?? []) as AgendaItem[],
    retiradas: (retiradas ?? []) as AgendaItem[],
  };
}

/** Entregas e retiradas confirmadas em um intervalo de datas (relatório de agenda da semana). */
export async function getAgendaPeriodo(
  dataInicio: string,
  dataFim: string,
): Promise<{ entregas: AgendaItem[]; retiradas: AgendaItem[] }> {
  const colunas =
    'id, endereco_completo, quantidade_cacambas, tipo_residuo, horario_entrega, data_entrega, data_retirada, leads(nome)';

  const { data: entregas, error: errEntregas } = await supabase
    .from('agendamentos')
    .select(colunas)
    .gte('data_entrega', dataInicio)
    .lte('data_entrega', dataFim)
    .eq('status', 'confirmado')
    .order('data_entrega', { ascending: true })
    .order('horario_entrega', { ascending: true });

  if (errEntregas) throw errEntregas;

  const { data: retiradas, error: errRetiradas } = await supabase
    .from('agendamentos')
    .select(colunas)
    .gte('data_retirada', dataInicio)
    .lte('data_retirada', dataFim)
    .eq('status', 'confirmado')
    .order('data_retirada', { ascending: true })
    .order('horario_entrega', { ascending: true });

  if (errRetiradas) throw errRetiradas;

  return {
    entregas: (entregas ?? []) as unknown as AgendaItem[],
    retiradas: (retiradas ?? []) as unknown as AgendaItem[],
  };
}

export interface ResumoFinanceiro {
  faturamento_confirmado: number;
  quantidade_agendamentos_confirmados: number;
  pix_pendentes: { quantidade: number; valor_total: number };
  pix_confirmados: { quantidade: number; valor_total: number };
}

/** Faturamento confirmado (por data de entrega) e status dos sinais PIX em um período. */
export async function getResumoFinanceiro(dataInicio: string, dataFim: string): Promise<ResumoFinanceiro> {
  const { data: agendamentos, error: errAgendamentos } = await supabase
    .from('agendamentos')
    .select('valor_total')
    .eq('status', 'confirmado')
    .gte('data_entrega', dataInicio)
    .lte('data_entrega', dataFim);

  if (errAgendamentos) throw errAgendamentos;

  const { data: pix, error: errPix } = await supabase
    .from('pix_solicitacoes')
    .select('valor, status')
    .gte('created_at', `${dataInicio}T00:00:00`)
    .lte('created_at', `${dataFim}T23:59:59`);

  if (errPix) throw errPix;

  const pixPendentes = (pix ?? []).filter((p) => p.status === 'pendente');
  const pixConfirmados = (pix ?? []).filter((p) => p.status === 'confirmado');

  return {
    faturamento_confirmado: (agendamentos ?? []).reduce((soma, a) => soma + Number(a.valor_total), 0),
    quantidade_agendamentos_confirmados: agendamentos?.length ?? 0,
    pix_pendentes: {
      quantidade: pixPendentes.length,
      valor_total: pixPendentes.reduce((soma, p) => soma + Number(p.valor), 0),
    },
    pix_confirmados: {
      quantidade: pixConfirmados.length,
      valor_total: pixConfirmados.reduce((soma, p) => soma + Number(p.valor), 0),
    },
  };
}

/** Busca leads pelo nome (busca parcial case-insensitive) ou pelo telefone (exato, só dígitos). */
export async function findLeadsByNomeOuTelefone(query: string): Promise<Lead[]> {
  const normalizedPhone = query.replace(/\D/g, '');
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .or(`nome.ilike.%${query}%${normalizedPhone ? `,telefone.eq.${normalizedPhone}` : ''}`)
    .order('updated_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data ?? []) as Lead[];
}

/** Marca o lead como convertido, confirma o agendamento mais recente (se não cancelado) e registra no histórico. */
export async function confirmarEntregaLead(leadId: string): Promise<void> {
  await updateLead(leadId, { status: 'convertido' });

  const { data: agendamentos } = await supabase
    .from('agendamentos')
    .select('id, status')
    .eq('lead_id', leadId)
    .neq('status', 'cancelado')
    .order('created_at', { ascending: false })
    .limit(1);

  if (agendamentos && agendamentos.length > 0 && agendamentos[0].status !== 'confirmado') {
    await updateAgendamento(agendamentos[0].id, { status: 'confirmado' });
  }

  await addHistorico(leadId, 'convertido', 'Entrega confirmada via comando no grupo operacional.');
}

/** Cria um lead já classificado como cliente (status convertido, cliente_desde = hoje). */
export async function createLeadCliente(data: {
  nome: string;
  telefone: string;
  endereco?: string;
  bairro?: string;
  cpf?: string;
  email?: string;
  observacoes?: string;
}): Promise<Lead> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: created, error } = await supabase
    .from('leads')
    .insert({
      nome: data.nome,
      telefone: data.telefone,
      origem: 'cadastro_manual_grupo',
      status: 'convertido',
      endereco: data.endereco ?? null,
      bairro: data.bairro ?? null,
      cpf: data.cpf ?? null,
      email: data.email ?? null,
      observacoes_cliente: data.observacoes ?? null,
      cliente_desde: hoje,
    })
    .select('*')
    .single();
  if (error) throw error;
  await addHistorico(created.id, 'criado', 'Cliente cadastrado manualmente via comando no grupo operacional.');
  return created as Lead;
}

export interface FunilLeadsItem {
  status: string;
  total: number;
}

/** Contagem de leads por etapa do Kanban (visão geral do funil para o agente administrativo). */
export async function getFunilLeads(): Promise<FunilLeadsItem[]> {
  const { data, error } = await supabase.from('leads').select('status');
  if (error) throw error;

  const contagem = new Map<string, number>();
  for (const row of data ?? []) {
    const status = row.status as string;
    contagem.set(status, (contagem.get(status) ?? 0) + 1);
  }

  return Array.from(contagem.entries()).map(([status, total]) => ({ status, total }));
}

/** Status de lead considerados "já resolvidos" — não entram na reconciliação diária. */
const STATUS_LEAD_RESOLVIDOS = ['agendado', 'convertido', 'perdido'];

/**
 * Leads com conversa em `dataISO` que ainda não têm agendamento real no CRM nem proposta
 * pendente de reconciliação — candidatos a serem revisados pela análise de conversa via IA.
 */
export async function leadsParaRevisarFechamento(dataISO: string): Promise<Lead[]> {
  const { data: msgs, error: errMsgs } = await supabase
    .from('mensagens')
    .select('lead_id')
    .gte('created_at', `${dataISO}T00:00:00`)
    .lte('created_at', `${dataISO}T23:59:59`);
  if (errMsgs) throw errMsgs;

  const leadIds = [...new Set((msgs ?? []).map((m) => m.lead_id as string))];
  if (leadIds.length === 0) return [];

  const { data: leads, error: errLeads } = await supabase
    .from('leads')
    .select('*')
    .in('id', leadIds)
    .not('status', 'in', `(${STATUS_LEAD_RESOLVIDOS.join(',')})`);
  if (errLeads) throw errLeads;
  if (!leads || leads.length === 0) return [];

  const idsRestantes = leads.map((l) => l.id as string);

  const { data: agendamentosExistentes, error: errAg } = await supabase
    .from('agendamentos')
    .select('lead_id')
    .in('lead_id', idsRestantes)
    .neq('status', 'cancelado');
  if (errAg) throw errAg;
  const leadsComAgendamento = new Set((agendamentosExistentes ?? []).map((a) => a.lead_id as string));

  const { data: propostasExistentes, error: errProp } = await supabase
    .from('propostas_agendamento')
    .select('lead_id')
    .in('lead_id', idsRestantes)
    .eq('status', 'pendente');
  if (errProp) throw errProp;
  const leadsComProposta = new Set((propostasExistentes ?? []).map((p) => p.lead_id as string));

  return (leads as Lead[]).filter((l) => !leadsComAgendamento.has(l.id) && !leadsComProposta.has(l.id));
}

/** Cria uma proposta de agendamento (pendente de confirmação humana) a partir da análise de uma conversa. */
export async function criarPropostaAgendamento(input: {
  leadId: string;
  nomeCliente: string;
  telefone: string;
  enderecoCompleto: string;
  bairro: string | null;
  tipoResiduo: string | null;
  quantidadeCacambas: number;
  dataEntrega: string;
  horarioEntrega: string | null;
  diasPermanencia: number;
  valorTotal: number;
  justificativa: string;
}): Promise<PropostaAgendamento> {
  const { data, error } = await supabase
    .from('propostas_agendamento')
    .insert({
      lead_id: input.leadId,
      nome_cliente: input.nomeCliente,
      telefone: input.telefone,
      endereco_completo: input.enderecoCompleto,
      bairro: input.bairro,
      tipo_residuo: input.tipoResiduo,
      quantidade_cacambas: input.quantidadeCacambas,
      data_entrega: input.dataEntrega,
      horario_entrega: input.horarioEntrega,
      dias_permanencia: input.diasPermanencia,
      valor_total: input.valorTotal,
      justificativa: input.justificativa,
      status: 'pendente',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PropostaAgendamento;
}

/** Propostas de agendamento aguardando confirmação humana. */
export async function listarPropostasPendentes(): Promise<PropostaAgendamento[]> {
  const { data, error } = await supabase
    .from('propostas_agendamento')
    .select('*')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PropostaAgendamento[];
}

/** Marca uma proposta como confirmada ou descartada (não apaga — mantém histórico). */
export async function resolverProposta(
  id: string,
  status: 'confirmado' | 'descartado',
): Promise<PropostaAgendamento> {
  const { data, error } = await supabase
    .from('propostas_agendamento')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as PropostaAgendamento;
}
