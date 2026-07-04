import { type FunctionDeclaration, Type } from '@google/genai';

/**
 * Tools disponíveis para o agente Kadu (PRD seção 6 — "TOOLS DISPONÍVEIS").
 * As implementações ficam em ./toolHandlers.ts.
 */
export const agentTools: FunctionDeclaration[] = [
  {
    name: 'save_address',
    description:
      'Salva no CRM o endereço completo de entrega (rua, número, CEP e ponto de referência/complemento) ' +
      'e o bairro, se o cliente mencionar. Chame assim que o cliente informar o endereço de entrega.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        endereco_completo: {
          type: Type.STRING,
          description: 'Endereço completo: rua, número, CEP e ponto de referência/complemento',
        },
        bairro: { type: Type.STRING, description: 'Bairro informado espontaneamente pelo cliente (opcional)' },
      },
      required: ['endereco_completo'],
    },
  },
  {
    name: 'check_availability',
    description:
      'Verifica se há caçambas livres o suficiente para a data e quantidade pedidas, considerando ' +
      'a frota total e os dias de permanência das caçambas já alugadas nesse período (RF03.4). ' +
      'Também retorna preco_diaria e promocao_aplicada, referentes à data de ENTREGA informada ' +
      '(a promoção de terça/quarta depende de quando a caçamba será entregue, não de quando o ' +
      'pedido está sendo fechado) — use SEMPRE esse preco_diaria no cálculo do valor_total, ' +
      'nunca um valor fixo do prompt. Retorna também dia_semana (já calculado) — use SEMPRE esse ' +
      'valor ao mencionar o dia da semana de uma data pro cliente, nunca calcule de cabeça. ' +
      'Chame antes de propor uma data ao cliente, já com a quantidade e os dias de permanência coletados.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        data: { type: Type.STRING, description: 'Data de entrega desejada no formato YYYY-MM-DD' },
        quantidade_cacambas: { type: Type.INTEGER, minimum: 1, description: 'Quantas caçambas o cliente quer' },
        dias_permanencia: {
          type: Type.INTEGER,
          minimum: 1,
          description: 'Quantos dias a caçamba ficará no local (padrão 1)',
        },
        horario: { type: Type.STRING, description: 'Horário aproximado (HH:MM), opcional' },
      },
      required: ['data', 'quantidade_cacambas'],
    },
  },
  {
    name: 'create_appointment',
    description:
      'Cria o agendamento da locação no CRM e, se configurado, no Google Agenda (RF03.1/RF03.2). ' +
      'Use somente após o cliente confirmar a proposta (e após confirm_pix, se o sinal foi solicitado).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        nome_cliente: { type: Type.STRING },
        telefone: { type: Type.STRING, description: 'Telefone do cliente (E.164, sem +)' },
        endereco_completo: { type: Type.STRING },
        bairro: { type: Type.STRING },
        tipo_residuo: { type: Type.STRING },
        quantidade_cacambas: { type: Type.INTEGER, minimum: 1 },
        data_entrega: { type: Type.STRING, description: 'Data de entrega no formato YYYY-MM-DD' },
        horario_entrega: {
          type: Type.STRING,
          description: 'Horário de entrega no formato HH:MM (padrão: período da manhã)',
        },
        dias_permanencia: {
          type: Type.INTEGER,
          minimum: 1,
          description:
            'Quantos dias a caçamba ficará no local. Padrão 1 (já incluso na diária). ' +
            'Cada dia adicional soma R$ DIARIA_ADICIONAL por caçamba ao valor_total.',
        },
        valor_total: {
          type: Type.NUMBER,
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
    parameters: {
      type: Type.OBJECT,
      properties: {
        valor_sinal: { type: Type.NUMBER, description: '50% do valor total da locação' },
      },
      required: ['valor_sinal'],
    },
  },
  {
    name: 'confirm_pix',
    description:
      'Confirma o recebimento do comprovante de PIX e libera a criação do agendamento (RF04.3/RF04.5). ' +
      'Use o pix_solicitacao_id retornado por send_pix_request.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        pix_solicitacao_id: { type: Type.STRING },
        comprovante_recebido: {
          type: Type.BOOLEAN,
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
    parameters: {
      type: Type.OBJECT,
      properties: {
        motivo: { type: Type.STRING, description: 'Motivo curto da escalação' },
        contexto: { type: Type.STRING, description: 'Resumo do contexto da conversa para o atendente humano' },
      },
      required: ['motivo', 'contexto'],
    },
  },
  {
    name: 'send_social_proof',
    description:
      'Envia fotos reais das mini caçambas da Kadosh para o cliente, como prova social. ' +
      'Use quando o cliente: pedir para ver fotos ("tem foto?", "como é a caçamba?"), ' +
      'demonstrar dúvida sobre o tamanho ou aparência do produto, ' +
      'perguntar se é uma empresa confiável, ou hesitar antes de fechar o agendamento. ' +
      'Não use mais de uma vez por conversa.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'mark_lead_lost',
    description:
      'Marca o lead como "perdido" no CRM quando a negociação não avança (cliente desiste, está fora ' +
      'de Sinop-MT, pede material não aceito sem alternativa, some da conversa, etc.), para a equipe ' +
      'fazer follow-up posterior. NUNCA chame esta tool se o agendamento já foi criado.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        motivo: { type: Type.STRING, description: 'Motivo curto e objetivo pelo qual a negociação não avançou' },
      },
      required: ['motivo'],
    },
  },
];
