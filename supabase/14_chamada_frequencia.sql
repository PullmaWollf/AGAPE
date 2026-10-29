-- ÁGAPE | Chamada de presença e frequência
-- Migração ADITIVA. NÃO EXECUTAR NO BANCO DE PRODUÇÃO SEM APROVAÇÃO.
-- Compatível com login próprio do Ágape: consulta/escrita apenas pela API autorizada.
begin;

alter table public.users
  add column if not exists ativo boolean not null default true;
alter table public.users
  add column if not exists data_ingresso_celula date;

create table if not exists public.chamadas (
  id uuid primary key default gen_random_uuid(),
  data_celula date not null unique,
  registrado_por uuid references public.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.chamada_presencas (
  id uuid primary key default gen_random_uuid(),
  chamada_id uuid not null references public.chamadas(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete restrict,
  status text not null check (status in ('presente', 'ausente')),
  registrado_por uuid references public.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  constraint chamada_presencas_unica unique(chamada_id, user_id)
);

create index if not exists chamadas_data_idx on public.chamadas (data_celula desc);
create index if not exists chamada_presencas_user_id_idx on public.chamada_presencas(user_id);

-- RLS como defesa em profundidade: o Supabase Auth NÃO é o login do Ágape.
-- Portanto, nenhuma policy permite acesso anon/authenticated via Data API.
alter table public.chamadas enable row level security;
alter table public.chamada_presencas enable row level security;
revoke all on table public.chamadas, public.chamada_presencas from public, anon, authenticated;
grant select, insert, update, delete on public.chamadas, public.chamada_presencas to service_role;

-- A API verifica perfil+permissões ANTES de usar service_role.
-- RPC de salvamento atômico. É SECURITY INVOKER e executável apenas por service_role.
create or replace function public.salvar_chamada(
  p_data date, p_registrado_por uuid, p_presencas jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_total integer;
begin
  if p_data is null or p_registrado_por is null
    or jsonb_typeof(p_presencas) is distinct from 'array'
    or jsonb_array_length(p_presencas) = 0
    or jsonb_array_length(p_presencas) > 500 then
    raise exception 'Dados de chamada inválidos' using errcode = '22023';
  end if;

  select count(*) into v_total
  from jsonb_to_recordset(p_presencas) as item(user_id uuid, status text)
  join public.users u on u.id = item.user_id
  where u.ativo and item.status in ('presente','ausente')
    and coalesce(u.data_ingresso_celula, u.created_at::date) <= p_data;

  if v_total <> jsonb_array_length(p_presencas) or
    (select count(distinct item.user_id)
       from jsonb_to_recordset(p_presencas) as item(user_id uuid, status text))
       <> jsonb_array_length(p_presencas)
  then
    raise exception 'Membros inválidos, repetidos ou ainda não integrantes da célula'
      using errcode = '22023';
  end if;

  insert into public.chamadas (data_celula, registrado_por, atualizado_em)
  values (p_data, p_registrado_por, now())
  on conflict (data_celula) do update set
    registrado_por = excluded.registrado_por, atualizado_em = now()
  returning id into v_id;

  insert into public.chamada_presencas (
    chamada_id, user_id, status, registrado_por, atualizado_em
  )
  select v_id, item.user_id, item.status, p_registrado_por, now()
  from jsonb_to_recordset(p_presencas) as item(user_id uuid, status text)
  on conflict (chamada_id,user_id) do update set
    status = excluded.status,
    registrado_por = excluded.registrado_por, atualizado_em = now();

  return v_id;
end;
$$;
revoke all on function public.salvar_chamada(date,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.salvar_chamada(date,uuid,jsonb) to service_role;

-- Novas permissões: ativadas apenas para os perfis realmente elegíveis.
update public.perfis_permissao
set permissoes = permissoes ||
  case when lower(trim(nome)) in ('líder','lider','líder em treinamento','lider em treinamento')
    then '{"chamada_registrar":true,"frequencia_relatorio":true}'::jsonb
    else '{"chamada_registrar":false,"frequencia_relatorio":false}'::jsonb end,
  updated_at = now();

commit;
