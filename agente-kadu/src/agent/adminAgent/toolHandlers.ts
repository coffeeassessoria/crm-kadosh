import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import * as crm from '../../services/crm.service';
import * as maps from '../../services/maps.service';
import { criarAgendamentoCompleto } from '../../services/agendamento.service';
import type { AgendaItem, PropostaAgendamento } from '../../types';

/** Labels amigáveis das etapas do Kanban (ver SUPABASE_PATCH_03.sql, configuracoes.kanban_stages). */
const KANBAN_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato: 'Em Contato',
  agendado: 'Agendado',
  sinal_pendente: 'Sinal Pendente',
  escalado: 'Escalado',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

/** Primeiro e último dia do mês corrente (no fuso da empresa), no formato YYYY-MM-DD. */
function inicioFimMes(): { inicio: string; fim: string } {
  const [ano, mes] = crm.hojeISO().split('-').map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fim };
}

function comRota(item: AgendaItem) {
  return { ...item, rota: maps.buildDirectionsLink(item.endereco_completo) };
}

/** Filtra propostas pendentes por nome (parcial) ou telefone, ou retorna todas se alvo = "todos". */
function filtrarPropostasPorAlvo(propostas: PropostaAgendamento[], alvo: string): PropostaAgendamento[] {
  if (alvo.toLowerCase() === 'todos') return propostas;

  const alvoNormalizado = alvo.toLowerCase();
  const alvoTelefone = alvo.replace(/\D/g, '');

  return propostas.filter(
    (p) =>
      p.nome_cliente.toLowerCase().includes(alvoNormalizado) ||
      (alvoTelefone && p.telefone.includes(alvoTelefone)),
  );
}

