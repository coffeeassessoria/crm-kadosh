-- ============================================================
--  KADOSH CRM — Patch 01
--  Execute no SQL Editor do Supabase após o migration inicial
--  Objetivo: suportar etapas/colunas customizadas no Kanban
-- ============================================================

-- 1. Remove o CHECK constraint fixo do campo status
--    (agora qualquer string é aceita como status/etapa)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE historico_lead DROP CONSTRAINT IF EXISTS historico_lead_lead_id_fkey;
ALTER TABLE historico_lead ADD CONSTRAINT historico_lead_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

-- 2. Insere as etapas padrão do Kanban na tabela configuracoes
INSERT INTO configuracoes (chave, valor) VALUES (
  'kanban_stages',
  '[
    {"id":"novo",       "label":"Novo",        "color":"#3B82F6", "order":0},
    {"id":"contato",    "label":"Em Contato",  "color":"#F59E0B", "order":1},
    {"id":"agendado",   "label":"Agendado",    "color":"#8B5CF6", "order":2},
    {"id":"convertido", "label":"Convertido",  "color":"#22C55E", "order":3},
    {"id":"perdido",    "label":"Perdido",     "color":"#EF4444", "order":4}
  ]'
) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
