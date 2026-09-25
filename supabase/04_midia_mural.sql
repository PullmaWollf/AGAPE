-- Execute uma vez no Supabase para habilitar vídeos e os novos metadados.
alter table public.posts add column if not exists media_type text not null default 'image';
alter table public.posts add column if not exists media_duration numeric;

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime']
where id = 'mural';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mural', 'mural', true, 104857600, array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;
