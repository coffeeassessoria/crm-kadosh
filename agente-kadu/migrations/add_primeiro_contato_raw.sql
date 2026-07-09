-- Guarda o payload bruto da primeira mensagem de cada lead novo, especificamente pra
-- diagnosticar o rastreamento de origem de anúncio ("Clique para o WhatsApp" do Meta).
-- Os campos campanha/utm_medium/utm_content já existem e são populados automaticamente
-- quando a mensagem carrega dados de anúncio (ver src/services/whatsapp.service.ts
-- extractAdReferral e src/services/crm.service.ts findOrCreateLeadByPhone). Essa coluna é
-- só uma rede de segurança: se os nomes de campo usados no parser estiverem errados, dá pra
-- conferir aqui o que a Evolution API realmente mandou, sem precisar esperar reproduzir de novo.
-- Executar no Supabase SQL Editor (Project > SQL Editor > New Query).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS primeiro_contato_raw JSONB;
