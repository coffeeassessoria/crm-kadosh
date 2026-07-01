import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import * as crm from '../../services/crm.service';
import * as maps from '../../services/maps.service';
import * as calendar from '../../services/calendar.service';
import type { AgendaItem } from '../../types';

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

function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: env.TIMEZONE });
}

function addDiasISO(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Primeiro e último dia do mês corrente (no fuso da empresa), no formato YYYY-MM-DD. */
function inicioFimMes(): { inicio: string; fim: string } {
  const [ano, mes] = hojeISO().split('-').map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const fim = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
  return { inicio, fim };
}

function comRota(item: AgendaItem) {
  return { ...item, rota: maps.buildDirectionsLink(item.endereco_completo) };
}

/** Executa uma tool do agente administrativo/financeiro e retorna o resultado (serializado para o Claude). */
export async function runAdminTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  logger.info({ tool: name, input }, 'Executando tool do agente administrativo');

  switch (name) {
    case 'get_agenda': {
      const periodo = String(input.periodo ?? 'hoje');
      const hoje = hojeISO();

      const resultado =
        periodo === 'amanha'
          ? await crm.getAgendaDoDia(addDiasISO(hoje, 1))
          : periodo === 'semana'
            ? await crm.getAgendaPeriodo(hoje, addDiasISO(hoje, 6))
            : await crm.getAgendaDoDia(hoje);

      return {
        entregas: resultado.entregas.map(comRota),
        retiradas: resultado.retiradas.map(comRota),
      };
    }

    case 'get_resumo_financeiro': {
      const periodo = String(input.periodo ?? 'mes');
      const hoje = hojeISO();

      let dataInicio = hoje;
      let dataFim = hoje;

      if (periodo === 'semana') {
        dataFim = addDiasISO(hoje, 6);
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

      const valorCalculado =
        quantidade * (env.PRECO_LOCACAO + Math.max(0, diasPermanencia - 1) * env.DIARIA_ADICIONAL);
      const valorTotal = input.valor_total ? Number(input.valor_total) : valorCalculado;

      const dataRetirada = addDiasISO(dataEntrega, diasPermanencia);

      // Encontra ou cria o lead pelo telefone
      const lead = await crm.findOrCreateLeadByPhone(telefone, nomeCliente);

      await crm.updateLead(lead.id, {
        nome: nomeCliente,
        tipo_residuo: tipoResiduo,
        bairro,
        endereco: enderecoCompleto,
        quantidade_cacambas: quantidade,
        valor: valorTotal,
        status: 'agendado',
        data_agendamento: dataEntrega,
      });

      const agendamento = await crm.createAgendamento({
        lead_id: lead.id,
        endereco_completo: enderecoCompleto,
        bairro,
        tipo_residuo: tipoResiduo,
        quantidade_cacambas: quantidade,
        data_entrega: dataEntrega,
        horario_entrega: horarioEntrega,
        data_retirada: dataRetirada,
        dias_permanencia: diasPermanencia,
        valor_total: valorTotal,
        status: 'confirmado',
      });

      await crm.createEventoAgendamento({
        leadId: lead.id,
        titulo: `🚛 Entrega - ${nomeCliente} (${quantidade}x)`,
        descricao: [
          `Endereço: ${enderecoCompleto}`,
          `Resíduo: ${tipoResiduo}`,
          `Quantidade: ${quantidade} caçamba(s)`,
          `Valor total: R$ ${valorTotal.toFixed(2)}`,
          `Retirada prevista: ${dataRetirada}`,
          `Telefone: ${telefone}`,
        ].join('\n'),
        dataEvento: dataEntrega,
        horaInicio: horarioEntrega,
      });

      const googleEventId = await calendar.createDeliveryEvent({
        title: `Entrega - ${nomeCliente}`,
        description: [
          `Cliente: ${nomeCliente}`,
          `Telefone: ${telefone}`,
          `Resíduo: ${tipoResiduo}`,
          `Quantidade: ${quantidade} caçamba(s)`,
          `Valor total: R$ ${valorTotal.toFixed(2)}`,
          `Retirada prevista: ${dataRetirada}`,
        ].join('\n'),
        location: enderecoCompleto,
        date: dataEntrega,
        time: horarioEntrega,
      });

      if (googleEventId) {
        await crm.updateAgendamento(agendamento.id, { google_event_id: googleEventId });
      }

      await crm.addHistorico(
        lead.id,
        'agendamento',
        `Agendamento #${agendamento.numero_pedido ?? agendamento.id.slice(0, 8)} criado via comando no grupo para ${dataEntrega} (${quantidade}x, R$ ${valorTotal.toFixed(2)}).`,
      );

      return {
        criado: true,
        agendamento_id: agendamento.id,
        numero_pedido: agendamento.numero_pedido,
        nome_cliente: nomeCliente,
        data_entrega: dataEntrega,
        data_retirada: dataRetirada,
        valor_total: valorTotal,
        rota: maps.buildDirectionsLink(enderecoCompleto),
        google_calendar: googleEventId ? 'criado' : 'nao_configurado',
        mensagem: `Agendamento criado para *${nomeCliente}* em ${dataEntrega} — R$ ${valorTotal.toFixed(2)}. Retirada prevista: ${dataRetirada}.`,
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
