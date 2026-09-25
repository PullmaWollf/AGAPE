-- =====================================================================
-- CÉLULA ÁGAPE — 01_schema.sql
-- Cole no Supabase → SQL Editor → Run.
--
-- É ADITIVO e IDEMPOTENTE: pode rodar mais de uma vez e NÃO derruba o app
-- antigo (não mexe nas políticas RLS existentes; isso fica no 02).
--
-- O que faz:
--   1. Garante as tabelas-base (não altera as que já existem)
--   2. Liga usuários ao Supabase Auth (coluna users.auth_id)
--   3. Cria modelos de escala (3/4/5 semanas), notificações e config
--   4. Cria as funções (RPC) usadas pelo app e pelo despachante de push
--   5. Cria o bucket de mídia do mural (imagens e vídeos de até 15 MB)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Utilitários de migração (removidos no final do script)
-- ---------------------------------------------------------------------
create or replace function public._garantir_pk(p_tabela text) returns void
language plpgsql as $$
begin
  if not exists (
    select 1 from pg_index i
     where i.indrelid = ('public.' || quote_ident(p_tabela))::regclass and i.indisprimary
  ) then
    execute format('alter table public.%I add primary key (id)', p_tabela);
  end if;
end $$;

-- Recria a FK de uma coluna com a ação desejada (cascade / set null),
-- limpando órfãos antes para a constraint poder ser criada.
create or replace function public._recriar_fk(
  p_tabela text, p_coluna text, p_ref text, p_acao text
) returns void language plpgsql as $$
declare r record;
begin
  for r in
    select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f'
       and c.conrelid = ('public.' || quote_ident(p_tabela))::regclass
       and a.attname = p_coluna
       and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table public.%I drop constraint %I', p_tabela, r.conname);
  end loop;

  if p_acao = 'set null' then
    execute format(
      'update public.%I t set %I = null where t.%I is not null and not exists (select 1 from public.%I r where r.id = t.%I)',
      p_tabela, p_coluna, p_coluna, p_ref, p_coluna);
  else
    execute format(
      'delete from public.%I t where t.%I is not null and not exists (select 1 from public.%I r where r.id = t.%I)',
      p_tabela, p_coluna, p_ref, p_coluna);
  end if;

  execute format(
    'alter table public.%I add constraint %I foreign key (%I) references public.%I (id) on delete %s',
    p_tabela, p_tabela || '_' || p_coluna || '_fkey', p_coluna, p_ref, p_acao);
end $$;

-- ---------------------------------------------------------------------
-- 1. Tabelas-base (no-op quando já existem; formato = o banco atual)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  login      text not null,
  pass_hash  text,
  role       text not null default 'membro',
  created_at timestamptz default now()
);

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  type        text not null default 'mensagem',
  content     text not null default '',
  author_id   uuid,
  author_name text not null,
  created_at  timestamptz default now()
);

create table if not exists public.escala_semanas (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  alarm_ts   timestamptz,
  alarm_1d   boolean default false,
  alarm_3h   boolean default false,
  alarm_30m  boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.escala_membros (
  id         uuid primary key default gen_random_uuid(),
  escala_id  uuid not null,
  user_id    uuid,
  user_name  text not null,
  created_at timestamptz default now()
);

create table if not exists public.escala_funcoes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  created_at timestamptz default now()
);

create table if not exists public.escala_atribuicoes (
  id          uuid primary key default gen_random_uuid(),
  escala_id   uuid,
  user_id     uuid,
  user_name   text not null,
  funcao_id   uuid,
  funcao_nome text not null,
  created_at  timestamptz default now()
);

create table if not exists public.push_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,
  endpoint          text,
  subscription_json text not null,
  user_agent        text,
  created_at        timestamptz default now()
);

create table if not exists public.push_alarms (   -- legado: não é mais usada
  id              uuid primary key default gen_random_uuid(),
  alarm_key       text not null,
  fire_at         timestamptz not null,
  title           text not null,
  body            text not null,
  url             text,
  target_user_ids uuid[],
  sent            boolean default false,
  created_at      timestamptz default now()
);

-- O banco atual pode ter sido criado sem PK/defaults: garante o mínimo.
select public._garantir_pk(t) from unnest(array[
  'users','posts','escala_semanas','escala_membros','escala_funcoes',
  'escala_atribuicoes','push_subscriptions','push_alarms']) t;

