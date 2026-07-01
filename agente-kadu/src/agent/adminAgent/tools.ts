import type { FunctionDeclaration } from '@google/genai';

/**
 * Tools disponíveis para o agente administrativo/financeiro ("Kadu Financeiro"),
 * usado no grupo operacional do WhatsApp. Todas read-only (v1).
 * As implementações ficam em ./toolHandlers.ts.
 */
export const adminTools: FunctionDeclaration[] = [
  {
    name: 'get_agenda',
    description:
      'Retorna as entregas e retiradas confirmadas para o período pedido, com endereço, ' +
      'cliente, horário e link de rota. Use "hoje" como padrão se o período não for especificado.',
    parameters: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          description: '"hoje", "amanha" ou "semana" (próximos 7 dias)',
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
    parameters: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          description: '"hoje", "semana" (próximos 7 dias) ou "mes" (mês corrente)',
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
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'confirmar_entrega',
    description:
      'Marca a entrega como realizada: encontra o lead pelo nome ou telefone, define o status ' +
      'do lead como "convertido" no CRM e registra no histórico. ' +
      'Se a busca retornar mais de um lead, liste os resultados e peça que o usuário seja mais específico.',
    parameters: {
      type: 'object',
      properties: {
        nome_ou_telefone: {
          type: 'string',
          description: 'Nome (parcial) ou telefone (só dígitos) do cliente/lead',
        },
      },
      required: ['nome_ou_telefone'],
    },
  },
  {
    name: 'cadastrar_cliente',
    description:
      'Cria um novo cadastro de cliente no CRM (lead com status "convertido" e cliente_desde = hoje). ' +
      'Use quando o cliente entrou em contato por outro canal (ligação, presencial, etc.) ' +
      'e não tem registro no WhatsApp/agente.',
    parameters: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome completo do cliente' },
        telefone: { type: 'string', description: 'Telefone com DDD (só dígitos, ex: 55669XXXXXXXX)' },
        endereco: { type: 'string', description: 'Endereço completo (opcional)' },
        bairro: { type: 'string', description: 'Bairro (opcional)' },
        cpf: { type: 'string', description: 'CPF (opcional)' },
        email: { type: 'string', description: 'E-mail (opcional)' },
        observacoes: { type: 'string', description: 'Observações sobre o cliente (opcional)' },
      },
      required: ['nome', 'telefone'],
    },
  },
  {
    name: 'criar_agendamento',
    description:
      'Cria um novo agendamento de entrega de caçamba no CRM e no Google Agenda. ' +
      'Encontra ou cria o lead pelo telefone. ' +
      'O valor total é calculado automaticamente (R$ PRECO × qtde + DIARIA_ADICIONAL × dias extras) ' +
      'a menos que seja fornecido explicitamente.',
    parameters: {
      type: 'object',
      properties: {
        nome_cliente: { type: 'string', description: 'Nome do cliente' },
        telefone: { type: 'string', description: 'Telefone com DDD (só dígitos)' },
        endereco_completo: { type: 'string', description: 'Endereço de entrega completo' },
        bairro: { type: 'string', description: 'Bairro da entrega' },
        tipo_residuo: {
          type: 'string',
          description: 'Tipo de resíduo (ex: entulho, madeira, vegetação, misto)',
        },
        quantidade_cacambas: { type: 'number', description: 'Número de caçambas' },
        data_entrega: { type: 'string', description: 'Data de entrega no formato YYYY-MM-DD' },
        horario_entrega: { type: 'string', description: 'Horário de entrega HH:MM (opcional)' },
        dias_permanencia: {
          type: 'number',
          description: 'Dias de permanência da caçamba no local (padrão 1 — já incluso na diária base)',
        },
        valor_total: {
          type: 'number',
          description: 'Valor total acordado em R$ (opcional — calculado automaticamente se omitido)',
        },
      },
      required: ['nome_cliente', 'telefone', 'endereco_completo', 'bairro', 'tipo_residuo', 'quantidade_cacambas', 'data_entrega'],
    },
  },
  {
    name: 'liberar_kadu',
    description:
      'Libera um lead de volta para o atendimento automático do Kadu, zerando o bloqueio de ' +
      'atendimento humano. Use quando você terminou de atender manualmente e quer que o Kadu ' +
      'volte a responder. Informe o nome ou telefone do lead, ou "todos" para liberar todos.',
    parameters: {
      type: 'object',
      properties: {
        nome_ou_telefone: {
          type: 'string',
          description: 'Nome (parcial) ou telefone do lead, ou a palavra "todos" para liberar todos os leads bloqueados',
        },
      },
      required: ['nome_ou_telefone'],
    },
  },
];
