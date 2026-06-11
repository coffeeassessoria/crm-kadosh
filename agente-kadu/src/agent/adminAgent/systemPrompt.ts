import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';

const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'prompts', 'admin-prompt-v1.md');
const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

/** RNF03.1 — monta o system prompt versionado do agente administrativo/financeiro. */
export function buildAdminSystemPrompt(): string {
  const agora = new Date().toLocaleString('pt-BR', { timeZone: env.TIMEZONE });

  return template
    .replace(/{{NOME_AGENTE_ADMIN}}/g, env.AGENTE_ADMIN_NOME)
    .replace(/{{DATA_HORA_ATUAL}}/g, agora)
    .replace(/{{TIMEZONE}}/g, env.TIMEZONE);
}