alter table public.users              alter column id set default gen_random_uuid();
alter table public.users              alter column created_at set default now();
alter table public.posts              alter column id set default gen_random_uuid();
alter table public.posts              alter column created_at set default now();
alter table public.escala_semanas     alter column id set default gen_random_uuid();
alter table public.escala_semanas     alter column created_at set default now();
alter table public.escala_membros     alter column id set default gen_random_uuid();
alter table public.escala_funcoes     alter column id set default gen_random_uuid();
alter table public.escala_atribuicoes alter column id set default gen_random_uuid();
alter table public.escala_atribuicoes alter column created_at set default now();
alter table public.push_subscriptions alter column id set default gen_random_uuid();
alter table public.push_subscriptions alter column created_at set default now();
alter table public.push_alarms        alter column id set default gen_random_uuid();

-- ---------------------------------------------------------------------
-- 2. Novas colunas nas tabelas existentes
-- ---------------------------------------------------------------------
-- users: vínculo com o Supabase Auth; a senha em texto puro deixa de existir.
alter table public.users add column if not exists auth_id uuid;
alter table public.users alter column pass_hash drop not null;
create unique index if not exists users_auth_id_key on public.users (auth_id) where auth_id is not null;

do $$ begin
  create unique index if not exists users_login_lower_key on public.users (lower(login));
exception when unique_violation then
  raise notice 'Existem logins duplicados (ignorando maiúsculas); índice único de login não criado.';
end $$;

-- posts: imagem opcional (arquivo fica no Storage; aqui só o caminho e o tamanho)
alter table public.posts add column if not exists image_path  text;
alter table public.posts add column if not exists image_w     int;
alter table public.posts add column if not exists image_h     int;
alter table public.posts add column if not exists image_bytes int;
  alter table public.posts add column if not exists media_type text not null default 'image';
  alter table public.posts add column if not exists media_duration numeric;
  alter table public.posts alter column content set default '';

-- escala_semanas: aviso no início da semana e origem (modelo)
update public.escala_semanas set alarm_1d  = false where alarm_1d  is null;
update public.escala_semanas set alarm_3h  = false where alarm_3h  is null;
update public.escala_semanas set alarm_30m = false where alarm_30m is null;
alter table public.escala_semanas alter column alarm_1d  set default false;
alter table public.escala_semanas alter column alarm_3h  set default false;
alter table public.escala_semanas alter column alarm_30m set default false;
alter table public.escala_semanas add column if not exists alarm_semana boolean not null default false;
alter table public.escala_semanas add column if not exists modelo_id uuid;

-- ---------------------------------------------------------------------
-- 3. Novas tabelas
-- ---------------------------------------------------------------------
create table if not exists public.config (
  chave         text primary key,
  valor         text not null,
  atualizado_em timestamptz not null default now()
);

-- Segredos usados só pelo agendador do banco (pg_cron). Ninguém no app lê.
create table if not exists public.segredos (
  chave text primary key,
  valor text not null
);

insert into public.config (chave, valor) values
  ('fuso',              'America/Sao_Paulo'),
  ('celula_dia_semana', '5'),       -- 0=domingo … 6=sábado (ajustável no app)
  ('celula_hora',       '19:30'),   -- aparece no texto da notificação
  ('hora_aviso_semana', '09:00')    -- hora do aviso "sua vez nesta semana" (segunda)
on conflict (chave) do nothing;

create table if not exists public.escala_modelos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  semanas      int  not null check (semanas between 1 and 6),
  hora_alarme  time not null default '17:00',
  alarm_semana boolean not null default true,
  alarm_1d     boolean not null default true,
  alarm_3h     boolean not null default false,
  alarm_30m    boolean not null default false,
  criado_em    timestamptz not null default now()
);

create table if not exists public.escala_modelo_itens (
  id          uuid primary key default gen_random_uuid(),
  modelo_id   uuid not null references public.escala_modelos (id) on delete cascade,
  semana      int  not null check (semana between 1 and 6),
  user_id     uuid not null references public.users (id) on delete cascade,
  user_name   text not null,
  funcao_id   uuid,
  funcao_nome text not null default 'Lanche',
  unique (modelo_id, semana, user_id, funcao_nome)
);

