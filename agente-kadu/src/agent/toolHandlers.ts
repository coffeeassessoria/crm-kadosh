import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as crm from '../services/crm.service';
import * as calendar from '../services/calendar.service';
import * as maps from '../services/maps.service';
import type { Lead } from '../types';

function addDias(dataISO: string, dias: number): string {
  const data = new Date(`${dataISO}T00:00:00`);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Executa uma tool chamada pelo agente e retorna o resultado (serializado para o Claude). */
export async function runTool(name: string, input: Record<string, unknown>, lead: Lead): Promise<unknown> {
  logger.info({ tool: name, input, leadId: lead.id }, 'Executando tool do agente');

  switch (name) {
    case 'save_address': {
      const enderecoCompleto = String(input.endereco_completo ?? '').trim();
      const bairro = input.bairro ? String(input.bairro).trim() : undefined;

      await crm.updateLead(lead.id, {
        endereco: enderecoCompleto,
        ...(bairro ? { bairro } : {}),
      });

      return { ok: true };
    }

    case 'check_availability': {
      return crm.checkAvailability(String(input.data));
    }

    case 'create_appointment': {
      const dataEntrega = String(input.data_entrega);
      const diasPermanencia = Math.max(1, Number(input.dias_permanencia ?? 1));
      const dataRetirada = addDias(dataEntrega, diasPermanencia);
      const horarioEntrega = (input.horario_entrega as string | undefined) ?? null;
      const valorTotal = Number(input.valor_total);
      const quantidade = Number(input.quantidade_cacambas);
      const nomeCliente = String(input.nome_cliente);
      const enderecoCompleto = String(input.endereco_completo);
      const bairro = String(input.bairro);
      const tipoResiduo = String(input.tipo_residuo);
      const telefone = String(input.telefone ?? lead.telefone ?? '');

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

      // Cria evento no calendário do CRM (tabela `eventos`) para aparecer na view de Agendamentos
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
        `Agendamento #${agendamento.id.slice(0, 8)} criado para ${dataEntrega} (${quantidade}x, R$ ${valorTotal.toFixed(2)}).`,
      );

      return {
        agendamento_id: agendamento.id,
        data_retirada: dataRetirada,
        rota: maps.buildDirectionsLink(enderecoCompleto),
        google_calendar: googleEventId ? 'criado' : 'nao_configurado',
      };
    }

    case 'send_pix_request': {
      const valorSinal = Number(input.valor_sinal);
      const pix = await crm.createPixSolicitacao(lead.id, valorSinal);
      await crm.updateLead(lead.id, { status: 'sinal_pendente' });
      await crm.addHistorico(
        lead.id,
        'pix',
        `Sinal de R$ ${valorSinal.toFixed(2)} solicitado via PIX (#${pix.id.slice(0, 8)}).`,
      );

      return {
        pix_solicitacao_id: pix.id,
        chave_pix: env.CHAVE_PIX || null,
        valor: valorSinal,
      };
    }

    case 'confirm_pix': {
      const pixId = String(input.pix_solicitacao_id);
      const recebido = Boolean(input.comprovante_recebido);

      if (!recebido) {
        return { confirmado: false };
      }

      const pix = await crm.confirmPixSolicitacao(pixId);
      await crm.addHistorico(lead.id, 'pix', `Comprovante PIX confirmado para solicitação #${pix.id.slice(0, 8)}.`);

      return { confirmado: true, pix_solicitacao_id: pix.id };
    }

    case 'escalate_to_human': {
      const motivo = String(input.motivo ?? '');
      const contexto = String(input.contexto ?? '');

      await crm.updateLead(lead.id, { status: 'escalado' });
      await crm.addHistorico(lead.id, 'escalado', `Motivo: ${motivo}\nContexto: ${contexto}`);
      logger.warn({ leadId: lead.id, motivo }, 'Conversa escalada para atendente humano');

      return { escalado: true };
    }

    case 'mark_lead_lost': {
      const motivo = String(input.motivo ?? '');

      await crm.updateLead(lead.id, { status: 'perdido' });
      await crm.addHistorico(lead.id, 'perdido', `Lead marcado como perdido. Motivo: ${motivo}`);

      return { status: 'perdido' };
    }

    default:
      logger.warn({ tool: name }, 'Tool desconhecida solicitada pelo agente');
      return { erro: `Tool desconhecida: ${name}` };
  }
}
