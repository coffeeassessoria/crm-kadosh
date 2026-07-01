import { GoogleGenAI } from '@google/genai';
import type { Content, Part } from '@google/genai';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import * as whatsapp from '../../services/whatsapp.service';
import { isWithinRateLimit } from '../../middleware/rateLimiter';
import { adminTools } from './tools';
import { runAdminTool } from './toolHandlers';
import { buildAdminSystemPrompt } from './systemPrompt';
import type { IncomingMessage } from '../../types';

const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY });

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
 * Conversa STATELESS: cada menção é tratada como pergunta independente.
 */
export async function handleAdminGroupMessage(msg: IncomingMessage): Promise<void> {
  if (msg.type !== 'text' || !msg.text || !msg.groupJid) return;
  if (!TRIGGER_REGEX.test(msg.text)) return;

  if (!isWithinRateLimit(`admin:${msg.groupJid}`)) {
    logger.warn({ groupJid: msg.groupJid }, 'Rate limit excedido — mensagem do agente administrativo ignorada');
    return;
  }

  const contents: Content[] = [{ role: 'user', parts: [{ text: msg.text }] }];

  let finalText = '';

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await ai.models.generateContent({
      model: env.GOOGLE_AI_MODEL,
      contents,
      config: {
        systemInstruction: buildAdminSystemPrompt(),
        tools: [{ functionDeclarations: adminTools }],
        maxOutputTokens: 1024,
      },
    });

    const functionCalls = response.functionCalls ?? [];
    finalText = (response.text ?? '').trim();

    if (functionCalls.length === 0) break;

    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) contents.push(modelContent);

    const functionResponseParts: Part[] = [];
    for (const fc of functionCalls) {
      const result = await runAdminTool(fc.name, fc.args as Record<string, unknown>);
      functionResponseParts.push({
        functionResponse: { name: fc.name, response: result as Record<string, unknown> },
      });
    }
    contents.push({ role: 'user', parts: functionResponseParts });
  }

  if (finalText) {
    await whatsapp.sendTextMessage(msg.groupJid, finalText);
  } else {
    logger.warn({ groupJid: msg.groupJid }, 'Agente administrativo não gerou resposta em texto após o limite de iterações de tools');
  }
}
