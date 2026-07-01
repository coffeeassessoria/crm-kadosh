import { GoogleGenAI } from '@google/genai';
import type { Content, Part } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as crm from '../services/crm.service';
import * as whatsapp from '../services/whatsapp.service';
import { transcribeAudio } from '../services/transcription.service';
import { generateAndSaveConversationSummary } from '../services/summary.service';
import { agentTools } from './tools';
import { runTool } from './toolHandlers';
import { buildSystemPrompt } from './systemPrompt';
import type { IncomingMessage, Lead } from '../types';

const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY });

const MAX_TOOL_ITERATIONS = 5;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ERR_STREAM_PREMATURE_CLOSE' || code === 'ECONNRESET' || code === 'ETIMEDOUT') return true;
    if (err.constructor.name === 'FetchError') return true;
  }
  return false;
}

async function callGeminiWithRetry(
  contents: Content[],
  systemInstruction: string,
  attempt = 0,
) {
  try {
    return await ai.models.generateContent({
      model: env.GOOGLE_AI_MODEL,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: agentTools }],
        maxOutputTokens: 1024,
      },
    });
  } catch (err) {
    if (attempt < MAX_RETRIES && isRetryableError(err)) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      logger.warn({ err, attempt: attempt + 1, delayMs: delay }, 'Erro de rede na API Gemini — tentando novamente');
      await new Promise((r) => setTimeout(r, delay));
      return callGeminiWithRetry(contents, systemInstruction, attempt + 1);
    }
    throw err;
  }
}

/** Duração da pausa do agente após um humano responder manualmente (RF — atendimento humano). */
const PAUSA_ATENDIMENTO_HUMANO_MS = 24 * 60 * 60 * 1000;

function isHumanTakeoverActive(lead: Lead): boolean {
  if (!lead.atendimento_humano_em) return false;
  return Date.now() - new Date(lead.atendimento_humano_em).getTime() < PAUSA_ATENDIMENTO_HUMANO_MS;
}

/** Tipos de imagem aceitos pela API de visão do Gemini. */
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** RF01.4 — converte a mensagem recebida (texto/imagem/áudio/vídeo) em partes para o Gemini. */
async function buildUserParts(msg: IncomingMessage): Promise<Part[]> {
  switch (msg.type) {
    case 'text':
      return [{ text: msg.text ?? '' }];

    case 'image': {
      const { buffer, mimeType } = await whatsapp.downloadMedia(msg.messageKey);
      if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
        return [{ text: 'Cliente enviou uma imagem em formato não suportado. Peça para descrever o que enviou.' }];
      }
      return [
        { inlineData: { mimeType, data: buffer.toString('base64') } },
        { text: msg.text || 'Cliente enviou esta imagem.' },
      ];
    }

    case 'audio': {
      const { buffer, mimeType } = await whatsapp.downloadMedia(msg.messageKey);
      const transcript = await transcribeAudio(buffer, mimeType);
      return [{
        text: transcript
          ? `[Áudio transcrito]: ${transcript}`
          : '[Cliente enviou um áudio, mas não foi possível transcrever automaticamente]',
      }];
    }

    case 'video':
      return [{ text: '[Cliente enviou um vídeo. Vídeos ainda não são processados automaticamente — peça para descrever em texto.]' }];

    default:
      return [{ text: `[Cliente enviou um conteúdo do tipo "${msg.type}", ainda não suportado. Peça para escrever a mensagem.]` }];
  }
}

/**
 * Mensagem enviada pelo próprio número (fromMe: true) — um humano respondeu
 * manualmente a um lead. Registra a mensagem no histórico e pausa o agente Kadu por 24h
 * para esse lead (RF — atendimento humano).
 */
export async function handleHumanTakeover(msg: IncomingMessage): Promise<void> {
  const lead = await crm.findLeadByPhone(msg.from);
  if (!lead) return;

  await crm.logMensagem(lead.id, 'outbound', msg.type, msg.text ?? `[${msg.type}]`, msg.messageId);
  await crm.setAtendimentoHumano(lead.id, new Date());
  logger.info({ leadId: lead.id }, 'Atendimento humano detectado — agente Kadu pausado por 24h para este lead');
}

/** RF01 — recebe uma mensagem do WhatsApp, conversa com o Gemini e responde ao cliente. */
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const lead = await crm.findOrCreateLeadByPhone(msg.from, msg.name);

  await whatsapp.markMessageAsRead(msg.messageKey).catch((err) => logger.warn({ err }, 'Falha ao marcar mensagem como lida'));

  if (isHumanTakeoverActive(lead)) {
    logger.info({ leadId: lead.id }, 'Atendimento humano ativo — agente Kadu não responde');
    await crm.logMensagem(lead.id, 'inbound', msg.type, msg.text ?? `[${msg.type}]`, msg.messageId);
    return;
  }

  const userParts = await buildUserParts(msg);

  // Para áudio, salva o texto transcrito em vez de "[audio]"
  const logConteudo =
    userParts.length === 1 && 'text' in userParts[0] && (userParts[0].text ?? '').startsWith('[Áudio transcrito]:')
      ? userParts[0].text!
      : msg.text ?? `[${msg.type}]`;

  await crm.logMensagem(lead.id, 'inbound', msg.type, logConteudo, msg.messageId);

  // Monta histórico no formato do Gemini (user/model)
  const history = await crm.getConversationHistory(lead.id, 20);
  const contents: Content[] = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    })),
    { role: 'user' as const, parts: userParts },
  ];

  let finalText = '';
  let currentLead = lead;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await callGeminiWithRetry(contents, buildSystemPrompt(currentLead));

    const functionCalls = response.functionCalls ?? [];
    finalText = (response.text ?? '').trim();

    if (functionCalls.length === 0) break;

    // Adiciona resposta do modelo ao histórico (contém os function calls)
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    // Executa as tools e coleta os resultados
    const functionResponseParts: Part[] = [];
    for (const fc of functionCalls) {
      const result = await runTool(fc.name, fc.args as Record<string, unknown>, currentLead);
      functionResponseParts.push({
        functionResponse: { name: fc.name, response: result as Record<string, unknown> },
      });
    }
    contents.push({ role: 'user', parts: functionResponseParts });

    // Recarrega o lead, pois as tools podem ter atualizado dados usados no próximo system prompt.
    const refreshed = await crm.findOrCreateLeadByPhone(msg.from);
    currentLead = refreshed;
  }

  if (finalText) {
    await whatsapp.sendTextMessage(msg.from, finalText);
    await crm.logMensagem(currentLead.id, 'outbound', 'text', finalText);
  } else {
    logger.warn({ leadId: currentLead.id }, 'Agente não gerou resposta em texto após o limite de iterações de tools');
  }

  // Gera e salva resumo da conversa de forma assíncrona (não bloqueia a resposta ao cliente)
  generateAndSaveConversationSummary(currentLead.id).catch((err) =>
    logger.error({ err, leadId: currentLead.id }, 'Erro ao gerar resumo da conversa'),
  );
}
