import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tools disponíveis para o agente Kadu (PRD seção 6 — "TOOLS DISPONÍVEIS").
 * As implementações ficam em ./toolHandlers.ts.
 */
export const agentTools: Anthropic.Tool[] = [
  {
    name: 'save_address',
    description:
      'Salva no CRM o endereço completo de entrega (rua, número, CEP e ponto de referência/complemento) ' +
      'e o bairro, se o cliente mencionar. Chame assim que o cliente informar o endereço de entrega.',
    input_schema: {
      type: 'object',
      properties: {
        endereco_completo: {
          type: 'string',
          description: 'Endereço completo: rua, número, CEP e ponto de referência/complemento',
        },
        bairro: { type: 'string', description: 'Bairro informado espontaneamente pelo cliente (opcional)' },
      },
      required: ['endereco_completo'],
    },
  },
  {
    name: 'check_availability',
    description:
      'Verifica a disponibilidade de agenda para uma data de entrega, evitando conflitos (RF03.4). ' +
      'Chame antes de propor uma data ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Data desejada no formato YYYY-MM-DD' },
        horario: { type: 'string', description: 'Horário aproximado (HH:MM), opcional' },
      },
      required: ['data'],
    },
  },
  {
    name: 'create_appointment',
    description:
      'Cria o agendamento da locação no CRM e, se configurado, no Google Agenda (RF03.1/RF03.2). ' +
      'Use somente após o cliente confirmar a proposta (e após confirm_pix, se o sinal foi solicitado).',
    input_schema: {
      type: 'object',
      properties: {
        nome_cliente: { type: 'string' },
        telefone: { type: 'string', description: 'Telefone do cliente (E.164, sem +)' },
        endereco_completo: { type: 'string' },
        bairro: { type: 'string' },
        tipo_residuo: { type: 'string' },
        quantidade_cacambas: { type: 'integer', minimum: 1 },
        data_entrega: { type: 'string', description: 'Data de entrega no formato YYYY-MM-DD' },
        horario_entrega: {
          type: 'string',
          description: 'Horário de entrega no formato HH:MM (padrão: período da manhã)',
        },
        dias_permanencia: {
          type: 'integer',
          minimum: 1,
          description:
            'Quantos dias a caçamba ficará no local. Padrão 1 (já incluso na diária). ' +
            'Cada dia adicional soma R$ DIARIA_ADICIONAL por caçamba ao valor_total.',
        },
        valor_total: {
          type: 'number',
          description:
            'quantidade_cacambas x PRECO_LOCACAO, somado a quantidade_cacambas x (dias_permanencia - 1) x DIARIA_ADICIONAL',
        },
      },
      required: [
        'nome_cliente',
        'telefone',
        'endereco_completo',
        'bairro',
        'tipo_residuo',
        'quantidade_cacambas',
        'data_entrega',
        'valor_total',
      ],
    },
  },
  {
    name: 'send_pix_request',
    description:
      'Registra a solicitação de sinal via PIX (50% do valor total) quando a entrega for para mais de 3 dias (RF04.1/RF04.2). ' +
      'Retorna a chave PIX a ser enviada ao cliente.',
    input_schema: {
      type: 'object',
      properties: {
        valor_sinal: { type: 'number', description: '50% do valor total da locação' },
      },
      required: ['valor_sinal'],
    },
  },
  {
    name: 'confirm_pix',
    description:
      'Confirma o recebimento do comprovante de PIX e libera a criação do agendamento (RF04.3/RF04.5). ' +
      'Use o pix_solicitacao_id retornado por send_pix_request.',
    input_schema: {
      type: 'object',
      properties: {
        pix_solicitacao_id: { type: 'string' },
        comprovante_recebido: {
          type: 'boolean',
          description: 'true se a imagem recebida parece um comprovante PIX válido',
        },
      },
      required: ['pix_solicitacao_id', 'comprovante_recebido'],
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Escala a conversa para um atendente humano, registrando motivo e contexto no CRM (RNF03.2). ' +
      'Use em reclamações, negociação de preço fora da política ou quando inseguro sobre alguma informação.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo curto da escalação' },
        contexto: { type: 'string', description: 'Resumo do contexto da conversa para o atendente humano' },
      },
      required: ['motivo', 'contexto'],
    },
  },
  {
    name: 'mark_lead_lost',
    description:
      'Marca o lead como "perdido" no CRM quando a negociação não avança (cliente desiste, está fora ' +
      'de Sinop-MT, pede material não aceito sem alternativa, some da conversa, etc.), para a equipe ' +
      'fazer follow-up posterior. NUNCA chame esta tool se o agendamento já foi criado.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo curto e objetivo pelo qual a negociação não avançou' },
      },
      required: ['motivo'],
    },
  },
];
