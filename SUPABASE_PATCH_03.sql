-- ============================================================
--  KADOSH CRM — Patch 03
--  Execute no SQL Editor do Supabase
--  Objetivo: suporte ao Agente de IA "Kadu" (SDR via WhatsApp)
-- ============================================================

-- 1. Novas colunas em leads (dados coletados pelo agente)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tipo_residuo         text,
  ADD COLUMN IF NOT EXISTS bairro               text,
  ADD COLUMN IF NOT EXISTS quantidade_cacambas  integer,
  ADD COLUMN IF NOT EXISTS prazo_data           date,
  ADD COLUMN IF NOT EXISTS classificacao        text
    CHECK (classificacao IN ('quente','morno','frio'));

-- Telefone único: o agente usa este campo para localizar/retomar a conversa
CREATE UNIQUE INDEX IF NOT EXISTS leads_telefone_uidx
  ON leads(telefone) WHERE telefone IS NOT NULL;

-- ============================================================
-- 2. Mensagens — log de auditoria das conversas do agente (RNF01.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS mensagens (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  direcao             text NOT NULL CHECK (direcao IN ('inbound','outbound')),
  tipo                text NOT NULL DEFAULT 'text',
  conteudo            text NOT NULL,
  whatsapp_message_id text,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensagens_lead_id_idx    ON mensagens(lead_id);
CREATE INDEX IF NOT EXISTS mensagens_created_at_idx ON mensagens(created_at);

-- ============================================================
-- 3. Agendamentos — locações propostas/confirmadas pelo agente
-- ============================================================
CREATE TABLE IF NOT EXISTS agendamentos (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id             uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  endereco_completo   text NOT NULL,
  bairro              text,
  tipo_residuo        text,
  quantidade_cacambas integer NOT NULL DEFAULT 1,
  data_entrega        date NOT NULL,
  horario_entrega     time,
  data_retirada       date,
  valor_total         numeric(10,2) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('proposta','aguardando_sinal','confirmado','cancelado')),
  google_event_id     text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TRIGGER agendamentos_set_updated_at
  BEFORE UPDATE ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE INDEX IF NOT EXISTS agendamentos_data_entrega_idx  ON agendamentos(data_entrega);
CREATE INDEX IF NOT EXISTS agendamentos_data_retirada_idx ON agendamentos(data_retirada);
CREATE INDEX IF NOT EXISTS agendamentos_lead_id_idx       ON agendamentos(lead_id);

-- ============================================================
-- 4. Solicitações de PIX (sinal de reserva — RF04)
-- ============================================================
CREATE TABLE IF NOT EXISTS pix_solicitacoes (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         uuid REFERENCES leads(id) ON DELETE CASCADE NOT NULL,
  agendamento_id  uuid REFERENCES agendamentos(id) ON DELETE SET NULL,
  valor           numeric(10,2) NOT NULL,
  status          text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','confirmado','expirado')),
  comprovante_url text,
  created_at      timestamptz DEFAULT now(),
  confirmed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS pix_solicitacoes_lead_id_idx ON pix_solicitacoes(lead_id);

-- ============================================================
-- 5. RLS — o agente acessa via service_role key (ignora RLS).
--    As policies abaixo liberam apenas o time logado no CRM.
-- ============================================================
ALTER TABLE mensagens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendamentos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pix_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensagens_authenticated_all" ON mensagens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "agendamentos_authenticated_all" ON agendamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "pix_solicitacoes_authenticated_all" ON pix_solicitacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6. Novas etapas do Kanban (sinal pendente / escalado para humano)
-- ============================================================
UPDATE configuracoes SET valor = '[
  {"id":"novo",          "label":"Novo",           "color":"#3B82F6", "order":0},
  {"id":"contato",       "label":"Em Contato",     "color":"#F59E0B", "order":1},
  {"id":"agendado",      "label":"Agendado",       "color":"#8B5CF6", "order":2},
  {"id":"sinal_pendente","label":"Sinal Pendente", "color":"#EAB308", "order":3},
  {"id":"escalado",      "label":"Escalado",       "color":"#EF4444", "order":4},
  {"id":"convertido",    "label":"Convertido",     "color":"#22C55E", "order":5},
  {"id":"perdido",       "label":"Perdido",        "color":"#6B7280", "order":6}
]'
WHERE chave = 'kanban_stages';
