-- =====================================================================
-- CÉLULA ÁGAPE — 02_seguranca_rls.sql
-- Rode SOMENTE DEPOIS de:
--   1) 01_schema.sql
--   2) node scripts/migrar-usuarios.mjs   (cria as contas no Supabase Auth)
--   3) deploy do app novo na Vercel e login testado
--
-- Troca as políticas "acesso total" (qualquer pessoa com a chave anon
-- podia ler senhas, apagar tudo, criar admin) por regras reais:
--   • leitura pública do mural e da escala (igual a hoje)
--   • escrever exige estar logado; ações de ADM exigem role 'adm'
--   • a senha em texto puro é apagada do banco
-- =====================================================================

begin;

-- Trava de segurança: todo usuário precisa já ter conta no Auth.
do $$ begin
  if exists (select 1 from public.users where auth_id is null) then
    raise exception 'Existem usuários sem conta no Supabase Auth. Rode scripts/migrar-usuarios.mjs antes deste script.';
  end if;
end $$;

-- 1. Remove TODAS as políticas antigas das tabelas do app
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('users','posts','escala_semanas','escala_membros','escala_funcoes',
                         'escala_atribuicoes','push_subscriptions','push_alarms')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.users              enable row level security;
alter table public.posts              enable row level security;
alter table public.escala_semanas     enable row level security;
alter table public.escala_membros     enable row level security;
alter table public.escala_funcoes     enable row level security;
alter table public.escala_atribuicoes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_alarms        enable row level security;   -- sem política = ninguém acessa

-- 2. Senhas em texto puro deixam de existir (o login agora é do Supabase Auth)
alter table public.users drop column if exists pass_hash;

-- 3. users: só quem está logado enxerga; ninguém escreve pelo app
--    (criar/excluir/resetar senha passa pela API /api/admin-users, com chave de serviço)
create policy users_leitura on public.users for select to authenticated
  using (public.is_membro());

-- 4. posts: leitura pública; publicar = membro logado; aviso = só ADM; apagar = dono ou ADM
create policy posts_leitura on public.posts for select to anon, authenticated using (true);
create policy posts_insercao on public.posts for insert to authenticated
  with check (public.is_membro() and author_id = public.me()
              and (type <> 'aviso' or public.is_admin()));
create policy posts_exclusao on public.posts for delete to authenticated
  using (author_id = public.me() or public.is_admin());

-- 5. Escala: leitura pública (como hoje); escrever = só ADM
create policy semanas_leitura on public.escala_semanas for select to anon, authenticated using (true);
create policy semanas_admin on public.escala_semanas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy atribuicoes_leitura on public.escala_atribuicoes for select to anon, authenticated using (true);
create policy atribuicoes_admin on public.escala_atribuicoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy funcoes_leitura on public.escala_funcoes for select to anon, authenticated using (true);
create policy funcoes_admin on public.escala_funcoes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy membros_leitura on public.escala_membros for select to anon, authenticated using (true);
create policy membros_admin on public.escala_membros for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 6. Dispositivos push: cada um vê/remove só os seus (cadastro é via RPC)
create policy dispositivos_proprios_leitura on public.push_subscriptions for select to authenticated
  using (user_id = public.me());
create policy dispositivos_proprios_exclusao on public.push_subscriptions for delete to authenticated
  using (user_id = public.me());

-- 7. Privilégios: anon nunca escreve em nada
revoke insert, update, delete, truncate on
  public.users, public.posts, public.escala_semanas, public.escala_membros,
  public.escala_funcoes, public.escala_atribuicoes, public.push_subscriptions,
  public.config, public.escala_modelos, public.escala_modelo_itens, public.notificacoes
  from anon;
revoke select on public.users, public.push_subscriptions, public.config,
  public.escala_modelos, public.escala_modelo_itens, public.notificacoes from anon;

commit;

-- Depois de rodar: no painel do Supabase, em Authentication → Sign In / Providers,
-- DESLIGUE "Allow new users to sign up" (senão qualquer pessoa cria conta).
-- O RLS acima já exige que exista uma linha em public.users, mas desligar é mais seguro.
