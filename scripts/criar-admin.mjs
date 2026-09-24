#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { hashSenha } from '../api/_lib/auth.js';
import { loginParaEmail, normalizarLogin } from '../api/_lib/login.js';

const [,, loginArg, senha, ...nomePartes] = process.argv;
const login = normalizarLogin(loginArg || '');
const nome = nomePartes.join(' ').trim();

if (!login || !/^[a-z0-9._-]{3,30}$/.test(login)) throw new Error('Uso: npm run criar-admin -- login senha "Nome completo"');
if (!senha || senha.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
if (!nome || nome.length < 2 || nome.length > 80) throw new Error('Informe um nome entre 2 e 80 caracteres.');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar configuradas.');

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const dominio = process.env.AUTH_EMAIL_DOMAIN || 'celulaagape.app';
const email = loginParaEmail(login, dominio);

const { data: existente } = await db.from('users').select('id').ilike('login', login).maybeSingle();
if (existente) throw new Error(`O login "${login}" já existe na tabela users.`);

const { data: conta, error: authError } = await db.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  user_metadata: { nome },
});
if (authError) throw new Error(`Falha ao criar conta de autenticação: ${authError.message}`);

const { data: usuario, error: dbError } = await db.from('users').insert({
  name: nome,
  login,
  role: 'adm',
  auth_id: conta.user.id,
  pass_hash: hashSenha(senha),
}).select('id, name, login, role').single();

if (dbError) {
  await db.auth.admin.deleteUser(conta.user.id);
  throw new Error(`Falha ao criar usuário no Ágape: ${dbError.message}`);
}

console.log(`Administrador criado: ${usuario.login} (${usuario.name})`);
console.log('Agora entre no site usando o login e a senha informados.');

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // execução direta
}
