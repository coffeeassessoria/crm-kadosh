-- ============================================================
--  KADOSH CRM — Patch 02
--  Execute no SQL Editor do Supabase
--  Objetivo: tabela de eventos independentes no calendário
-- ============================================================

CREATE TABLE IF NOT EXISTS eventos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo       text NOT NULL,
  descricao    text,
  data_evento  date NOT NULL,
  hora_inicio  time,
  hora_fim     time,
  lead_id      uuid REFERENCES leads(id) ON DELETE SET NULL,
  cor          text DEFAULT '#F58220',
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- Trigger updated_at
CREATE TRIGGER eventos_set_updated_at
  BEFORE UPDATE ON eventos
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- RLS
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados gerenciam eventos"
  ON eventos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
