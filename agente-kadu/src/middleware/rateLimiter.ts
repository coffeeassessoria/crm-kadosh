import { env } from '../config/env';

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/**
 * RNF01.4 — limite simples de mensagens por minuto por número de telefone,
 * para evitar spam/loops acionando o LLM repetidamente.
 */
export function isWithinRateLimit(phone: string): boolean {
  const now = Date.now();
  const recent = (hits.get(phone) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  recent.push(now);
  hits.set(phone, recent);
  return recent.length <= env.RATE_LIMIT_MAX_PER_MINUTE;
}
