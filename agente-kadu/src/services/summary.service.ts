import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { getConversationHistory, updateResumoConversa } from './crm.service';

const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY });

const SYSTEM_PROMPT = `Você é um analista de vendas da Kadosh Mini Caçambas. Analise a conversa abaixo entre o cliente e o agente de vendas (Kadu) e gere um resumo objetivo em português para orientar o próximo atendimento.

O resumo deve conter (quando disponível):
- O que o cliente precisa (tipo de resíduo, bairro/endereço, quantidade de caçambas)
- Estágio atual da negociação
- Pontos de atenção ou objeções levantadas
- Próximo passo recomendado

Seja conciso (máximo 5 linhas). Responda apenas com o resumo, sem títulos ou marcadores.`;

/**
 * Gera um resumo da conversa do lead usando Gemini Flash e salva no CRM.
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

  const response = await ai.models.generateContent({
    model: env.GOOGLE_AI_MODEL,
    contents: [{ role: 'user', parts: [{ text: conversationText }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      maxOutputTokens: 300,
      // Resumo simples, não precisa de "thinking" — sem isso o modelo gasta boa parte do
      // limite de tokens só pensando e o resumo sai cortado (ou vazio).
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const resumo = (response.text ?? '').trim();
  if (!resumo) return;

  await updateResumoConversa(leadId, resumo);
  logger.debug({ leadId }, 'Resumo da conversa gerado e salvo');
}
