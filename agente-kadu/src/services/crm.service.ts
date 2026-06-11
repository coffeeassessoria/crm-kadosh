import type Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';
import type { Agendamento, AgendaItem, Lead, PixSolicitacao } from '../types';

/** RF01.2 / RF01.3 — recupera o lead pelo telefone ou cria um novo com origem WhatsApp. */
export async function findOrCreateLeadByPhone(telefone: string, nome?: string): Promise<Lead> {
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
      origem: 'whatsapp_agente',
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
) {
  const { error } = await supabase.from('mensagens').insert({
    lead_id: leadId,
    direcao,
    tipo,
    conteudo,
    whatsapp_message_id: whatsappMessageId ?? null,
  });

  if (error) logger.error({ error, leadId }, 'Falha ao registrar mensagem (auditoria)');
}

/** Recupera as últimas mensagens da conversa no formato esperado pela API da Anthropic. */
export async function getConversationHistory(leadId: string, limit = 20): Promise<Anthropic.MessageParam[]> {
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
 * RF03.4 — verifica se já existe agendamento para a data informada.
 * Limite simples e configurável: até 6 entregas por dia.
 */
const MAX_ENTREGAS_POR_DIA = 6;

export async function checkAvailability(data: string): Promise<{ disponivel: boolean; total_agendamentos: number }> {
  const { data: rows, error } = await supabase
    .from('agendamentos')
    .select('id')
    .eq('data_entrega', data)
    .neq('status', 'cancelado');

  if (error) throw error;

  const total = rows?.length ?? 0;
  return { disponivel: total < MAX_ENTREGAS_POR_DIA, total_agendamentos: total };
}

type NovoAgendamento = Omit<Agendamento, 'id' | 'created_at' | 'updated_at' | 'google_event_id'> & {
  status?: Agendamento['status'];
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
