-- CÉLULA ÁGAPE — Notificações automáticas de conteúdo
-- Execute este arquivo no Supabase SQL Editor depois de publicar a versão.

begin;

-- Todo post novo avisa os demais usuários. O autor não recebe o próprio aviso.
create or replace function public.trg_posts_notificacao() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificacoes
    (chave, tipo, kind, post_id, user_id, titulo, corpo, url, fire_at, expira_em)
  select 'post:' || new.id || ':' || u.id,
         'aviso', 'aviso', new.id, u.id,
         case new.type
           when 'aviso' then 'Aviso — Célula Ágape'
           when 'versiculo' then 'Novo versículo no Mural'
           else 'Nova mensagem no Mural'
         end,
         coalesce(nullif(left(regexp_replace(btrim(new.content), '\s+', ' ', 'g'), 140), ''), 'Nova publicação com mídia'),
         '/?page=mural', now(), now() + interval '24 hours'
    from public.users u
   where u.id is distinct from new.author_id
  on conflict (chave) do nothing;
  return new;
end $$;

drop trigger if exists posts_aviso on public.posts;
drop trigger if exists posts_notificacao on public.posts;
create trigger posts_notificacao
after insert on public.posts
for each row execute function public.trg_posts_notificacao();

-- Nova Palavra ou substituição da Palavra avisa todos os usuários, exceto quem publicou.
create or replace function public.trg_palavra_notificacao() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_autor uuid := new.atualizado_por;
  v_chave text := 'palavra:' || coalesce(new.atualizado_em::text, clock_timestamp()::text);
begin
  insert into public.notificacoes
    (chave, tipo, kind, user_id, titulo, corpo, url, fire_at, expira_em)
  select v_chave || ':' || u.id,
         'aviso', 'palavra', u.id,
         'Palavra da Célula atualizada',
         'Uma nova Palavra da Célula está disponível para leitura.',
         '/?page=mural', now(), now() + interval '24 hours'
    from public.users u
   where u.id is distinct from v_autor
  on conflict (chave) do nothing;
  return new;
end $$;

drop trigger if exists palavra_notificacao on public.palavra_celula;
create trigger palavra_notificacao
after insert or update on public.palavra_celula
for each row execute function public.trg_palavra_notificacao();

-- Garante que a fila seja acessível apenas pelo despachante server-side.
revoke all on public.notificacoes from anon, authenticated;

commit;

-- Conferência:
-- select tipo, kind, count(*) from public.notificacoes group by tipo, kind;
-- select status, count(*) from public.notificacoes group by status;
-- select status_code, content from net._http_response order by created desc limit 10;
-- O SQL 03_agendador_pg_cron.sql deve estar instalado e apontando para a URL real da Vercel.
