-- =====================================================================
-- CÉLULA ÁGAPE — 03_agendador_pg_cron.sql
-- Agendador principal das notificações: roda DENTRO do Supabase (pg_cron),
-- a cada minuto, e chama /api/cron-alarms na Vercel. Muito mais confiável
-- que o cron do GitHub Actions (que atrasa, pula execuções e é desligado
-- após 60 dias sem commits). O workflow do GitHub fica só como reserva.
--
-- ANTES de rodar, edite os dois valores marcados com  <<< EDITE >>>
-- (o mesmo APP_URL e o mesmo CRON_SECRET configurados na Vercel).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

insert into public.segredos (chave, valor) values
  ('app_url',     'https://SEU-APP.vercel.app'),   -- <<< EDITE >>> sem barra no final
  ('cron_secret', 'COLE_AQUI_O_CRON_SECRET')       -- <<< EDITE >>> igual ao env CRON_SECRET da Vercel
on conflict (chave) do update set valor = excluded.valor;

-- remove agendamentos antigos com o mesmo nome (rodar de novo é seguro)
select cron.unschedule(jobname) from cron.job where jobname in ('agape-despachar', 'agape-limpeza');

select cron.schedule(
  'agape-despachar',
  '* * * * *',
  $job$
    select net.http_post(
      url     := (select valor from public.segredos where chave = 'app_url') || '/api/cron-alarms',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || (select valor from public.segredos where chave = 'cron_secret')),
      body    := '{}'::jsonb,
      timeout_milliseconds := 25000
    );
  $job$
);

-- histórico do cron cresce sem parar: mantém 3 dias
select cron.schedule(
  'agape-limpeza',
  '17 3 * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '3 days'; $job$
);

-- Conferir depois (deve aparecer 'succeeded' a cada minuto):
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Ver a resposta da Vercel:
--   select status_code, content from net._http_response order by created desc limit 5;