/** Executa uma tool do agente administrativo/financeiro e retorna o resultado (serializado para o Claude). */
export async function runAdminTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  logger.info({ tool: name, input }, 'Executando tool do agente administrativo');

  switch (name) {
    case 'get_agenda': {
      const periodo = String(input.periodo ?? 'hoje');
      const hoje = crm.hojeISO();

      // dia_semana vem sempre calculado aqui — o modelo NUNCA deve calcular dia da semana sozinho.
      if (periodo === 'semana') {
        const resultado = await crm.getAgendaPeriodo(hoje, crm.addDias(hoje, 6));
        return {
          entregas: resultado.entregas.map((item) => ({ ...comRota(item), dia_semana: crm.nomeDiaSemana(item.data_entrega!) })),
          retiradas: resultado.retiradas.map((item) => ({ ...comRota(item), dia_semana: crm.nomeDiaSemana(item.data_retirada!) })),
        };
      }

      const dataAlvo = periodo === 'amanha' ? crm.addDias(hoje, 1) : hoje;
      const resultado = await crm.getAgendaDoDia(dataAlvo);

      return {
        data: dataAlvo,
        dia_semana: crm.nomeDiaSemana(dataAlvo),
        entregas: resultado.entregas.map(comRota),
        retiradas: resultado.retiradas.map(comRota),
      };
    }

    case 'get_resumo_financeiro': {
      const periodo = String(input.periodo ?? 'mes');
      const hoje = crm.hojeISO();

      let dataInicio = hoje;
      let dataFim = hoje;

      if (periodo === 'semana') {
        dataFim = crm.addDias(hoje, 6);
      } else if (periodo === 'mes') {
        ({ inicio: dataInicio, fim: dataFim } = inicioFimMes());
      }

      return crm.getResumoFinanceiro(dataInicio, dataFim);
    }

    case 'get_funil_leads': {
      const funil = await crm.getFunilLeads();
      const total = funil.reduce((soma, item) => soma + item.total, 0);

      return {
        total,
        etapas: funil.map((item) => ({
          status: item.status,
          label: KANBAN_LABELS[item.status] ?? item.status,
          total: item.total,
        })),
      };
    }

    case 'confirmar_entrega': {
      const query = String(input.nome_ou_telefone ?? '').trim();
      const leads = await crm.findLeadsByNomeOuTelefone(query);

      if (leads.length === 0) {
        return { encontrado: false, mensagem: `Nenhum lead/cliente encontrado para "${query}".` };
      }

      if (leads.length > 1) {
        return {
          encontrado: false,
          multiplos: true,
          opcoes: leads.map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone, status: l.status })),
          mensagem: `Encontrei ${leads.length} registros. Seja mais específico (use o nome completo ou o telefone).`,
        };
      }

      const lead = leads[0];
      await crm.confirmarEntregaLead(lead.id);

      return {
        confirmado: true,
        lead_id: lead.id,
        nome: lead.nome,
        mensagem: `Entrega de *${lead.nome}* confirmada — status atualizado para "Convertido" no CRM.`,
      };
    }

    case 'cadastrar_cliente': {
      const nome = String(input.nome ?? '').trim();
      const telefone = String(input.telefone ?? '').replace(/\D/g, '');

      if (!nome || !telefone) {
        return { erro: 'Nome e telefone são obrigatórios.' };
      }

      // Verifica se já existe lead com este telefone
      const existente = await crm.findLeadByPhone(telefone);
      if (existente) {
        return {
          cadastrado: false,
          ja_existe: true,
          lead_id: existente.id,
          nome: existente.nome,
          mensagem: `Já existe cadastro com este telefone: *${existente.nome}* (status: ${existente.status}).`,
        };
      }

      const novoCliente = await crm.createLeadCliente({
        nome,
        telefone,
        endereco: input.endereco ? String(input.endereco) : undefined,
        bairro: input.bairro ? String(input.bairro) : undefined,
        cpf: input.cpf ? String(input.cpf) : undefined,
        email: input.email ? String(input.email) : undefined,
        observacoes: input.observacoes ? String(input.observacoes) : undefined,
      });

      return {
        cadastrado: true,
        lead_id: novoCliente.id,
        nome: novoCliente.nome,
        mensagem: `Cliente *${novoCliente.nome}* cadastrado com sucesso no CRM.`,
      };
    }

    case 'criar_agendamento': {
      const nomeCliente = String(input.nome_cliente ?? '').trim();
      const telefone = String(input.telefone ?? '').replace(/\D/g, '');
      const enderecoCompleto = String(input.endereco_completo ?? '').trim();
      const bairro = String(input.bairro ?? '').trim();
      const tipoResiduo = String(input.tipo_residuo ?? '').trim();
      const quantidade = Math.max(1, Number(input.quantidade_cacambas ?? 1));
      const dataEntrega = String(input.data_entrega ?? '');
      const horarioEntrega = input.horario_entrega ? String(input.horario_entrega) : null;
      const diasPermanencia = Math.max(1, Number(input.dias_permanencia ?? 1));

      const { preco: precoDiaria } = crm.precoDiariaParaData(dataEntrega);
      const valorCalculado =
        quantidade * (precoDiaria + Math.max(0, diasPermanencia - 1) * env.DIARIA_ADICIONAL);
      const valorTotal = input.valor_total ? Number(input.valor_total) : valorCalculado;

      // Encontra ou cria o lead pelo telefone
      const lead = await crm.findOrCreateLeadByPhone(telefone, nomeCliente);

      const { agendamento, dataRetirada, googleEventId, rota } = await criarAgendamentoCompleto({
        leadId: lead.id,
        nomeCliente,
        telefone,
        enderecoCompleto,
        bairro,
        tipoResiduo,
        quantidadeCacambas: quantidade,
        dataEntrega,
        horarioEntrega,
        diasPermanencia,
        valorTotal,
      });

      return {
        criado: true,
        agendamento_id: agendamento.id,
        numero_pedido: agendamento.numero_pedido,
        nome_cliente: nomeCliente,
        data_entrega: dataEntrega,
        data_retirada: dataRetirada,
        valor_total: valorTotal,
        rota,
        google_calendar: googleEventId ? 'criado' : 'nao_configurado',
        mensagem: `Agendamento criado para *${nomeCliente}* em ${dataEntrega} — R$ ${valorTotal.toFixed(2)}. Retirada prevista: ${dataRetirada}.`,
      };
    }

    case 'listar_agendamentos_propostos': {
      const propostas = await crm.listarPropostasPendentes();
      return {
        total: propostas.length,
        propostas: propostas.map((p) => ({
          nome_cliente: p.nome_cliente,
          telefone: p.telefone,
          endereco_completo: p.endereco_completo,
          quantidade_cacambas: p.quantidade_cacambas,
          data_entrega: p.data_entrega,
          valor_total: p.valor_total,
          justificativa: p.justificativa,
        })),
      };
    }

    case 'confirmar_agendamento_proposto': {
      const alvo = String(input.alvo ?? '').trim();
      const pendentes = await crm.listarPropostasPendentes();
      const selecionadas = filtrarPropostasPorAlvo(pendentes, alvo);

      if (selecionadas.length === 0) {
        return { confirmados: 0, mensagem: `Nenhuma proposta pendente encontrada para "${alvo}".` };
      }

      const criados: { nome: string; numero_pedido: number | null }[] = [];
      for (const p of selecionadas) {
        const lead = await crm.findOrCreateLeadByPhone(p.telefone, p.nome_cliente);

        const { agendamento } = await criarAgendamentoCompleto({
          leadId: lead.id,
          nomeCliente: p.nome_cliente,
          telefone: p.telefone,
          enderecoCompleto: p.endereco_completo,
          bairro: p.bairro ?? '',
          tipoResiduo: p.tipo_residuo ?? '',
          quantidadeCacambas: p.quantidade_cacambas,
          dataEntrega: p.data_entrega,
          horarioEntrega: p.horario_entrega,
          diasPermanencia: p.dias_permanencia,
          valorTotal: Number(p.valor_total),
        });

        await crm.resolverProposta(p.id, 'confirmado');
        criados.push({ nome: p.nome_cliente, numero_pedido: agendamento.numero_pedido });
      }

      return {
        confirmados: criados.length,
        agendamentos: criados,
        mensagem: `${criados.length} agendamento(s) confirmado(s) e criado(s) no CRM: ${criados.map((c) => c.nome).join(', ')}.`,
      };
    }

    case 'descartar_agendamento_proposto': {
      const alvo = String(input.alvo ?? '').trim();
      const pendentes = await crm.listarPropostasPendentes();
      const selecionadas = filtrarPropostasPorAlvo(pendentes, alvo);

      if (selecionadas.length === 0) {
        return { descartados: 0, mensagem: `Nenhuma proposta pendente encontrada para "${alvo}".` };
      }

      await Promise.all(selecionadas.map((p) => crm.resolverProposta(p.id, 'descartado')));

      return {
        descartados: selecionadas.length,
        mensagem: `${selecionadas.length} proposta(s) descartada(s): ${selecionadas.map((p) => p.nome_cliente).join(', ')}.`,
      };
    }

    case 'liberar_kadu': {
      const query = String(input.nome_ou_telefone ?? '').trim();

      if (query.toLowerCase() === 'todos') {
        const { data: bloqueados, error } = await (await import('../../lib/supabase')).supabase
          .from('leads')
          .select('id, nome')
          .not('atendimento_humano_em', 'is', null);

        if (error) return { erro: 'Falha ao buscar leads bloqueados.' };
        if (!bloqueados || bloqueados.length === 0) return { liberados: 0, mensagem: 'Nenhum lead bloqueado no momento.' };

        await Promise.all(bloqueados.map((l: { id: string }) => crm.liberarParaKadu(l.id)));

        return {
          liberados: bloqueados.length,
          mensagem: `${bloqueados.length} lead(s) liberado(s) para o Kadu.`,
        };
      }

      const leads = await crm.findLeadsByNomeOuTelefone(query);

      if (leads.length === 0) return { encontrado: false, mensagem: `Nenhum lead encontrado para "${query}".` };
      if (leads.length > 1) return {
        encontrado: false,
        multiplos: true,
        opcoes: leads.map((l) => ({ nome: l.nome, telefone: l.telefone, bloqueado: !!l.atendimento_humano_em })),
        mensagem: `${leads.length} leads encontrados. Seja mais específico.`,
      };

      const lead = leads[0];
      await crm.liberarParaKadu(lead.id);
      await crm.addHistorico(lead.id, 'liberado', 'Lead liberado para atendimento automático pelo Kadu via comando no grupo.');

      return {
        liberado: true,
        nome: lead.nome,
        mensagem: `*${lead.nome}* liberado — Kadu vai responder normalmente a partir de agora.`,
      };
    }

    default:
      logger.warn({ tool: name }, 'Tool desconhecida solicitada pelo agente administrativo');
      return { erro: `Tool desconhecida: ${name}` };
  }
}
