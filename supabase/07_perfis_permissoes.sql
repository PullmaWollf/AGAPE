-- Perfis de permissão configuráveis do AGAPE
create table if not exists public.perfis_permissao (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text not null default '',
  permissoes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users add column if not exists perfil_id uuid references public.perfis_permissao(id) on delete set null;
create unique index if not exists perfis_permissao_nome_lower_key on public.perfis_permissao (lower(nome));

insert into public.perfis_permissao (nome, descricao, permissoes)
values
  ('ADM', 'Acesso total ao gerenciamento da célula', '{"gerencial":true,"usuarios":true,"perfis":true,"mural_publicar":true,"mural_excluir":true,"palavra":true,"escala":true,"modelos":true,"notificacoes":true,"uploads":true}'::jsonb),
  ('Membro', 'Acesso básico ao mural e à escala', '{"mural_publicar":true,"escala_visualizar":true}'::jsonb)
on conflict (nome) do nothing;

update public.users u
set perfil_id = p.id
from public.perfis_permissao p
where u.perfil_id is null and lower(p.nome) = case when u.role = 'adm' then 'adm' else 'membro' end;

create index if not exists users_perfil_id_idx on public.users(perfil_id);
revoke all on public.perfis_permissao from anon, authenticated;
grant select, insert, update, delete on public.perfis_permissao to service_role;
