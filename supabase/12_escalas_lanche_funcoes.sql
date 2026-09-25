-- Separa escalas de lanche e escalas de funções e permite atribuições múltiplas.
alter table public.escala_semanas add column if not exists tipo text not null default 'lanche';
alter table public.escala_semanas drop constraint if exists escala_semanas_tipo_check;
alter table public.escala_semanas add constraint escala_semanas_tipo_check check (tipo in ('lanche', 'funcoes'));

-- A combinação pessoa + função continua única dentro da mesma semana,
-- mas pessoas diferentes podem compartilhar uma função e uma pessoa pode ter várias funções.
alter table public.escala_atribuicoes drop constraint if exists escala_atribuicoes_unica;
drop index if exists public.escala_atribuicoes_unica;
create unique index if not exists escala_atribuicoes_unica
  on public.escala_atribuicoes (escala_id, user_id, funcao_id)
  where user_id is not null and funcao_id is not null;
create unique index if not exists escala_atribuicoes_lanche_unica
  on public.escala_atribuicoes (escala_id, user_id)
  where user_id is not null and funcao_id is null;
create index if not exists escala_semanas_tipo_idx on public.escala_semanas (tipo, date);
