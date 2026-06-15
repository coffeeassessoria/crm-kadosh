import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { IncomingMessage, MessageKey } from '../types';

const BASE_URL = env.EVOLUTION_API_URL;
const INSTANCE = env.EVOLUTION_INSTANCE;

async function callEvolutionApi(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: env.EVOLUTION_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error({ status: res.status, errorBody, path }, 'Falha ao chamar Evolution API');
    throw new Error(`Evolution API error: ${res.status}`);
  }

  return res.json();
}

/** RF01.1 / RF03.3 / RF05 — envia mensagem de texto para um contato ou grupo. */
export async function sendTextMessage(to: string, text: string) {
  return callEvolutionApi(`/message/sendText/${INSTANCE}`, {
    number: to,
    text,
  });
}

/** Envia uma imagem a partir de URL pública para um contato. Legenda é opcional. */
export async function sendImageMessage(to: string, imageUrl: string, caption?: string) {
  return callEvolutionApi(`/message/sendMedia/${INSTANCE}`, {
    number: to,
    mediatype: 'image',
    mimetype: 'image/jpeg',
    caption: caption ?? '',
    media: imageUrl,
    fileName: 'cacamba-kadosh.jpg',
  });
}

/** Marca a mensagem recebida como lida no WhatsApp. */
export async function markMessageAsRead(messageKey: MessageKey) {
  return callEvolutionApi(`/chat/markMessageAsRead/${INSTANCE}`, {
    readMessages: [messageKey],
  });
}

/** Baixa uma mídia (imagem/áudio/vídeo) recebida via webhook a partir da chave da mensagem. */
export async function downloadMedia(messageKey: MessageKey): Promise<{ buffer: Buffer; mimeType: string }> {
  const result = (await callEvolutionApi(`/chat/getBase64FromMediaMessage/${INSTANCE}`, {
    message: { key: messageKey },
    convertToMp4: false,
  })) as { base64: string; mimetype: string };

  return { buffer: Buffer.from(result.base64, 'base64'), mimeType: result.mimetype };
}

/**
 * Extrai o número de telefone (sem sufixo @s.whatsapp.net / @g.us / @lid) a partir da
 * chave de uma mensagem.
 *
 * Em `addressingMode: "lid"`, `remoteJid` traz um identificador interno (ex: "149...@lid")
 * que não é o número de telefone — o número real vem em `remoteJidAlt`.
 */
function jidToPhone(key: MessageKey): string {
  const jid = key.remoteJid.endsWith('@lid') && key.remoteJidAlt ? key.remoteJidAlt : key.remoteJid;
  return jid.split('@')[0];
}

/**
 * Normaliza o payload bruto do webhook da Evolution API (evento MESSAGES_UPSERT)
 * em uma lista de mensagens prontas para o agente processar (RF01.4).
 *
 * Mensagens de grupo (@g.us) são ignoradas, EXCETO as do grupo operacional
 * (`env.WHATSAPP_GRUPO_OPERACIONAL_ID`), que são repassadas com `isGroup: true` e
 * `groupJid` para o agente administrativo (ver agent/adminAgent).
 * Mensagens enviadas pelo próprio número (fromMe: true) são incluídas com `fromMe: true`:
 * em conversas 1:1 representam o atendimento humano respondendo manualmente, e são
 * usadas para pausar o agente por 24h para aquele lead (ver agent/index.ts
 * `handleHumanTakeover`); no grupo operacional, indicam a própria resposta do agente
 * administrativo e são descartadas (evita loop).
 */
export function parseIncomingMessages(body: unknown): IncomingMessage[] {
  const messages: IncomingMessage[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = body as any;

  if (payload?.event !== 'messages.upsert') {
    return messages;
  }

  const events = Array.isArray(payload.data) ? payload.data : [payload.data];

  for (const data of events) {
    const key = data?.key as MessageKey | undefined;
    if (!key?.remoteJid || !key.id) continue;

    const isGroup = key.remoteJid.endsWith('@g.us');
    if (isGroup && key.remoteJid !== env.WHATSAPP_GRUPO_OPERACIONAL_ID) continue;

    const base = {
      messageId: key.id,
      messageKey: key,
      from: jidToPhone(key),
      name: data.pushName as string | undefined,
      timestamp: String(data.messageTimestamp ?? Math.floor(Date.now() / 1000)),
      fromMe: key.fromMe,
      isGroup,
      ...(isGroup ? { groupJid: key.remoteJid } : {}),
    };

    const message = data.message ?? {};

    switch (data.messageType) {
      case 'conversation':
        messages.push({ ...base, type: 'text', text: message.conversation });
        break;
      case 'extendedTextMessage':
        messages.push({ ...base, type: 'text', text: message.extendedTextMessage?.text });
        break;
      case 'imageMessage':
        messages.push({
          ...base,
          type: 'image',
          mimeType: message.imageMessage?.mimetype,
          text: message.imageMessage?.caption,
        });
        break;
      case 'audioMessage':
        messages.push({
          ...base,
          type: 'audio',
          mimeType: message.audioMessage?.mimetype,
        });
        break;
      case 'videoMessage':
        messages.push({
          ...base,
          type: 'video',
          mimeType: message.videoMessage?.mimetype,
          text: message.videoMessage?.caption,
        });
        break;
      default:
        messages.push({ ...base, type: 'unsupported' });
    }
  }

  return messages;
}
