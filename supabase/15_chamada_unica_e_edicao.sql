-- ÁGAPE | Chamada única por data e edição explícita
-- Sem remoção de registros existentes. Evita upsert silencioso da mesma reunião.
begin;
create or replace function public.persistir_chamada(
  p_data date, p_registrado_por uuid, p_presencas jsonb, p_edicao boolean
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_total integer;
begin
  if p_data is null or p_registrado_por is null or p_edicao is null
    or jsonb_typeof(p_presencas) is distinct from 'array'
    or jsonb_array_length(p_presencas) = 0
    or jsonb_array_length(p_presencas) > 500 then
    raise exception 'Dados de chamada inválidos' using errcode = '22023';
  end if;
  select count(*) into v_total
  from jsonb_to_recordset(p_presencas) as item(user_id uuid,status text)
  join public.users u on u.id=item.user_id
  where u.ativo and item.status in ('presente','ausente')
    and coalesce(u.data_ingresso_celula,u.created_at::date)<=p_data;
  if v_total<>jsonb_array_length(p_presencas) or
    (select count(distinct item.user_id)
       from jsonb_to_recordset(p_presencas) as item(user_id uuid,status text))
      <>jsonb_array_length(p_presencas) then
    raise exception 'Participantes inválidos ou repetidos' using errcode = '22023';
  end if;
  if p_edicao then
    select id into v_id from public.chamadas
      where data_celula=p_data for update;
    if v_id is null then
      raise exception 'Chamada não encontrada para edição' using errcode='P0002';
    end if;
    update public.chamadas set registrado_por=p_registrado_por, atualizado_em=now()
      where id=v_id;
  else
    insert into public.chamadas(data_celula,registrado_por,atualizado_em)
      values(p_data,p_registrado_por,now())
      on conflict(data_celula) do nothing returning id into v_id;
    if v_id is null then
      raise exception 'Já existe uma chamada salva nesta data' using errcode='23505';
    end if;
  end if;
  insert into public.chamada_presencas(chamada_id,user_id,status,registrado_por,atualizado_em)
  select v_id,item.user_id,item.status,p_registrado_por,now()
  from jsonb_to_recordset(p_presencas) as item(user_id uuid,status text)
  on conflict(chamada_id,user_id) do update
    set status=excluded.status,registrado_por=excluded.registrado_por,atualizado_em=now();
  return v_id;
end;
$$;

create or replace function public.salvar_chamada(
  p_data date,p_registrado_por uuid,p_presencas jsonb
) returns uuid
language sql security invoker set search_path = ''
as $$
  select public.persistir_chamada(p_data,p_registrado_por,p_presencas,false);
$$;
create or replace function public.atualizar_chamada(
  p_data date,p_registrado_por uuid,p_presencas jsonb
) returns uuid
language sql security invoker set search_path = ''
as $$
  select public.persistir_chamada(p_data,p_registrado_por,p_presencas,true);
$$;
revoke all on function public.persistir_chamada(date,uuid,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.salvar_chamada(date,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.atualizar_chamada(date,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.persistir_chamada(date,uuid,jsonb,boolean) to service_role;
grant execute on function public.salvar_chamada(date,uuid,jsonb) to service_role;
grant execute on function public.atualizar_chamada(date,uuid,jsonb) to service_role;
commit;