create table if not exists public.notificacoes (
  id                uuid primary key default gen_random_uuid(),
  chave             text not null unique,
  tipo              text not null check (tipo in ('escala', 'aviso')),
  kind              text not null,   -- semana | 1d | 3h | 30m | main | aviso
  semana_id         uuid references public.escala_semanas (id) on delete cascade,
  post_id           uuid references public.posts (id) on delete cascade,
  user_id           uuid not null references public.users (id) on delete cascade,
  titulo            text not null,
  corpo             text not null,
  url               text not null default '/?page=escala',
  fire_at           timestamptz not null,
  expira_em         timestamptz not null,
  status            text not null default 'pendente'
                    check (status in ('pendente', 'enviando', 'enviada', 'expirada', 'cancelada')),
  tentativas        int  not null default 0,
  proxima_tentativa timestamptz not null default now(),
  travado_em        timestamptz,
  enviada_em        timestamptz,
  dispositivos_ok   int  not null default 0,
  ultimo_erro       text,
  criado_em         timestamptz not null default now()
);
create index if not exists notificacoes_fila_idx on public.notificacoes (status, fire_at);
create index if not exists notificacoes_user_idx on public.notificacoes (user_id, fire_at desc);

-- Tabelas criadas pelo SQL Editor nascem SEM RLS: liga já, antes de qualquer política.
alter table public.config              enable row level security;
alter table public.segredos            enable row level security;
alter table public.escala_modelos      enable row level security;
alter table public.escala_modelo_itens enable row level security;
alter table public.notificacoes        enable row level security;
alter table public.push_alarms         enable row level security;
revoke all on public.segredos from anon, authenticated;
revoke all on public.push_alarms from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Chaves estrangeiras (recriadas com a ação correta)
-- ---------------------------------------------------------------------
select public._recriar_fk('posts',              'author_id', 'users',            'set null');
select public._recriar_fk('escala_membros',     'escala_id', 'escala_semanas',   'cascade');
select public._recriar_fk('escala_membros',     'user_id',   'users',            'set null');
select public._recriar_fk('escala_atribuicoes', 'escala_id', 'escala_semanas',   'cascade');
select public._recriar_fk('escala_atribuicoes', 'user_id',   'users',            'set null');
select public._recriar_fk('escala_atribuicoes', 'funcao_id', 'escala_funcoes',   'set null');
select public._recriar_fk('push_subscriptions', 'user_id',   'users',            'cascade');
select public._recriar_fk('escala_semanas',     'modelo_id', 'escala_modelos',   'set null');
select public._recriar_fk('escala_modelo_itens','funcao_id', 'escala_funcoes',   'set null');

-- ---------------------------------------------------------------------
-- 5. Dados: função padrão, migração membros → atribuições, deduplicação
-- ---------------------------------------------------------------------
insert into public.escala_funcoes (nome)
select 'Lanche' where not exists (select 1 from public.escala_funcoes where lower(nome) = 'lanche');

insert into public.escala_atribuicoes (escala_id, user_id, user_name, funcao_id, funcao_nome)
select m.escala_id, m.user_id, m.user_name, f.id, f.nome
  from public.escala_membros m
  cross join lateral (select id, nome from public.escala_funcoes where lower(nome) = 'lanche' limit 1) f
 where not exists (
   select 1 from public.escala_atribuicoes a
    where a.escala_id = m.escala_id
      and a.user_id is not distinct from m.user_id
      and a.user_name = m.user_name);

delete from public.escala_atribuicoes a using public.escala_atribuicoes b
 where a.ctid < b.ctid and a.escala_id = b.escala_id
   and a.user_id = b.user_id and a.funcao_nome = b.funcao_nome;
create unique index if not exists escala_atribuicoes_unica
  on public.escala_atribuicoes (escala_id, user_id, funcao_nome) where user_id is not null;
create index if not exists escala_atribuicoes_escala_idx on public.escala_atribuicoes (escala_id);

-- Push: 1 registro por dispositivo (endpoint)
update public.push_subscriptions set endpoint = subscription_json::json ->> 'endpoint'
 where endpoint is null and subscription_json is not null;
delete from public.push_subscriptions a using public.push_subscriptions b
 where a.ctid < b.ctid and a.endpoint is not null and a.endpoint = b.endpoint;
create unique index if not exists push_subscriptions_endpoint_key on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------
-- 6. Funções de identidade (usadas pelas políticas RLS)
-- ---------------------------------------------------------------------
create or replace function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select u.id from public.users u where u.auth_id = auth.uid() limit 1
$$;

create or replace function public.is_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users u where u.auth_id = auth.uid())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users u where u.auth_id = auth.uid() and u.role = 'adm')
$$;

create or replace function public.cfg(p_chave text, p_padrao text default null) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select c.valor from public.config c where c.chave = p_chave), p_padrao)
$$;

