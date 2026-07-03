import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import type { Lead } from '../types';

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'prompts', 'system-prompt-v1.md');
const template = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

/** RNF03.1 — monta o system prompt versionado com os dados dinâmicos da conversa. */
export function buildSystemPrompt(lead: Lead | null): string {
  const dadosColetados = JSON.stringify(
    {
      tipo_residuo: lead?.tipo_residuo ?? null,
      bairro: lead?.bairro ?? null,
      endereco: lead?.endereco ?? null,
      quantidade_cacambas: lead?.quantidade_cacambas ?? null,
      prazo_data: lead?.prazo_data ?? null,
    },
    null,
    2,
  );

  const agora = new Date().toLocaleString('pt-BR', { timeZone: env.TIMEZONE });

  return template
    .replace(/{{PRECO_LOCACAO}}/g, String(env.PRECO_LOCACAO))
    .replace(/{{PRECO_LOCACAO_PROMOCIONAL}}/g, String(env.PRECO_LOCACAO_PROMOCIONAL))
    .replace(/{{DIARIA_ADICIONAL}}/g, String(env.DIARIA_ADICIONAL))
    .replace(/{{HORARIO_COMERCIAL_INICIO}}/g, env.HORARIO_COMERCIAL_INICIO)
    .replace(/{{HORARIO_COMERCIAL_FIM}}/g, env.HORARIO_COMERCIAL_FIM)
    .replace(/{{CHAVE_PIX}}/g, env.CHAVE_PIX || '(chave PIX não configurada)')
    .replace(/{{DATA_HORA_ATUAL}}/g, agora)
    .replace(/{{NOME_CLIENTE}}/g, lead?.nome ?? '(ainda não informado)')
    .replace(/{{STATUS_LEAD}}/g, lead?.status ?? 'novo')
    .replace(/{{DADOS_COLETADOS}}/g, dadosColetados);
}
