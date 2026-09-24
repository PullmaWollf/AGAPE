-- ═══════════════════════════════════════════════
-- CÉLULA ÁGAPE — Setup do banco de dados Supabase
-- Cole este SQL no Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════

-- 1. USUÁRIOS
create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  login      text unique not null,
  pass_hash  text not null,
  role       text not null default 'membro' check (role in ('adm','membro')),
  created_at timestamptz default now()
);

-- 2. POSTS DO MURAL
create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'mensagem' check (type in ('versiculo','mensagem','aviso')),
  content     text not null,
  author_id   uuid references users(id) on delete set null,
  author_name text not null,
  created_at  timestamptz default now()
);

-- 3. ESCALA DE LANCHE — semanas
create table if not exists escala_semanas (
  id        uuid primary key default gen_random_uuid(),
  date      date not null,
  alarm_ts  timestamptz,
  alarm_1d  boolean default false,
  alarm_3h  boolean default false,
  alarm_30m boolean default false,
  created_at timestamptz default now()
);

-- 4. ESCALA DE LANCHE — membros por semana
create table if not exists escala_membros (
  id         uuid primary key default gen_random_uuid(),
  escala_id  uuid not null references escala_semanas(id) on delete cascade,
  user_id    uuid references users(id) on delete set null,
  user_name  text not null,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- Permite leitura pública, escrita autenticada via anon key
-- ═══════════════════════════════════════════════

alter table users          enable row level security;
alter table posts          enable row level security;
alter table escala_semanas enable row level security;
alter table escala_membros enable row level security;

-- Políticas: leitura livre para todos (anon)
create policy "Leitura pública users"          on users          for select using (true);
create policy "Leitura pública posts"          on posts          for select using (true);
create policy "Leitura pública escala_semanas" on escala_semanas for select using (true);
create policy "Leitura pública escala_membros" on escala_membros for select using (true);

-- Políticas: escrita livre via anon key (o app controla permissão pelo login)
create policy "Escrita anon users"          on users          for all using (true) with check (true);
create policy "Escrita anon posts"          on posts          for all using (true) with check (true);
create policy "Escrita anon escala_semanas" on escala_semanas for all using (true) with check (true);
create policy "Escrita anon escala_membros" on escala_membros for all using (true) with check (true);

-- ═══════════════════════════════════════════════
-- REALTIME — habilita mudanças em tempo real
-- ═══════════════════════════════════════════════
alter publication supabase_realtime add table posts;
alter publication supabase_realtime add table escala_semanas;
alter publication supabase_realtime add table escala_membros;

-- ═══════════════════════════════════════════════
-- ADMIN INICIAL
-- Troque a senha se quiser, ou mantenha agape2024
-- ═══════════════════════════════════════════════
insert into users (name, login, pass_hash, role)
values ('Administrador', 'admin', 'agape2024', 'adm')
on conflict (login) do nothing;
