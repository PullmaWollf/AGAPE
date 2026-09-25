-- CÉLULA ÁGAPE — correção final de permissões, escala e notificações
-- Executar no Supabase SQL Editor após os arquivos 01–08.
-- É idempotente e não apaga usuários, posts ou escalas.

begin;

-- Garante que perfis existentes tenham todas as chaves usadas pelo frontend/API.
update public.perfis_permissao
set permissoes = permissoes || jsonb_build_object(
  'gerencial', coalesce((permissoes->>'gerencial')::boolean, false),
  'usuarios', coalesce((permissoes->>'usuarios')::boolean, false),
  'perfis', coalesce((permissoes->>'perfis')::boolean, false),
  'mural_publicar', coalesce((permissoes->>'mural_publicar')::boolean, false),
  'mural_excluir', coalesce((permissoes->>'mural_excluir')::boolean, false),
  'palavra', coalesce((permissoes->>'palavra')::boolean, false),
  'escala', coalesce((permissoes->>'escala')::boolean, false),
  'escala_visualizar', coalesce((permissoes->>'escala_visualizar')::boolean, false),
  'modelos', coalesce((permissoes->>'modelos')::boolean, false),
  'notificacoes', coalesce((permissoes->>'notificacoes')::boolean, false),
  'uploads', coalesce((permissoes->>'uploads')::boolean, false)
), updated_at = now();

-- Perfis administrativos conhecidos recebem o conjunto completo.
update public.perfis_permissao
set permissoes = '{"gerencial":true,"usuarios":true,"perfis":true,"mural_publicar":true,"mural_excluir":true,"palavra":true,"escala":true,"escala_visualizar":true,"modelos":true,"notificacoes":true,"uploads":true}'::jsonb,
    updated_at = now()
where lower(nome) in ('adm', 'administrador', 'líder', 'lider');

-- O endpoint usa endpoint como chave natural para não duplicar aparelhos.
create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions(endpoint)
  where endpoint is not null;

-- Índices usados pelas APIs server-side.
create index if not exists users_perfil_id_role_idx on public.users(perfil_id, role);
create index if not exists escala_atribuicoes_escala_id_idx on public.escala_atribuicoes(escala_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);

-- O app usa sessão própria assinada e as APIs usam service_role; o acesso direto
-- do navegador fica somente para leitura pública e nunca para escritas administrativas.
revoke insert, update, delete on public.escala_semanas from anon, authenticated;
revoke insert, update, delete on public.escala_atribuicoes from anon, authenticated;
revoke insert, update, delete on public.push_subscriptions from anon, authenticated;

commit;