-- ---------------------------------------------------------------------
-- 7. Políticas das TABELAS NOVAS (as das tabelas antigas ficam no 02)
-- ---------------------------------------------------------------------
drop policy if exists config_leitura on public.config;
create policy config_leitura on public.config for select to authenticated using (public.is_membro());
drop policy if exists config_admin on public.config;
create policy config_admin on public.config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists modelos_admin on public.escala_modelos;
create policy modelos_admin on public.escala_modelos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists modelo_itens_admin on public.escala_modelo_itens;
create policy modelo_itens_admin on public.escala_modelo_itens for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists notificacoes_admin on public.notificacoes;
create policy notificacoes_admin on public.notificacoes for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Notificações da escala: o banco decide o que deve ser enviado
--    (não depende do navegador do admin estar aberto).
-- ---------------------------------------------------------------------
create or replace view public.notificacoes_desejadas as
with c as (
  select coalesce(public.cfg('fuso'), 'America/Sao_Paulo')             as tz,
         coalesce(public.cfg('hora_aviso_semana'), '09:00')::time      as hora_semana,
         public.cfg('celula_hora')                                     as celula_hora
),
resp as (
  select a.escala_id, a.user_id,
         split_part(u.name, ' ', 1) as primeiro_nome,
         string_agg(a.funcao_nome, ', ' order by a.funcao_nome) as funcoes
    from public.escala_atribuicoes a
    join public.users u on u.id = a.user_id
   group by a.escala_id, a.user_id, split_part(u.name, ' ', 1)
),
base as (
  select s.id as semana_id, s.date as dia, s.alarm_ts, s.alarm_1d, s.alarm_3h, s.alarm_30m,
         s.alarm_semana, r.user_id, r.primeiro_nome, r.funcoes,
         c.tz, c.hora_semana, c.celula_hora
    from public.escala_semanas s
    join resp r on r.escala_id = s.id
   cross join c
   where s.date >= (now() at time zone c.tz)::date - 1
),
alvos as (
  select b.*, k.kind, k.fire_at,
         case k.kind when 'main' then interval '3 hours'
                     when '30m'  then interval '20 minutes'
                     when '3h'   then interval '90 minutes'
                     when '1d'   then interval '6 hours'
                     else             interval '12 hours' end as validade
    from base b
   cross join lateral (values
     ('semana'::text, case when b.alarm_semana
        then ((b.dia - (extract(isodow from b.dia)::int - 1)) + b.hora_semana) at time zone b.tz end),
     ('1d'::text,  case when b.alarm_ts is not null and b.alarm_1d  then b.alarm_ts - interval '1 day'   end),
     ('3h'::text,  case when b.alarm_ts is not null and b.alarm_3h  then b.alarm_ts - interval '3 hours' end),
     ('30m'::text, case when b.alarm_ts is not null and b.alarm_30m then b.alarm_ts - interval '30 minutes' end),
     ('main'::text, b.alarm_ts)
   ) k (kind, fire_at)
   where k.fire_at is not null
)
select 'esc:' || a.semana_id || ':' || a.user_id || ':' || a.kind as chave,
       a.semana_id, a.user_id, a.kind, a.fire_at,
       a.fire_at + a.validade as expira_em,
       case a.kind when 'semana' then '🧁 Sua vez nesta semana' else '🧁 Lembrete da escala' end as titulo,
       case a.kind
         when 'semana' then
           a.primeiro_nome || ', '
           || (array['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'])
              [extract(dow from a.dia)::int + 1]
           || ' (' || to_char(a.dia, 'DD/MM') || ')'
           || coalesce(' às ' || a.celula_hora, '')
           || ': você está na escala de ' || a.funcoes || '.'
         else
           a.primeiro_nome || ', '
           || case (a.dia - (a.fire_at at time zone a.tz)::date)
                when 0 then 'hoje' when 1 then 'amanhã'
                else 'dia ' || to_char(a.dia, 'DD/MM') end
           || coalesce(' às ' || a.celula_hora, '')
           || ': você está na escala de ' || a.funcoes || ' da Célula Ágape.'
       end as corpo,
       '/?page=escala'::text as url
  from alvos a
 where a.fire_at + a.validade > now();

revoke all on public.notificacoes_desejadas from anon, authenticated;

