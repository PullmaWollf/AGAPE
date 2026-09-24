-- ══════════════════════════════════════════════════
-- CÉLULA ÁGAPE — Tabelas para Push Notifications
-- Cole no Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

-- 1. Subscriptions de push por dispositivo
create table if not exists push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete cascade,
  subscription_json text not null,         -- JSON completo da PushSubscription
  user_agent        text,
  created_at        timestamptz default now(),
  unique(subscription_json)                -- evita duplicatas do mesmo dispositivo
);

-- 2. Alarmes de lanche agendados
create table if not exists push_alarms (
  id               uuid primary key default gen_random_uuid(),
  alarm_key        text unique not null,   -- ex: "escala-id-main"
  fire_at          timestamptz not null,
  title            text not null,
  body             text not null,
  url              text default '/?page=escala',
  target_user_ids  uuid[] default '{}',    -- array de user_ids
  sent             boolean default false,
  created_at       timestamptz default now()
);

-- 3. RLS — leitura/escrita livre via anon key
alter table push_subscriptions enable row level security;
alter table push_alarms         enable row level security;

create policy "acesso_total_push_subscriptions"
  on push_subscriptions for all to anon, authenticated
  using (true) with check (true);

create policy "acesso_total_push_alarms"
  on push_alarms for all to anon, authenticated
  using (true) with check (true);

-- 4. Index para performance
create index if not exists idx_push_alarms_fire_at
  on push_alarms(fire_at) where sent = false;

create index if not exists idx_push_subs_user
  on push_subscriptions(user_id);
