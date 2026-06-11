import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import * as whatsapp from '../../services/whatsapp.service';
import { isWithinRateLimit } from '../../middleware/rateLimiter';
import { adminTools } from './tools';
import { runAdminTool } from './toolHandlers';
import { buildAdminSystemPrompt } from './systemPrompt';
import type { IncomingMessage } from '../../types';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const MAX_TOOL_ITERATIONS = 5;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Aciona o agente administrativo quando a mensagem do grupo contém esta palavra (busca por palavra, case-insensitive). */
const TRIGGER_REGEX = new RegExp(`\\b${escapeRegExp(env.AGENTE_ADMIN_TRIGGER)}\\b`, 'i');

/**
 * Agente administrativo/financeiro ("Kadu Financeiro") — responde no grupo operacional
 * do WhatsApp quando mencionado pela palavra-gatilho (env.AGENTE_ADMIN_TRIGGER).
 *
 * Diferente do agente SDR (ver ../index.ts), esta conversa é STATELESS: cada menção
 * é tratada como uma pergunta independente, sem histórico de mensagens nem lead
 * associado — as tools sempre buscam dados frescos do CRM.
 */
export async function handleAdminGroupMessage(msg: IncomingMessage): Promise<void> {
  if (msg.type !== 'text' || !msg.text || !msg.groupJid) return;
  if (!TRIGGER_REGEX.test(msg.text)) return;

  if (!isWithinRateLimit(`admin:${msg.groupJid}`)) {
    logger.warn({ groupJid: msg.groupJid }, 'Rate limit excedido — mensagem do agente administrativo ignorada');
    return;
  }

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: msg.text }];

  let finalText = '';

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: buildAdminSystemPrompt(),
      tools: adminTools,
      messages,
    });

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    const textBlocks = response.content.filter((block): block is Anthropic.TextBlock => block.type === 'text');
    finalText = textBlocks.map((block) => block.text).join('\n').trim();

    if (toolUses.length === 0) break;

    messages.push({ role: 'assistant', content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await runAdminTool(toolUse.name, toolUse.input as Record<string, unknown>);
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  if (finalText) {
    await whatsapp.sendTextMessage(msg.groupJid, finalText);
  } else {
    logger.warn({ groupJid: msg.groupJid }, 'Agente administrativo não gerou resposta em texto após o limite de iterações de tools');
  }
}
