import Anthropic from '@anthropic-ai/sdk';
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

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const MAX_TOOL_ITERATIONS = 5;

/** Duração da pausa do agente após um humano responder manualmente (RF — atendimento humano). */
const PAUSA_ATENDIMENTO_HUMANO_MS = 24 * 60 * 60 * 1000;

function isHumanTakeoverActive(lead: Lead): boolean {
  if (!lead.atendimento_humano_em) return false;
  return Date.now() - new Date(lead.atendimento_humano_em).getTime() < PAUSA_ATENDIMENTO_HUMANO_MS;
}

/** Tipos de imagem aceitos pela API de visão da Anthropic. */
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** RF01.4 — converte a mensagem recebida (texto/imagem/áudio/vídeo) em conteúdo para o Claude. */
async function buildUserContent(msg: IncomingMessage): Promise<Anthropic.MessageParam['content']> {
  switch (msg.type) {
    case 'text':
      return msg.text ?? '';

    case 'image': {
      const { buffer, mimeType } = await whatsapp.downloadMedia(msg.messageKey);
      if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
        return 'Cliente enviou uma imagem em formato não suportado. Peça para descrever o que enviou.';
      }

      const content: Anthropic.MessageParam['content'] = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as Anthropic.ImageBlockParam.Source['media_type'],
            data: buffer.toString('base64'),
          },
        },
        { type: 'text', text: msg.text || 'Cliente enviou esta imagem.' },
      ];
      return content;
    }

    case 'audio': {
      const { buffer, mimeType } = await whatsapp.downloadMedia(msg.messageKey);
      const transcript = await transcribeAudio(buffer, mimeType);

      return transcript
        ? `[Áudio transcrito]: ${transcript}`
        : '[Cliente enviou um áudio, mas não foi possível transcrever automaticamente]';
    }

    case 'video':
      return '[Cliente enviou um vídeo. Vídeos ainda não são processados automaticamente — peça para descrever em texto.]';

    default:
      return `[Cliente enviou um conteúdo do tipo "${msg.type}", ainda não suportado. Peça para escrever a mensagem.]`;
  }
}

/**
 * Mensagem enviada pelo próprio número (fromMe: true) — um humano (Adriano) respondeu
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

/** RF01 — recebe uma mensagem do WhatsApp, conversa com o LLM e responde ao cliente. */
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const lead = await crm.findOrCreateLeadByPhone(msg.from, msg.name);

  await whatsapp.markMessageAsRead(msg.messageKey).catch((err) => logger.warn({ err }, 'Falha ao marcar mensagem como lida'));

  if (isHumanTakeoverActive(lead)) {
    logger.info({ leadId: lead.id }, 'Atendimento humano ativo — agente Kadu não responde');
    // Ainda registra a mensagem recebida mesmo sem responder
    await crm.logMensagem(lead.id, 'inbound', msg.type, msg.text ?? `[${msg.type}]`, msg.messageId);
    return;
  }

  // Processa o conteúdo antes de logar para capturar a transcrição real do áudio
  const userContent = await buildUserContent(msg);

  // Para áudio, salva o texto transcrito em vez de "[audio]"
  const logConteudo =
    typeof userContent === 'string' && userContent.startsWith('[Áudio transcrito]:')
      ? userContent
      : msg.text ?? `[${msg.type}]`;
  await crm.logMensagem(lead.id, 'inbound', msg.type, logConteudo, msg.messageId);
  const history = await crm.getConversationHistory(lead.id, 20);

  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: userContent }];

  let finalText = '';
  let currentLead = lead;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(currentLead),
      tools: agentTools,
      messages,
    });

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    const textBlocks = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text');
    finalText = textBlocks.map((block) => block.text).join('\n').trim();

    if (toolUses.length === 0) break;

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await runTool(toolUse.name, toolUse.input as Record<string, unknown>, currentLead);
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });

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
