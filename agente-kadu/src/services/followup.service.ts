import { GoogleGenAI } from '@google/genai';
import type { Content } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as crm from '../services/crm.service';
import * as whatsapp from '../services/whatsapp.service';
import { buildSystemPrompt } from '../agent/systemPrompt';
import type { Lead } from '../types';

const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY });

/** Minutos de silêncio do cliente após a última mensagem do Kadu que disparam o follow-up automático. */
const SILENCIO_MINUTOS = 2;

/**
 * Acima disso não é mais "o cliente sumiu no meio da conversa" — é um lead frio/antigo, e a
 * rotina não deve mexer nele (evita reabrir conversas mortas ou martelar a API por leads
 * antigos nunca marcados como resolvidos). Ver incidente 2026-07-23: sem esse teto, TODO lead
 * não resolvido (371 no CRM) virava candidato em toda execução, estourou a cota diária do
 * Gemini em ~18min.
 */
const SILENCIO_MAXIMO_MINUTOS = 30;

/** Status em que não faz sentido reengajar automaticamente (já resolvidos ou aguardando humano). */
const STATUS_SEM_FOLLOWUP: string[] = ['agendado', 'convertido', 'perdido', 'escalado'];

/** Mesma janela usada pra pausa de atendimento humano no agente principal (ver agent/index.ts). */
const PAUSA_ATENDIMENTO_HUMANO_MS = 24 * 60 * 60 * 1000;

function isHumanTakeoverActive(lead: Lead): boolean {
  if (!lead.atendimento_humano_em) return false;
  return Date.now() - new Date(lead.atendimento_humano_em).getTime() < PAUSA_ATENDIMENTO_HUMANO_MS;
}

const INSTRUCAO_FOLLOWUP = `

## FOLLOW-UP AUTOMÁTICO (SILÊNCIO DO CLIENTE)
O cliente parou de responder a conversa abaixo há alguns minutos. Envie UMA mensagem curta,
cordial e prestativa pra tentar retomar a conversa e resgatar a venda — sem soar insistente
ou repetir tudo que já foi perguntado. No máximo uma pergunta ou chamada pra ação. Se já
tinha tudo pra fechar o agendamento, retome exatamente esse ponto. Responda só com o texto
da mensagem que será enviada ao cliente pelo WhatsApp, sem aspas nem comentários.`;

/** Turno final sintético — a API do Gemini exige que `contents` termine num turno "user", nunca "model". */
const GATILHO_FOLLOWUP: Content = {
  role: 'user',
  parts: [{ text: '[sistema: cliente sem resposta — gere o follow-up conforme as instruções acima]' }],
};

/** Gera e envia um follow-up cordial pra um lead específico, a partir da última mensagem já carregada. */
async function tentarFollowUp(lead: Lead, ultimaMensagem: crm.UltimaMensagemLead): Promise<void> {
  if (!lead.telefone) return;
  if (ultimaMensagem.direcao !== 'outbound' || ultimaMensagem.is_followup) return;

  const idadeMs = Date.now() - new Date(ultimaMensagem.created_at).getTime();
  if (idadeMs < SILENCIO_MINUTOS * 60 * 1000) return;
  if (idadeMs > SILENCIO_MAXIMO_MINUTOS * 60 * 1000) return;

  const history = await crm.getConversationHistory(lead.id, 20);
  if (history.length === 0) return;

  const contents: Content[] = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    })),
    GATILHO_FOLLOWUP,
  ];

  const response = await ai.models.generateContent({
    model: env.GOOGLE_AI_MODEL,
    contents,
    config: {
      systemInstruction: buildSystemPrompt(lead) + INSTRUCAO_FOLLOWUP,
      maxOutputTokens: 300,
    },
  });

  const texto = (response.text ?? '').trim();
  if (!texto) return;

  await whatsapp.sendTextMessage(lead.telefone, texto);
  await crm.logMensagem(lead.id, 'outbound', 'text', texto, undefined, true);
  await crm.addHistorico(lead.id, 'followup', 'Follow-up automático enviado após silêncio do cliente.');
  logger.info({ leadId: lead.id }, 'Follow-up automático enviado');
}

let execucaoEmAndamento = false;

/** Percorre leads em conversa ativa e dispara UM follow-up pra quem ficou em silêncio recente após uma mensagem do Kadu. */
export async function executarRotinaFollowUp(): Promise<void> {
  // Evita sweeps sobrepostos se uma execução anterior ainda não terminou (ex: Gemini lento/instável).
  if (execucaoEmAndamento) {
    logger.warn('Rotina de follow-up ainda rodando da execução anterior — pulando este ciclo');
    return;
  }
  execucaoEmAndamento = true;

  try {
    const [leads, ultimasMensagens] = await Promise.all([
      crm.leadsAtivosParaFollowUp(STATUS_SEM_FOLLOWUP),
      crm.getUltimasMensagensRecentes(SILENCIO_MAXIMO_MINUTOS),
    ]);

    for (const lead of leads) {
      const ultimaMensagem = ultimasMensagens.get(lead.id);
      // Sem mensagem dentro da janela: ou não tem silêncio recente, ou o lead está frio — não mexe.
      if (!ultimaMensagem) continue;
      if (isHumanTakeoverActive(lead)) continue;

      try {
        await tentarFollowUp(lead, ultimaMensagem);
      } catch (err) {
        logger.error({ err, leadId: lead.id }, 'Falha ao processar follow-up automático do lead');
      }
    }
  } finally {
    execucaoEmAndamento = false;
  }
}
