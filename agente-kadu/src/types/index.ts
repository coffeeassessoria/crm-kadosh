/** Identificador de uma mensagem no Baileys/Evolution API (usado para marcar como lida e baixar mídia). */
export interface MessageKey {
  remoteJid: string;
  /** JID alternativo (número real) quando `addressingMode` é "lid" — ver `jidToPhone`. */
  remoteJidAlt?: string;
  /** Modo de endereçamento do WhatsApp; "lid" indica que `remoteJid` não é o número de telefone. */
  addressingMode?: string;
  fromMe: boolean;
  id: string;
}

/** Mensagem normalizada recebida via webhook do WhatsApp (Evolution API). */
export interface IncomingMessage {
  messageId: string;
  messageKey: MessageKey;
  /** Número do cliente no formato E.164 sem "+", ex: 5566999999999 */
  from: string;
  name?: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'unsupported';
  text?: string;
  mimeType?: string;
  /** true quando a mensagem foi enviada pelo próprio número (ex: atendimento humano manual). */
  fromMe: boolean;
  /** true quando a mensagem veio de um grupo (@g.us) — ver agent/adminAgent. */
  isGroup: boolean;
  /** JID do grupo (ex: "1203...@g.us"), presente apenas quando isGroup === true. */
  groupJid?: string;
}

export type LeadStatus =
  | 'novo'
  | 'contato'
  | 'agendado'
  | 'sinal_pendente'
  | 'escalado'
  | 'convertido'
  | 'perdido'
  | string;

export type Classificacao = 'quente' | 'morno' | 'frio';

/** Linha da tabela `leads` (colunas relevantes para o agente). */
export interface Lead {
  id: string;
  nome: string;
  telefone: string | null;
  origem: string;
  status: LeadStatus;
  endereco: string | null;
  bairro: string | null;
  tipo_residuo: string | null;
  quantidade_cacambas: number | null;
  prazo_data: string | null;
  classificacao: Classificacao | null;
  valor: number | null;
  data_agendamento: string | null;
  /** Timestamp da última mensagem enviada manualmente por um humano (fromMe) — pausa o agente por 24h. */
  atendimento_humano_em: string | null;
  created_at: string;
  updated_at: string;
}

export type AgendamentoStatus = 'proposta' | 'aguardando_sinal' | 'confirmado' | 'cancelado';

/** Linha da tabela `agendamentos`. */
export interface Agendamento {
  id: string;
  lead_id: string;
  endereco_completo: string;
  bairro: string | null;
  tipo_residuo: string | null;
  quantidade_cacambas: number;
  data_entrega: string;
  horario_entrega: string | null;
  data_retirada: string | null;
  /** Quantidade de dias de permanência da caçamba no local (1 dia incluso na diária padrão). */
  dias_permanencia: number;
  valor_total: number;
  status: AgendamentoStatus;
  google_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PixStatus = 'pendente' | 'confirmado' | 'expirado';

/** Linha da tabela `pix_solicitacoes`. */
export interface PixSolicitacao {
  id: string;
  lead_id: string;
  agendamento_id: string | null;
  valor: number;
  status: PixStatus;
  comprovante_url: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface AgendaItem {
  id: string;
  endereco_completo: string;
  quantidade_cacambas: number;
  tipo_residuo: string | null;
  horario_entrega: string | null;
  /** Presente quando o item vem de getAgendaPeriodo (relatórios de mais de um dia). */
  data_entrega?: string;
  data_retirada?: string;
  leads: { nome: string } | { nome: string }[] | null;
}
