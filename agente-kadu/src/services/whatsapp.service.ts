import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { AdReferral, IncomingMessage, MessageKey } from '../types';

const BASE_URL = env.EVOLUTION_API_URL;
const INSTANCE = env.EVOLUTION_INSTANCE;

/**
 * IDs de mensagens enviadas via API pelo próprio Kadu — usados para distinguir
 * respostas automáticas do bot de mensagens manuais do operador humano.
 * TTL de 5 min por entrada para evitar crescimento ilimitado.
 */
const botMessageIds = new Set<string>();

export function isBotMessage(messageId: string): boolean {
  return botMessageIds.has(messageId);
}

function trackBotMessage(id: string) {
  botMessageIds.add(id);
  setTimeout(() => botMessageIds.delete(id), 5 * 60 * 1000);
}

function trackOrWarn(result: { key?: { id?: string } }, context: string) {
  if (result?.key?.id) {
    trackBotMessage(result.key.id);
  } else {
    logger.warn({ result, context }, 'Evolution API não retornou key.id — resposta do bot pode acionar handleHumanTakeover');
  }
}

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
  const result = await callEvolutionApi(`/message/sendText/${INSTANCE}`, { number: to, text }) as { key?: { id?: string } };
  trackOrWarn(result, 'sendTextMessage');
  return result;
}

/**
 * Alerta o grupo operacional quando o agente Kadu falha ao responder um lead
 * (ex: API do Gemini fora do ar/sem créditos). Cooldown evita floodar o grupo
 * quando várias mensagens falham em sequência durante uma queda prolongada.
 */
let lastErrorAlertAt = 0;
const ERROR_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

export async function alertOperationalGroup(text: string): Promise<void> {
  const now = Date.now();
  if (now - lastErrorAlertAt < ERROR_ALERT_COOLDOWN_MS) return;
  lastErrorAlertAt = now;

  await sendTextMessage(env.WHATSAPP_GRUPO_OPERACIONAL_ID, text).catch((err) =>
    logger.error({ err }, 'Falha ao enviar alerta pro grupo operacional'),
  );
}

/** Envia uma imagem a partir de URL pública para um contato. Legenda é opcional. */
export async function sendImageMessage(to: string, imageUrl: string, caption?: string) {
  const result = await callEvolutionApi(`/message/sendMedia/${INSTANCE}`, {
    number: to,
    mediatype: 'image',
    mimetype: 'image/jpeg',
    caption: caption ?? '',
    media: imageUrl,
    fileName: 'cacamba-kadosh.jpg',
  }) as { key?: { id?: string } };
  trackOrWarn(result, 'sendImageMessage');
  return result;
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
/**
 * Extrai os dados de origem de anúncio ("Clique para o WhatsApp") de uma mensagem recebida,
 * se presentes. No protocolo do WhatsApp (Baileys/Evolution API) isso vem em
 * contextInfo.externalAdReplyInfo — checa os caminhos mais prováveis, já que a Evolution API
 * pode normalizar a estrutura de forma diferente do Baileys puro.
 *
 * NUNCA testado contra um payload real de anúncio ainda — se o rastreamento não aparecer nos
 * primeiros leads, comparar com `leads.primeiro_contato_raw` (guardado pra esse diagnóstico)
 * e ajustar os caminhos abaixo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAdReferral(data: any): AdReferral | undefined {
  const info =
    data?.contextInfo?.externalAdReplyInfo ??
    data?.message?.extendedTextMessage?.contextInfo?.externalAdReplyInfo ??
    data?.message?.contextInfo?.externalAdReplyInfo ??
    data?.message?.conversation?.contextInfo?.externalAdReplyInfo;

  if (!info) return undefined;

  return {
    titulo: info.title ?? null,
    corpo: info.body ?? null,
    tipoFonte: info.sourceType ?? null,
    idFonte: info.sourceId ?? null,
    urlFonte: info.sourceUrl ?? null,
    ctwaClid: info.ctwaClid ?? info.ctwa_clid ?? null,
  };
}

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

    // Eventos de chamada de voz/vídeo chegam pelo mesmo webhook messages.upsert (Baileys/Evolution),
    // com messageType "unknown" e message.call preenchido. O remoteJid de uma chamada costuma vir
    // como "...@lid" sem remoteJidAlt (número real ausente), então não dá pra responder nem faz
    // sentido criar lead — ignora antes de virar um "Lead WhatsApp" fantasma que trava tentando
    // enviar mensagem pra um JID que não existe (ver incidente 2026-07-17).
    if (data?.message?.call) continue;

    const isGroup = key.remoteJid.endsWith('@g.us');
    if (isGroup && key.remoteJid !== env.WHATSAPP_GRUPO_OPERACIONAL_ID) continue;

    const adReferral = isGroup ? undefined : extractAdReferral(data);

    const base = {
      messageId: key.id,
      messageKey: key,
      from: jidToPhone(key),
      name: data.pushName as string | undefined,
      timestamp: String(data.messageTimestamp ?? Math.floor(Date.now() / 1000)),
      fromMe: key.fromMe,
      isGroup,
      ...(isGroup ? { groupJid: key.remoteJid } : {}),
      ...(adReferral ? { adReferral } : {}),
      // Guardado só pra diagnóstico de rastreamento de anúncio — usado apenas na criação de
      // lead novo (ver crm.service.ts findOrCreateLeadByPhone), descartado depois.
      rawFirstMessage: data,
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
