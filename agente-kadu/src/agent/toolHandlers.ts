import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as crm from '../services/crm.service';
import * as whatsapp from '../services/whatsapp.service';
import { criarAgendamentoCompleto } from '../services/agendamento.service';
import type { Lead } from '../types';

function calcularValorLocacao(quantidade: number, diasPermanencia: number, dataEntrega: string): number {
  const { preco } = crm.precoDiariaParaData(dataEntrega);
  return quantidade * preco + quantidade * Math.max(0, diasPermanencia - 1) * env.DIARIA_ADICIONAL;
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
      const quantidade = Number(input.quantidade_cacambas);
      const diasPermanencia = Math.max(1, Number(input.dias_permanencia ?? 1));
      return crm.checkAvailability(String(input.data), quantidade, diasPermanencia);
    }

    case 'create_appointment': {
      const dataEntrega = String(input.data_entrega);
      const diasPermanencia = Math.max(1, Number(input.dias_permanencia ?? 1));
      const quantidade = Number(input.quantidade_cacambas);
      const valorTotal = calcularValorLocacao(quantidade, diasPermanencia, dataEntrega);

      const { agendamento, dataRetirada, googleEventId, rota } = await criarAgendamentoCompleto({
        leadId: lead.id,
        nomeCliente: String(input.nome_cliente),
        telefone: String(input.telefone ?? lead.telefone ?? ''),
        enderecoCompleto: String(input.endereco_completo),
        bairro: String(input.bairro),
        tipoResiduo: String(input.tipo_residuo),
        quantidadeCacambas: quantidade,
        dataEntrega,
        horarioEntrega: (input.horario_entrega as string | undefined) ?? null,
        diasPermanencia,
        valorTotal,
      });

      return {
        agendamento_id: agendamento.id,
        data_retirada: dataRetirada,
        rota,
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

    case 'send_social_proof': {
      const urls = (env.SOCIAL_PROOF_URLS ?? '').split(',').map((u) => u.trim()).filter(Boolean);

      if (urls.length === 0) {
        logger.warn({ leadId: lead.id }, 'SOCIAL_PROOF_URLS não configurado — fotos não enviadas');
        return { enviado: false, motivo: 'sem_imagens_configuradas' };
      }

      const telefone = lead.telefone;
      if (!telefone) return { enviado: false, motivo: 'telefone_nao_disponivel' };

      // Envia no máximo 3 fotos por conversa
      const fotosParaEnviar = urls.slice(0, 3);

      // Primeira foto com legenda de apresentação
      await whatsapp.sendImageMessage(
        telefone,
        fotosParaEnviar[0],
        '🧡 Olha nossa mini caçamba aqui! Entrega rápida em Sinop-MT 🚛',
      );

      // Demais fotos sem legenda, com intervalo para não cair em spam
      for (const url of fotosParaEnviar.slice(1)) {
        await new Promise((r) => setTimeout(r, 1200));
        await whatsapp.sendImageMessage(telefone, url);
      }

      await crm.addHistorico(lead.id, 'prova_social', `${fotosParaEnviar.length} foto(s) das caçambas enviada(s) ao cliente.`);

      return { enviado: true, quantidade: fotosParaEnviar.length };
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
