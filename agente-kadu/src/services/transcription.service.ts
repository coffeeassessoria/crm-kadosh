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

  // WhatsApp envia "audio/ogg; codecs=opus" — normaliza para o MIME base antes de enviar ao Whisper.
  const baseMime = mimeType.split(';')[0].trim();
  const extension = baseMime.includes('ogg') ? 'ogg' : baseMime.includes('mp3') ? 'mp3' : 'm4a';

  logger.info({ mimeType, baseMime, extension, bufferBytes: buffer.length }, 'Transcrevendo áudio via Whisper');

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: baseMime }), `audio.${extension}`);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    logger.error({ status: res.status, errorBody }, 'Falha ao transcrever áudio via Whisper');
    return null;
  }

  const data = (await res.json()) as { text: string };
  logger.info({ transcriptLength: data.text.length }, 'Áudio transcrito com sucesso');
  return data.text;
}
