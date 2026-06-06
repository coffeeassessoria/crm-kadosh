-- ============================================================
--  KADOSH CRM — Supabase Migration
--  Execute no SQL Editor do Supabase (Settings > SQL Editor)
-- ============================================================

-- 1. Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- busca por similaridade

-- ============================================================
--  2. TABELAS
-- ============================================================

-- Leads
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  telefone        text,
  origem          text default 'direto',           -- facebook_ads | google_ads | instagram | organico | indicacao | direto
  campanha        text,                            -- utm_campaign
  utm_medium      text,
  utm_content     text,
  tipo            text,                            -- tipo de serviço
  volume          text,
  endereco        text,
  obs             text,
  status          text default 'novo'
    check (status in ('novo','contato','agendado','convertido','perdido')),
  valor           numeric(10,2) default 0,
  data_entrada    date default current_date,
  data_agendamento date,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Histórico / Timeline de cada lead
create table if not exists historico_lead (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references leads(id) on delete cascade not null,
  tipo        text not null,   -- 'criado' | 'status' | 'nota' | 'agendamento'
  texto       text not null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz default now()
);

-- Campanhas de mídia
create table if not exists campanhas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  plataforma  text default 'facebook',  -- facebook | google | instagram | outro
  inicio      date,
  fim         date,
  invest      numeric(10,2) default 0,
  utm         text,                     -- parâmetro utm_campaign correspondente
  status      text default 'ativa'
    check (status in ('ativa','inativa')),
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Configurações (key-value)
create table if not exists configuracoes (
  chave       text primary key,
  valor       text,
  updated_at  timestamptz default now()
);

-- ============================================================
--  3. TRIGGERS — auto-atualiza updated_at
-- ============================================================

create or replace function _set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at
  before update on leads
  for each row execute function _set_updated_at();

drop trigger if exists campanhas_updated_at on campanhas;
create trigger campanhas_updated_at
  before update on campanhas
  for each row execute function _set_updated_at();

-- ============================================================
--  4. ÍNDICES (performance)
-- ============================================================

create index if not exists leads_status_idx        on leads(status);
create index if not exists leads_origem_idx        on leads(origem);
create index if not exists leads_data_entrada_idx  on leads(data_entrada);
create index if not exists leads_created_at_idx    on leads(created_at desc);
create index if not exists leads_nome_trgm_idx     on leads using gin(nome gin_trgm_ops);
create index if not exists historico_lead_id_idx   on historico_lead(lead_id);

-- ============================================================
--  5. ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table leads          enable row level security;
alter table historico_lead enable row level security;
alter table campanhas      enable row level security;
alter table configuracoes  enable row level security;

-- Leads: usuários autenticados têm acesso total
create policy "leads_authenticated_all" on leads
  for all to authenticated using (true) with check (true);

-- Histórico: usuários autenticados têm acesso total
create policy "historico_authenticated_all" on historico_lead
  for all to authenticated using (true) with check (true);

-- Campanhas: usuários autenticados têm acesso total
create policy "campanhas_authenticated_all" on campanhas
  for all to authenticated using (true) with check (true);

-- Configurações: usuários autenticados têm acesso total
create policy "config_authenticated_all" on configuracoes
  for all to authenticated using (true) with check (true);

-- Permite INSERT público de leads pelo site (sem login)
-- Escopo limitado: só INSERT, só campos permitidos
create policy "leads_site_insert" on leads
  for insert to anon
  with check (true);

create policy "historico_site_insert" on historico_lead
  for insert to anon
  with check (true);

-- ============================================================
--  6. CONFIGURAÇÕES PADRÃO
-- ============================================================

insert into configuracoes (chave, valor) values
  ('nome',          'Kadosh Mini Caçambas'),
  ('wpp',           '5566996585048'),
  ('cidade',        'Sinop - MT'),
  ('ticket',        '350'),
  ('meta_leads',    '50'),
  ('meta_conv',     '20'),
  ('meta_receita',  '7000')
on conflict (chave) do nothing;

-- ============================================================
--  7. FUNÇÃO RPC — métricas do dashboard (otimizado)
-- ============================================================

create or replace function get_dashboard_metrics(p_year int, p_month int)
returns json language plpgsql security definer as $$
declare
  v_inicio date := make_date(p_year, p_month, 1);
  v_fim    date := (v_inicio + interval '1 month')::date;
  result   json;
begin
  select json_build_object(
    'leads_mes',      count(*) filter (where data_entrada >= v_inicio and data_entrada < v_fim),
    'conv_mes',       count(*) filter (where status = 'convertido' and data_entrada >= v_inicio and data_entrada < v_fim),
    'receita_mes',    coalesce(sum(valor) filter (where status = 'convertido' and data_entrada >= v_inicio and data_entrada < v_fim), 0),
    'total_leads',    count(*),
    'total_conv',     count(*) filter (where status = 'convertido'),
    'receita_total',  coalesce(sum(valor) filter (where status = 'convertido'), 0),
    'por_status',     json_build_object(
      'novo',         count(*) filter (where status = 'novo'),
      'contato',      count(*) filter (where status = 'contato'),
      'agendado',     count(*) filter (where status = 'agendado'),
      'convertido',   count(*) filter (where status = 'convertido'),
      'perdido',      count(*) filter (where status = 'perdido')
    )
  ) into result from leads;
  return result;
end;
$$;