create or replace function public.gerar_notificacoes() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('agape_gerar_notificacoes'));

  -- o que já passou da validade sem ser entregue
  update public.notificacoes set status = 'expirada',
         ultimo_erro = coalesce(ultimo_erro, 'expirou sem ser entregue')
   where status = 'pendente' and expira_em <= now();

  -- cria/atualiza conforme a escala atual
  insert into public.notificacoes as n
         (chave, tipo, kind, semana_id, user_id, titulo, corpo, url, fire_at, expira_em)
  select d.chave, 'escala', d.kind, d.semana_id, d.user_id, d.titulo, d.corpo, d.url, d.fire_at, d.expira_em
    from public.notificacoes_desejadas d
  on conflict (chave) do update set
    titulo = excluded.titulo,
    corpo  = excluded.corpo,
    url    = excluded.url,
    status = case when n.status = 'enviando' then n.status
                  when n.status = 'cancelada' or n.fire_at is distinct from excluded.fire_at then 'pendente'
                  else n.status end,
    tentativas = case when n.status <> 'enviando'
                       and (n.status = 'cancelada' or n.fire_at is distinct from excluded.fire_at) then 0
                      else n.tentativas end,
    proxima_tentativa = case when n.status <> 'enviando'
                       and (n.status = 'cancelada' or n.fire_at is distinct from excluded.fire_at) then now()
                      else n.proxima_tentativa end,
    fire_at   = excluded.fire_at,
    expira_em = excluded.expira_em;

  -- pessoa removida da semana / alarme desligado → cancela o que ainda não saiu
  update public.notificacoes n set status = 'cancelada', travado_em = null
   where n.tipo = 'escala' and n.status = 'pendente'
     and not exists (select 1 from public.notificacoes_desejadas d where d.chave = n.chave);

  delete from public.notificacoes where criado_em < now() - interval '60 days';
end $$;

-- Reivindica (com trava) o que está na hora de enviar. Devolve JSON com os
-- dispositivos de cada destinatário para o despachante (Vercel) entregar.
create or replace function public.claim_notificacoes(p_limite int default 100) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  perform public.gerar_notificacoes();

  update public.notificacoes set status = 'pendente', travado_em = null
   where status = 'enviando' and travado_em < now() - interval '3 minutes';

  with alvo as (
    select n.id from public.notificacoes n
     where n.status = 'pendente' and n.fire_at <= now()
       and n.proxima_tentativa <= now() and n.expira_em > now()
     order by n.fire_at, n.id
     limit p_limite
     for update skip locked
  ), upd as (
    update public.notificacoes n
       set status = 'enviando', travado_em = now(), tentativas = n.tentativas + 1
      from alvo where n.id = alvo.id
    returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'user_id', u.user_id, 'kind', u.kind,
           'titulo', u.titulo, 'corpo', u.corpo, 'url', u.url,
           'tentativas', u.tentativas, 'expira_em', u.expira_em,
           'subs', coalesce((select jsonb_agg(jsonb_build_object('id', ps.id, 'subscription_json', ps.subscription_json))
                              from public.push_subscriptions ps where ps.user_id = u.user_id), '[]'::jsonb)
         )), '[]'::jsonb)
    into v
    from upd u;
  return v;
end $$;

create or replace function public.finalizar_notificacao(p_id uuid, p_ok int, p_erro text default null)
returns void language sql security definer set search_path = public as $$
  update public.notificacoes set
    status            = case when p_ok > 0 then 'enviada' else 'pendente' end,
    enviada_em        = case when p_ok > 0 then now() else enviada_em end,
    dispositivos_ok   = case when p_ok > 0 then p_ok else dispositivos_ok end,
    ultimo_erro       = case when p_ok > 0 then null else left(p_erro, 300) end,
    proxima_tentativa = case when p_ok > 0 then proxima_tentativa
                             else now() + least(interval '10 minutes',
                                                interval '1 minute' * power(2, least(tentativas, 5) - 1)) end,
    travado_em        = null
  where id = p_id and status = 'enviando'
$$;

revoke all on function public.gerar_notificacoes()                    from public, anon, authenticated;
revoke all on function public.claim_notificacoes(int)                 from public, anon, authenticated;
revoke all on function public.finalizar_notificacao(uuid, int, text)  from public, anon, authenticated;
grant execute on function public.gerar_notificacoes()                   to service_role;
grant execute on function public.claim_notificacoes(int)                to service_role;
grant execute on function public.finalizar_notificacao(uuid, int, text) to service_role;

