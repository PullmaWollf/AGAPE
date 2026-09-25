-- Login exclusivo do AGAPE: sem usuários no Supabase Auth.
alter table public.users add column if not exists pass_hash text;
alter table public.users add column if not exists auth_id uuid;

-- O app autentica pela API própria e mantém o Supabase apenas como banco.
-- Execute depois dos scripts 01, 02, 04 e 05.
