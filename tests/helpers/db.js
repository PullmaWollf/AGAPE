// Ambiente de teste: Postgres real (PGlite/WASM) imitando o essencial do Supabase
// (roles anon/authenticated/service_role, schema auth, schema storage).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sql = (nome) => readFileSync(path.join(raiz, 'supabase', nome), 'utf8');

const STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  grant all on all tables in schema storage to anon, authenticated, service_role;
`;

// Schema "vivo" informado pelo usuário (CSV): sem PK, sem defaults, com políticas abertas.
const LEGADO = `
  CREATE TABLE users (pass_hash text NOT NULL, created_at timestamptz, name text NOT NULL, id uuid NOT NULL, login text NOT NULL, role text NOT NULL);
  CREATE TABLE posts (content text NOT NULL, type text NOT NULL, author_id uuid, author_name text NOT NULL, created_at timestamptz, id uuid NOT NULL);
  CREATE TABLE escala_semanas (id uuid NOT NULL, date date NOT NULL, alarm_1d boolean, alarm_3h boolean, alarm_30m boolean, created_at timestamptz, alarm_ts timestamptz);
  CREATE TABLE escala_membros (escala_id uuid NOT NULL, user_id uuid, created_at timestamptz, id uuid NOT NULL, user_name text NOT NULL);
  CREATE TABLE escala_funcoes (created_at timestamptz, nome text NOT NULL, id uuid NOT NULL);
  CREATE TABLE escala_atribuicoes (funcao_id uuid, escala_id uuid, user_id uuid, id uuid NOT NULL, user_name text NOT NULL, funcao_nome text NOT NULL, created_at timestamptz);
  CREATE TABLE push_alarms (id uuid NOT NULL, fire_at timestamptz NOT NULL, target_user_ids uuid[], sent boolean, created_at timestamptz, alarm_key text NOT NULL, title text NOT NULL, body text NOT NULL, url text);
  CREATE TABLE push_subscriptions (created_at timestamptz, endpoint text, user_id uuid, id uuid NOT NULL, subscription_json text NOT NULL, user_agent text);
  ALTER TABLE users ENABLE ROW LEVEL SECURITY; ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE escala_semanas ENABLE ROW LEVEL SECURITY; ALTER TABLE escala_membros ENABLE ROW LEVEL SECURITY;
  CREATE POLICY acesso_total_users ON public.users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  CREATE POLICY acesso_total_posts ON public.posts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  CREATE POLICY acesso_total_escala_semanas ON public.escala_semanas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  CREATE POLICY acesso_total_escala_membros ON public.escala_membros FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
`;

export async function novoBanco({ legado = false } = {}) {
  const db = new PGlite();
  await db.exec(STUBS);
  if (legado) await db.exec(LEGADO);
  return db;
}

export async function comoUsuario(db, authId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${authId}', false);`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
export async function comoAnon(db, fn) {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
export async function comoServico(db, fn) {
  await db.exec(`set role service_role;`);
  try { return await fn(); } finally { await db.exec(`reset role;`); }
}
