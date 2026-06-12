-- Adiciona coluna para armazenar o resumo gerado por IA da conversa do WhatsApp.
-- Executar no Supabase SQL Editor (Project > SQL Editor > New Query).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS resumo_conversa TEXT;
