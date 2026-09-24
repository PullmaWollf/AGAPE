-- ══════════════════════════════════════════════════
-- CÉLULA ÁGAPE — Corrigir políticas RLS
-- Cole no Supabase → SQL Editor → Run
-- ══════════════════════════════════════════════════

-- 1. Remove todas as políticas antigas que podem estar conflitando
drop policy if exists "Leitura pública users"          on users;
drop policy if exists "Leitura pública posts"          on posts;
drop policy if exists "Leitura pública escala_semanas" on escala_semanas;
drop policy if exists "Leitura pública escala_membros" on escala_membros;
drop policy if exists "Escrita anon users"             on users;
drop policy if exists "Escrita anon posts"             on posts;
drop policy if exists "Escrita anon escala_semanas"    on escala_semanas;
drop policy if exists "Escrita anon escala_membros"    on escala_membros;

-- 2. Recria com uma única política permissiva por tabela
--    usando "TO anon, authenticated" para garantir que a anon key funciona

create policy "acesso_total_users"
  on users for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "acesso_total_posts"
  on posts for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "acesso_total_escala_semanas"
  on escala_semanas for all
  to anon, authenticated
  using (true)
  with check (true);

create policy "acesso_total_escala_membros"
  on escala_membros for all
  to anon, authenticated
  using (true)
  with check (true);

-- 3. Garante que RLS está ativo (já deve estar, mas por segurança)
alter table users          enable row level security;
alter table posts          enable row level security;
alter table escala_semanas enable row level security;
alter table escala_membros enable row level security;

-- 4. Verifica se as políticas foram criadas corretamente
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename;