-- ---------------------------------------------------------------------
-- 9. Posts: identidade garantida no servidor + aviso vira notificação
-- ---------------------------------------------------------------------
create or replace function public.trg_posts_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.me();
begin
  if v_me is not null then            -- requisição de usuário logado: não confia no cliente
    new.author_id := v_me;
    select u.name into new.author_name from public.users u where u.id = v_me;
    if new.image_path is not null and split_part(new.image_path, '/', 1) <> auth.uid()::text then
      raise exception 'caminho de imagem inválido';
    end if;
  end if;
  new.content := coalesce(new.content, '');
if new.image_path is not null and new.media_type = 'video' and coalesce(new.image_bytes, 0) > 104857600 then
  raise exception 'vídeo acima do limite de 15 MB';
  end if;
  if new.image_path is not null and new.media_type <> 'video' and coalesce(new.image_bytes, 0) > 307200 then
  raise exception 'imagem acima do limite de 300 KB';
  end if;
  if new.media_type = 'video' and (new.media_duration is null or new.media_duration > 60) then
  raise exception 'vídeo acima de 1 minuto';
  end if;
  if btrim(new.content) = '' and new.image_path is null then
    raise exception 'post vazio';
  end if;
  return new;
end $$;

drop trigger if exists posts_antes on public.posts;
create trigger posts_antes before insert on public.posts
  for each row execute function public.trg_posts_antes();

create or replace function public.trg_posts_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notificacoes (chave, tipo, kind, post_id, user_id, titulo, corpo, url, fire_at, expira_em)
  select 'aviso:' || new.id || ':' || u.id, 'aviso', 'aviso', new.id, u.id,
         '📢 Aviso — Célula Ágape',
         coalesce(nullif(left(regexp_replace(btrim(new.content), '\s+', ' ', 'g'), 140), ''), 'Novo aviso com imagem'),
         '/?page=mural', now(), now() + interval '24 hours'
    from public.users u
   where u.id is distinct from new.author_id
  on conflict (chave) do nothing;
  return new;
end $$;

drop trigger if exists posts_aviso on public.posts;
create trigger posts_aviso after insert on public.posts
  for each row when (new.type = 'aviso') execute function public.trg_posts_aviso();

-- ---------------------------------------------------------------------
-- 10. Dispositivos (push) — só via RPC, assim um aparelho pode trocar de dono
-- ---------------------------------------------------------------------
create or replace function public.registrar_dispositivo(p_endpoint text, p_subscription text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.me();
begin
  if v_me is null then raise exception 'não autenticado'; end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_subscription, '') = '' then
    raise exception 'dispositivo inválido';
  end if;
  insert into public.push_subscriptions as ps (user_id, endpoint, subscription_json, user_agent)
  values (v_me, p_endpoint, p_subscription, left(p_user_agent, 200))
  on conflict (endpoint) do update
     set user_id = excluded.user_id, subscription_json = excluded.subscription_json,
         user_agent = excluded.user_agent;
end $$;

create or replace function public.remover_dispositivo(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = public.me()
$$;

create or replace function public.dispositivos_por_usuario() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'apenas administradores'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.name, 'role', u.role,
             'dispositivos', (select count(*) from public.push_subscriptions ps where ps.user_id = u.id))
             order by u.name)
      from public.users u), '[]'::jsonb);
end $$;

create or replace function public.uso_imagens() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('arquivos', count(*), 'bytes', coalesce(sum(image_bytes), 0))
    from public.posts where image_path is not null
$$;

