-- AGAPE: limites de vídeo, exclusão, Palavra da Célula e limpeza mensal.
-- Execute uma vez no Supabase.

alter table public.posts add column if not exists media_type text not null default 'image';
alter table public.posts add column if not exists media_duration numeric;

update storage.buckets set file_size_limit = 104857600,
  allowed_mime_types = array['image/webp','image/jpeg','image/png','video/mp4','video/webm','video/quicktime']
where id = 'mural';

create table if not exists public.palavra_celula (
  id boolean primary key default true check (id = true),
  titulo text not null default 'Palavra da Célula',
  arquivo_path text not null,
  nome_arquivo text not null,
  paginas smallint not null default 1 check (paginas between 2 and 4),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.palavra_celula enable row level security;
drop policy if exists palavra_leitura on public.palavra_celula;
create policy palavra_leitura on public.palavra_celula for select to authenticated using (true);
drop policy if exists palavra_admin on public.palavra_celula;
create policy palavra_admin on public.palavra_celula for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists palavra_storage_leitura on storage.objects;
create policy palavra_storage_leitura on storage.objects for select to public using (bucket_id = 'palavra-celula');
drop policy if exists palavra_storage_admin on storage.objects;
create policy palavra_storage_admin on storage.objects for all to authenticated using (bucket_id = 'palavra-celula' and public.is_admin()) with check (bucket_id = 'palavra-celula' and public.is_admin());
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('palavra-celula','palavra-celula',true,15728640,array['application/pdf']) on conflict (id) do update set public=true,file_size_limit=15728640,allowed_mime_types=array['application/pdf'];

create or replace function public.validar_post_mural()
returns trigger language plpgsql set search_path = public as $$
declare videos integer; limite integer;
begin
  if new.media_type = 'video' then
    if coalesce(new.media_duration,0) > 60 then raise exception 'Vídeo deve ter no máximo 1 minuto'; end if;
    if coalesce(new.image_bytes,0) > 104857600 then raise exception 'Vídeo acima de 100 MB'; end if;
    select count(*) into videos from public.posts where author_id = new.author_id and media_type = 'video' and id <> new.id;
    select case when exists(select 1 from public.users where id=new.author_id and role='adm') then 3 else 1 end into limite;
    if videos >= limite then raise exception 'Limite de vídeos deste usuário atingido'; end if;
  elsif coalesce(new.image_bytes,0) > 307200 then raise exception 'Imagem acima do limite de 300 KB';
  end if;
  return new;
end $$;
drop trigger if exists validar_post_mural on public.posts;
create trigger validar_post_mural before insert or update on public.posts for each row execute function public.validar_post_mural();

create or replace function public.limpar_mural_mes_anterior()
returns void language plpgsql security definer set search_path = public as $$
declare inicio date := date_trunc('month', current_date - interval '1 month')::date; fim date := (date_trunc('month', current_date)::date - 1);
begin
  delete from public.posts where created_at::date < (fim - 6) and created_at::date >= inicio;
end $$;

-- Requer pg_cron habilitado no projeto. Executa às 03:00 no dia 1.
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('agape-limpeza-mensal', '0 3 1 * *', 'select public.limpar_mural_mes_anterior()');
exception when others then raise notice 'pg_cron não disponível; configure o cron pela Vercel usando /api/cron-limpeza-mural'; end $$;

alter table public.posts enable row level security;
drop policy if exists posts_delete_proprio_ou_admin on public.posts;
create policy posts_delete_proprio_ou_admin on public.posts for delete to authenticated using (author_id = (select id from public.users where auth_id = auth.uid()) or public.is_admin());
