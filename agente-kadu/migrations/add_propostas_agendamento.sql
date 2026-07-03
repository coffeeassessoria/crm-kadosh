-- Tabela de propostas de agendamento geradas pela reconciliação automática diária:
-- o Kadu Financeiro relê as conversas do dia e, quando parece que um negócio foi
-- fechado (por exemplo, na mão, durante um atendimento humano) mas não virou
-- agendamento no CRM, registra aqui como PENDENTE para confirmação humana antes
-- de criar o agendamento de verdade.
-- Executar no Supabase SQL Editor (Project > SQL Editor > New Query).

CREATE TABLE IF NOT EXISTS propostas_agendamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id),
  nome_cliente TEXT NOT NULL,
  telefone TEXT NOT NULL,
  endereco_completo TEXT NOT NULL,
  bairro TEXT,
  tipo_residuo TEXT,
  quantidade_cacambas INTEGER NOT NULL DEFAULT 1,
  data_entrega DATE NOT NULL,
  horario_entrega TEXT,
  dias_permanencia INTEGER NOT NULL DEFAULT 1,
  valor_total NUMERIC NOT NULL,
  justificativa TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'descartado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_propostas_agendamento_status ON propostas_agendamento (status);
CREATE INDEX IF NOT EXISTS idx_propostas_agendamento_lead_id ON propostas_agendamento (lead_id);
