begin;

-- O AGAPE usa sessão própria, não Supabase Auth. O frontend continua usando
-- a chave anon para leitura e operações de conteúdo; as regras de negócio
-- continuam sendo aplicadas pelo app/API.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname='public' and tablename in ('posts','escala_semanas','escala_membros','escala_funcoes','escala_atribuicoes','push_subscriptions','push_alarms','config','escala_modelos','escala_modelo_itens','palavra_celula') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table public.posts enable row level security;
create policy posts_app_read on public.posts for select to anon, authenticated using (true);
create policy posts_app_insert on public.posts for insert to anon, authenticated with check (true);
create policy posts_app_update on public.posts for update to anon, authenticated using (true) with check (true);
create policy posts_app_delete on public.posts for delete to anon, authenticated using (true);

alter table public.escala_semanas enable row level security;
create policy escala_semanas_app on public.escala_semanas for all to anon, authenticated using (true) with check (true);
alter table public.escala_membros enable row level security;
create policy escala_membros_app on public.escala_membros for all to anon, authenticated using (true) with check (true);
alter table public.escala_funcoes enable row level security;
create policy escala_funcoes_app on public.escala_funcoes for all to anon, authenticated using (true) with check (true);
alter table public.escala_atribuicoes enable row level security;
create policy escala_atribuicoes_app on public.escala_atribuicoes for all to anon, authenticated using (true) with check (true);

alter table public.config enable row level security;
create policy config_app on public.config for all to anon, authenticated using (true) with check (true);
alter table public.escala_modelos enable row level security;
create policy modelos_app on public.escala_modelos for all to anon, authenticated using (true) with check (true);
alter table public.escala_modelo_itens enable row level security;
create policy modelo_itens_app on public.escala_modelo_itens for all to anon, authenticated using (true) with check (true);
alter table public.palavra_celula enable row level security;
create policy palavra_app on public.palavra_celula for all to anon, authenticated using (true) with check (true);

alter table public.push_subscriptions enable row level security;
create policy push_app on public.push_subscriptions for all to anon, authenticated using (true) with check (true);
alter table public.push_alarms enable row level security;
create policy alarms_app on public.push_alarms for all to anon, authenticated using (true) with check (true);

-- Buckets públicos do AGAPE: leitura pública e gravação pelo frontend.
-- As permissões de publicação/exclusão são controladas pela interface e APIs.
drop policy if exists mural_storage_leitura on storage.objects;
create policy mural_storage_leitura on storage.objects for select to anon, authenticated using (bucket_id = 'mural');
drop policy if exists mural_storage_app on storage.objects;
create policy mural_storage_app on storage.objects for insert to anon, authenticated with check (bucket_id = 'mural');
drop policy if exists mural_storage_update on storage.objects;
create policy mural_storage_update on storage.objects for update to anon, authenticated using (bucket_id = 'mural') with check (bucket_id = 'mural');
drop policy if exists mural_storage_delete on storage.objects;
create policy mural_storage_delete on storage.objects for delete to anon, authenticated using (bucket_id = 'mural');
drop policy if exists palavra_storage_app on storage.objects;
create policy palavra_storage_app on storage.objects for all to anon, authenticated using (bucket_id = 'palavra-celula') with check (bucket_id = 'palavra-celula');

commit;
