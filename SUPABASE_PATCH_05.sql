-- ============================================================
--  KADOSH CRM — Patch 05
--  Execute no SQL Editor do Supabase
--  Objetivo: módulo Clientes — dados cadastrais enriquecidos
--            e número sequencial de pedidos
-- ============================================================

-- 1. Campos de cadastro do cliente na tabela leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cpf               text,
  ADD COLUMN IF NOT EXISTS email             text,
  ADD COLUMN IF NOT EXISTS observacoes_cliente text,
  ADD COLUMN IF NOT EXISTS cliente_desde     date;

-- 2. Sequência global de número de pedido
CREATE SEQUENCE IF NOT EXISTS numero_pedido_seq START 1;

-- 3. Coluna numero_pedido em agendamentos
ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS numero_pedido integer;

-- 4. Numera os agendamentos existentes (ordem cronológica)
WITH numerados AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM agendamentos
  WHERE numero_pedido IS NULL
)
UPDATE agendamentos a
SET numero_pedido = numerados.rn
FROM numerados
WHERE a.id = numerados.id;

-- 5. Avança a sequência para continuar após os existentes
SELECT setval('numero_pedido_seq', COALESCE((SELECT MAX(numero_pedido) FROM agendamentos), 0) + 1, false);

-- 6. Trigger: atribui numero_pedido automaticamente ao inserir
CREATE OR REPLACE FUNCTION set_numero_pedido()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_pedido IS NULL THEN
    NEW.numero_pedido := nextval('numero_pedido_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agendamentos_numero_pedido ON agendamentos;
CREATE TRIGGER agendamentos_numero_pedido
  BEFORE INSERT ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION set_numero_pedido();

-- 7. Preenche cliente_desde com a data do primeiro agendamento confirmado
UPDATE leads l
SET cliente_desde = (
  SELECT MIN(data_entrega)
  FROM agendamentos a
  WHERE a.lead_id = l.id AND a.status = 'confirmado'
)
WHERE EXISTS (
  SELECT 1 FROM agendamentos a
  WHERE a.lead_id = l.id AND a.status = 'confirmado'
);

-- 8. Trigger: preenche cliente_desde quando primeiro agendamento é confirmado
CREATE OR REPLACE FUNCTION set_cliente_desde()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'confirmado' THEN
    UPDATE leads
    SET cliente_desde = COALESCE(cliente_desde, NEW.data_entrega)
    WHERE id = NEW.lead_id AND cliente_desde IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agendamentos_set_cliente_desde ON agendamentos;
CREATE TRIGGER agendamentos_set_cliente_desde
  AFTER INSERT OR UPDATE OF status ON agendamentos
  FOR EACH ROW EXECUTE FUNCTION set_cliente_desde();