-- ---------------------------------------------------------------------
-- 11. Escala: salvar semana / salvar modelo / gerar mês (tudo atômico, só ADM)
-- ---------------------------------------------------------------------
-- p = { id?, date, alarm_local?: 'YYYY-MM-DDTHH:MI', alarm_1d, alarm_3h, alarm_30m, alarm_semana,
--       atribuicoes: [{ user_id, funcao_id?, funcao_nome? }] }
create or replace function public.salvar_semana(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tz  text := coalesce(public.cfg('fuso'), 'America/Sao_Paulo');
  v_id  uuid := nullif(p ->> 'id', '')::uuid;
  v_ts  timestamptz;
  v_at  jsonb;
begin
  if not public.is_admin() then raise exception 'apenas administradores'; end if;
  if coalesce(p ->> 'date', '') = '' then raise exception 'informe a data da célula'; end if;

  v_ts := case when coalesce(p ->> 'alarm_local', '') = ''
               then null else ((p ->> 'alarm_local')::timestamp at time zone v_tz) end;

  if v_id is null then
    insert into public.escala_semanas (date, alarm_ts, alarm_1d, alarm_3h, alarm_30m, alarm_semana)
    values ((p ->> 'date')::date, v_ts,
            coalesce((p ->> 'alarm_1d')::boolean, false), coalesce((p ->> 'alarm_3h')::boolean, false),
            coalesce((p ->> 'alarm_30m')::boolean, false), coalesce((p ->> 'alarm_semana')::boolean, false))
    returning id into v_id;
  else
    update public.escala_semanas set
      date = (p ->> 'date')::date, alarm_ts = v_ts,
      alarm_1d = coalesce((p ->> 'alarm_1d')::boolean, false),
      alarm_3h = coalesce((p ->> 'alarm_3h')::boolean, false),
      alarm_30m = coalesce((p ->> 'alarm_30m')::boolean, false),
      alarm_semana = coalesce((p ->> 'alarm_semana')::boolean, false)
     where id = v_id;
    if not found then raise exception 'semana não encontrada'; end if;
    delete from public.escala_atribuicoes where escala_id = v_id;
  end if;

  for v_at in select * from jsonb_array_elements(coalesce(p -> 'atribuicoes', '[]'::jsonb)) loop
    insert into public.escala_atribuicoes (escala_id, user_id, user_name, funcao_id, funcao_nome)
    select v_id, u.id, u.name, f.id, coalesce(f.nome, nullif(v_at ->> 'funcao_nome', ''), 'Lanche')
      from public.users u
      left join public.escala_funcoes f on f.id = nullif(v_at ->> 'funcao_id', '')::uuid
     where u.id = (v_at ->> 'user_id')::uuid
    on conflict (escala_id, user_id, funcao_nome) where user_id is not null do nothing;
  end loop;
  return v_id;
end $$;

-- p = { id?, nome, semanas, hora_alarme:'HH:MI', alarm_semana, alarm_1d, alarm_3h, alarm_30m,
--       itens: [{ semana, user_id, funcao_id?, funcao_nome? }] }
create or replace function public.salvar_modelo(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_n  int  := (p ->> 'semanas')::int;
  v_it jsonb;
begin
  if not public.is_admin() then raise exception 'apenas administradores'; end if;
  if coalesce(btrim(p ->> 'nome'), '') = '' then raise exception 'informe o nome do modelo'; end if;
  if v_n is null or v_n not between 1 and 6 then raise exception 'número de semanas inválido'; end if;

  if v_id is null then
    insert into public.escala_modelos (nome, semanas, hora_alarme, alarm_semana, alarm_1d, alarm_3h, alarm_30m)
    values (btrim(p ->> 'nome'), v_n, coalesce(nullif(p ->> 'hora_alarme', '')::time, '17:00'),
            coalesce((p ->> 'alarm_semana')::boolean, true), coalesce((p ->> 'alarm_1d')::boolean, true),
            coalesce((p ->> 'alarm_3h')::boolean, false),   coalesce((p ->> 'alarm_30m')::boolean, false))
    returning id into v_id;
  else
    update public.escala_modelos set nome = btrim(p ->> 'nome'), semanas = v_n,
           hora_alarme = coalesce(nullif(p ->> 'hora_alarme', '')::time, '17:00'),
           alarm_semana = coalesce((p ->> 'alarm_semana')::boolean, true),
           alarm_1d = coalesce((p ->> 'alarm_1d')::boolean, true),
           alarm_3h = coalesce((p ->> 'alarm_3h')::boolean, false),
           alarm_30m = coalesce((p ->> 'alarm_30m')::boolean, false)
     where id = v_id;
    if not found then raise exception 'modelo não encontrado'; end if;
    delete from public.escala_modelo_itens where modelo_id = v_id;
  end if;

  for v_it in select * from jsonb_array_elements(coalesce(p -> 'itens', '[]'::jsonb)) loop
    if (v_it ->> 'semana')::int between 1 and v_n then
      insert into public.escala_modelo_itens (modelo_id, semana, user_id, user_name, funcao_id, funcao_nome)
      select v_id, (v_it ->> 'semana')::int, u.id, u.name, f.id,
             coalesce(f.nome, nullif(v_it ->> 'funcao_nome', ''), 'Lanche')
        from public.users u
        left join public.escala_funcoes f on f.id = nullif(v_it ->> 'funcao_id', '')::uuid
       where u.id = (v_it ->> 'user_id')::uuid
      on conflict do nothing;
    end if;
  end loop;
  return v_id;
end $$;

-- Gera as semanas de um mês a partir de um modelo.
--   p_datas    : datas das células do mês (o app calcula pelo dia da semana configurado)
--   p_rotacao  : desloca o rodízio (semana 1 do modelo passa a valer na data k+1…)
--   p_substituir: se já existir escala numa data, apaga e recria (senão, ignora a data)
create or replace function public.aplicar_modelo(
  p_modelo uuid, p_datas date[], p_rotacao int default 0, p_substituir boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.escala_modelos;
  v_tz text := coalesce(public.cfg('fuso'), 'America/Sao_Paulo');
  v_datas date[];
  v_n int; v_i int; v_d date; v_sem int; v_id uuid;
  v_criadas int := 0; v_ignoradas int := 0; v_substituidas int := 0;
begin
  if not public.is_admin() then raise exception 'apenas administradores'; end if;
  select * into m from public.escala_modelos where id = p_modelo;
  if not found then raise exception 'modelo não encontrado'; end if;

  select array_agg(distinct d order by d) into v_datas from unnest(p_datas) d;
  v_n := coalesce(array_length(v_datas, 1), 0);
  if v_n = 0 then raise exception 'nenhuma data informada'; end if;
  if v_n <> m.semanas then
    raise exception 'o modelo "%" tem % semanas, mas foram informadas % datas', m.nome, m.semanas, v_n;
  end if;

  for v_i in 1..v_n loop
    v_d := v_datas[v_i];
    if exists (select 1 from public.escala_semanas where date = v_d) then
      if p_substituir then
        delete from public.escala_semanas where date = v_d;
        v_substituidas := v_substituidas + 1;
      else
        v_ignoradas := v_ignoradas + 1;
        continue;
      end if;
    end if;

    insert into public.escala_semanas (date, alarm_ts, alarm_1d, alarm_3h, alarm_30m, alarm_semana, modelo_id)
    values (v_d, ((v_d + m.hora_alarme) at time zone v_tz),
            m.alarm_1d, m.alarm_3h, m.alarm_30m, m.alarm_semana, m.id)
    returning id into v_id;

    v_sem := ((v_i - 1 + p_rotacao) % v_n + v_n) % v_n + 1;
    insert into public.escala_atribuicoes (escala_id, user_id, user_name, funcao_id, funcao_nome)
    select v_id, i.user_id, u.name, i.funcao_id, i.funcao_nome
      from public.escala_modelo_itens i
      join public.users u on u.id = i.user_id
     where i.modelo_id = m.id and i.semana = v_sem
    on conflict do nothing;
    v_criadas := v_criadas + 1;
  end loop;

  return jsonb_build_object('criadas', v_criadas, 'ignoradas', v_ignoradas, 'substituidas', v_substituidas);
end $$;

revoke all on function public.registrar_dispositivo(text, text, text) from public, anon;
revoke all on function public.remover_dispositivo(text)               from public, anon;
revoke all on function public.dispositivos_por_usuario()              from public, anon;
revoke all on function public.salvar_semana(jsonb)                    from public, anon;
revoke all on function public.salvar_modelo(jsonb)                    from public, anon;
revoke all on function public.aplicar_modelo(uuid, date[], int, boolean) from public, anon;
grant execute on function public.registrar_dispositivo(text, text, text) to authenticated;
grant execute on function public.remover_dispositivo(text)               to authenticated;
grant execute on function public.dispositivos_por_usuario()              to authenticated;
grant execute on function public.salvar_semana(jsonb)                    to authenticated;
grant execute on function public.salvar_modelo(jsonb)                    to authenticated;
grant execute on function public.aplicar_modelo(uuid, date[], int, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 12. Storage: bucket "mural" (público para leitura, imagens e vídeos curtos)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mural', 'mural', true, 104857600, array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
   set public = true, file_size_limit = 104857600,
       allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime'];

drop policy if exists mural_leitura on storage.objects;
create policy mural_leitura on storage.objects for select to public
  using (bucket_id = 'mural');

drop policy if exists mural_envio on storage.objects;
create policy mural_envio on storage.objects for insert to authenticated
  with check (
    bucket_id = 'mural'
    and (public.is_membro() or public.is_admin())
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists mural_exclusao on storage.objects;
create policy mural_exclusao on storage.objects for delete to authenticated
  using (bucket_id = 'mural'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- 13. Realtime para a nova tabela de atribuições
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.escala_atribuicoes;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 14. Limpeza dos utilitários
-- ---------------------------------------------------------------------
drop function if exists public._garantir_pk(text);
drop function if exists public._recriar_fk(text, text, text, text);

commit;
