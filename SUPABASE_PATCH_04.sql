-- ============================================================
--  KADOSH CRM — Patch 04
--  Execute no SQL Editor do Supabase
--  Objetivo: regras de negócio do agente Kadu — diárias
--  adicionais e pausa de atendimento humano (24h)
-- ============================================================

-- 1. Pausa de atendimento humano: quando o Adriano (ou outro humano)
--    responde manualmente pelo WhatsApp (mensagem fromMe: true), o
--    agente Kadu fica pausado por 24h para aquele lead.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS atendimento_humano_em timestamptz;

-- 2. Dias de permanência da caçamba no local (1 dia incluso na diária
--    padrão; cada dia adicional é cobrado à parte).
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS dias_permanencia integer NOT NULL DEFAULT 1;
