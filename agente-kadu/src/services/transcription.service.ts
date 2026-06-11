import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * RF01.4 — transcreve áudios recebidos via WhatsApp usando a API Whisper da OpenAI.
 * Retorna `null` se a transcrição não estiver configurada ou falhar; nesse caso
 * o agente segue o fallback definido no prompt ("Não consegui ouvir bem...").
 */
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string | null> {
  if (!env.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY não configurada — pulando transcrição de áudio');
    return null;
  }

  const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp3') ? 'mp3' : 'm4a';

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), `audio.${extension}`);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    logger.error({ status: res.status }, 'Falha ao transcrever áudio via Whisper');
    return null;
  }

  const data = (await res.json()) as { text: string };
  return data.text;
}
