import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getConversationHistory, updateResumoConversa } from './crm.service';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um analista de vendas da Kadosh Mini Caçambas. Analise a conversa abaixo entre o cliente e o agente de vendas (Kadu) e gere um resumo objetivo em português para orientar o próximo atendimento.

O resumo deve conter (quando disponível):
- O que o cliente precisa (tipo de resíduo, bairro/endereço, quantidade de caçambas)
- Estágio atual da negociação
- Pontos de atenção ou objeções levantadas
- Próximo passo recomendado

Seja conciso (máximo 5 linhas). Responda apenas com o resumo, sem títulos ou marcadores.`;

/**
 * Gera um resumo da conversa do lead usando Claude Haiku e salva no CRM.
 * Chamada de forma assíncrona — não bloqueia a resposta ao cliente.
 */
export async function generateAndSaveConversationSummary(leadId: string): Promise<void> {
  const history = await getConversationHistory(leadId, 40);
  if (history.length < 2) return;

  const conversationText = history
    .map((m) => {
      const speaker = m.role === 'user' ? 'Cliente' : 'Kadu';
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${speaker}: ${text}`;
    })
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: conversationText }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  if (!textBlock) return;

  await updateResumoConversa(leadId, textBlock.text.trim());
  logger.debug({ leadId }, 'Resumo da conversa gerado e salvo');
}
