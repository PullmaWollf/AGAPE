-- ══════════════════════════════════════════════════
-- CÉLULA ÁGAPE — Atualizar tabela push_subscriptions
-- Cole no Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

-- Adiciona coluna endpoint (para upsert por dispositivo)
alter table push_subscriptions
  add column if not exists endpoint text;

-- Preenche endpoint nos registros existentes (extrai do JSON)
update push_subscriptions
set endpoint = subscription_json::json->>'endpoint'
where endpoint is null and subscription_json is not null;

-- Cria index único por endpoint (1 registro por dispositivo)
create unique index if not exists idx_push_subs_endpoint
  on push_subscriptions(endpoint)
  where endpoint is not null;

-- Verifica resultado
select id, user_id, endpoint, created_at
from push_subscriptions
order by created_at desc;
