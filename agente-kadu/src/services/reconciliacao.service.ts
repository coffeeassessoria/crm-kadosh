import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import * as crm from './crm.service';
import * as whatsapp from './whatsapp.service';
import type { PropostaAgendamento } from '../types';

const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY });

const SYSTEM_PROMPT = `Você é um analista que revisa conversas de WhatsApp da Kadosh Mini Caçambas
(locação de mini caçambas em Sinop-MT) pra identificar se uma locação foi combinada com o
cliente mas ainda não foi registrada no sistema como agendamento — comum quando um humano
assume a conversa manualmente e fecha o negócio por fora do fluxo automático.

Só considere que "fechou" (fechou = true) se houver confirmação EXPLÍCITA, entre o cliente e
quem estiver atendendo (Kadu ou humano), de TODOS estes pontos:
- quantidade de caçambas
- endereço completo de entrega
- data de entrega
- valor combinado

Concordância vaga ("beleza", "pode ser", "combinado") sem esses dados explícitos NÃO conta.
Se não tiver certeza ou faltar qualquer um desses dados, responda fechou = false — é preferível
deixar passar um caso real do que criar um agendamento com dado errado ou inventado.

Nunca invente endereço, valor ou data que não apareçam literalmente na conversa.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fechou: { type: Type.BOOLEAN, description: 'true somente se todos os dados obrigatórios foram confirmados explicitamente' },
    justificativa: { type: Type.STRING, description: 'Resumo curto (1-2 frases) do que embasa a decisão, citando a conversa' },
    nome_cliente: { type: Type.STRING },
    endereco_completo: { type: Type.STRING },
    bairro: { type: Type.STRING },
    tipo_residuo: { type: Type.STRING },
    quantidade_cacambas: { type: Type.INTEGER },
    data_entrega: { type: Type.STRING, description: 'Formato YYYY-MM-DD' },
    horario_entrega: { type: Type.STRING, description: 'Formato HH:MM, se mencionado' },
    dias_permanencia: { type: Type.INTEGER, description: 'Padrão 1 se não especificado' },
    valor_total: { type: Type.NUMBER },
  },
  required: ['fechou', 'justificativa'],
};

interface AnaliseFechamento {
  fechou: boolean;
  justificativa: string;
  nome_cliente?: string;
  endereco_completo?: string;
  bairro?: string;
  tipo_residuo?: string;
  quantidade_cacambas?: number;
  data_entrega?: string;
  horario_entrega?: string;
  dias_permanencia?: number;
  valor_total?: number;
}

const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const HORA_REGEX = /^\d{2}:\d{2}$/;

/** Usa o Gemini pra ler a conversa completa de um lead e decidir se um negócio foi fechado. */
async function analisarConversaParaFechamento(leadId: string, dataConversaISO: string): Promise<AnaliseFechamento> {
  const history = await crm.getConversationHistory(leadId, 60);
  const conversationText = history
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Kadu/Atendente'}: ${m.content}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: env.GOOGLE_AI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Data de hoje (dia desta conversa): ${dataConversaISO}. Use isso pra converter qualquer data relativa ("amanhã", "semana que vem", "dia 08/07") pro formato YYYY-MM-DD com o ano correto.\n\n${conversationText}`,
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 1000,
      // Classificação estruturada com critério explícito — não precisa de "thinking", e sem
      // desligar isso o modelo estoura o limite de tokens só pensando e corta o JSON no meio.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return JSON.parse(response.text ?? '{"fechou": false, "justificativa": "resposta vazia"}') as AnaliseFechamento;
}

/**
 * Revisa todos os leads com conversa em `dataISO` que ainda não têm agendamento nem proposta
 * pendente, e cria uma proposta (pendente de confirmação humana) pra cada um que parece ter
 * fechado negócio sem ter virado agendamento no CRM.
 */
export async function revisarLeadsDoDia(dataISO: string): Promise<PropostaAgendamento[]> {
  const candidatos = await crm.leadsParaRevisarFechamento(dataISO);
  const propostas: PropostaAgendamento[] = [];

  for (const lead of candidatos) {
    try {
      const analise = await analisarConversaParaFechamento(lead.id, dataISO);
      if (!analise.fechou) continue;

      if (!analise.endereco_completo || !analise.quantidade_cacambas || !analise.data_entrega || !analise.valor_total) {
        logger.warn({ leadId: lead.id, analise }, 'Análise indicou fechamento mas faltam dados obrigatórios — ignorando');
        continue;
      }

      if (!DATA_ISO_REGEX.test(analise.data_entrega)) {
        logger.warn({ leadId: lead.id, analise }, 'Análise retornou data de entrega em formato inválido — ignorando');
        continue;
      }

      const horarioValido = analise.horario_entrega && HORA_REGEX.test(analise.horario_entrega) ? analise.horario_entrega : null;

      const proposta = await crm.criarPropostaAgendamento({
        leadId: lead.id,
        nomeCliente: analise.nome_cliente || lead.nome,
        telefone: lead.telefone ?? '',
        enderecoCompleto: analise.endereco_completo,
        bairro: analise.bairro ?? lead.bairro ?? null,
        tipoResiduo: analise.tipo_residuo ?? lead.tipo_residuo ?? null,
        quantidadeCacambas: analise.quantidade_cacambas,
        dataEntrega: analise.data_entrega,
        horarioEntrega: horarioValido,
        diasPermanencia: Math.max(1, analise.dias_permanencia ?? 1),
        valorTotal: analise.valor_total,
        justificativa: analise.justificativa,
      });

      propostas.push(proposta);
    } catch (err) {
      logger.error({ err, leadId: lead.id }, 'Falha ao analisar conversa pra reconciliação de agendamento');
    }
  }

  return propostas;
}

function formatarProposta(p: PropostaAgendamento, ordem: number): string {
  return [
    `\n[${ordem}] *${p.nome_cliente}* (${p.telefone})`,
    `   Endereço: ${p.endereco_completo}`,
    `   ${p.quantidade_cacambas} caçamba(s), entrega ${p.data_entrega}, R$ ${Number(p.valor_total).toFixed(2)}`,
    `   Motivo: ${p.justificativa}`,
  ].join('\n');
}

/** Roda a revisão do dia e, se achar propostas, avisa o grupo operacional pra confirmação. */
export async function executarReconciliacaoDiaria(dataISO: string): Promise<void> {
  const propostas = await revisarLeadsDoDia(dataISO);

  if (propostas.length === 0) {
    logger.info({ data: dataISO }, 'Reconciliação diária: nenhuma proposta de agendamento encontrada');
    return;
  }

  const texto = [
    `🔍 *Reconciliação de agendamentos — ${dataISO}*`,
    '',
    `Encontrei ${propostas.length} conversa(s) de hoje que parecem ter fechado negócio mas ainda não viraram agendamento no CRM:`,
    propostas.map((p, i) => formatarProposta(p, i + 1)).join('\n'),
    '',
    'Responda "Kadu, confirma [nome]" pra criar o agendamento, "Kadu, descarta [nome]" se não for pra criar, ou "Kadu, confirma todos" pra criar todos de uma vez.',
  ].join('\n');

  await whatsapp.sendTextMessage(env.WHATSAPP_GRUPO_OPERACIONAL_ID, texto);
  logger.info({ data: dataISO, propostas: propostas.length }, 'Reconciliação diária: propostas enviadas ao grupo operacional');
}
