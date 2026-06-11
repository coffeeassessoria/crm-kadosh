import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tools disponíveis para o agente administrativo/financeiro ("Kadu Financeiro"),
 * usado no grupo operacional do WhatsApp. Todas read-only (v1).
 * As implementações ficam em ./toolHandlers.ts.
 */
export const adminTools: Anthropic.Tool[] = [
  {
    name: 'get_agenda',
    description:
      'Retorna as entregas e retiradas confirmadas para o período pedido, com endereço, ' +
      'cliente, horário e link de rota. Use "hoje" como padrão se o período não for especificado.',
    input_schema: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          enum: ['hoje', 'amanha', 'semana'],
          description: '"semana" cobre os próximos 7 dias (hoje + 6)',
        },
      },
      required: ['periodo'],
    },
  },
  {
    name: 'get_resumo_financeiro',
    description:
      'Retorna o faturamento confirmado (agendamentos com status confirmado, por data de entrega) ' +
      'e o status dos sinais PIX (pendentes e confirmados, com quantidade e valor) no período pedido. ' +
      'Use "mes" (mês corrente) como padrão se o período não for especificado.',
    input_schema: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          enum: ['hoje', 'semana', 'mes'],
          description: '"semana" cobre os próximos 7 dias (hoje + 6); "mes" é o mês corrente',
        },
      },
      required: ['periodo'],
    },
  },
  {
    name: 'get_funil_leads',
    description:
      'Retorna a contagem de leads por etapa do Kanban (Novo, Em Contato, Agendado, ' +
      'Sinal Pendente, Escalado, Convertido, Perdido).',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];
