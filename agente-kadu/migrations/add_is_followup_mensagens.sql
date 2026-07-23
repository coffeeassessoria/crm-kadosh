-- Marca mensagens enviadas pela rotina automática de follow-up (silêncio do cliente),
-- para a rotina não disparar um segundo follow-up em cima do primeiro.
-- Executar no Supabase SQL Editor (Project > SQL Editor > New Query).

ALTER TABLE mensagens
  ADD COLUMN IF NOT EXISTS is_followup boolean NOT NULL DEFAULT false;
