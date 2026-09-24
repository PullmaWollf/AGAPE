#!/usr/bin/env node
// Migra os usuários da tabela "users" (senha em texto puro) para o Supabase Auth.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... \
//     node scripts/migrar-usuarios.mjs            # executa
//     node scripts/migrar-usuarios.mjs --dry-run  # só mostra o que faria
//
// • Cada usuário ganha uma conta no Auth com o e-mail interno <login>@<AUTH_EMAIL_DOMAIN>.
// • A senha atual continua valendo (o Auth guarda só o hash). Se a senha tiver menos de
//   6 caracteres (mínimo do Supabase), é gerada uma senha temporária, exibida no final.
// • É seguro rodar de novo: quem já tem conta é pulado.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loginParaEmail } from '../api/_lib/login.js';

const SENHA_MIN = 6;
const senhaTemporaria = () => randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').slice(0, 10);

export async function migrar({ db, dominio, dryRun = false, log = console.log }) {
  // 1. Pré-teste: o Supabase aceita o e-mail interno? (evita descobrir isso no meio)
  const sonda = `sonda-${randomBytes(4).toString('hex')}@${dominio}`;
  if (!dryRun) {
    const { data, error } = await db.auth.admin.createUser({ email: sonda, password: senhaTemporaria() + 'A1', email_confirm: true });
    if (error) {
      throw new Error(`O Supabase recusou o domínio de e-mail interno "${dominio}": ${error.message}\n` +
        `→ Defina AUTH_EMAIL_DOMAIN com outro domínio (aqui e na Vercel) e ajuste EMAIL_DOMAIN em js/utils.js.`);
    }
    await db.auth.admin.deleteUser(data.user.id);
    log(`✔ Pré-teste do domínio "${dominio}" ok.`);
  }

  // 2. Lista os usuários
  const { data: usuarios, error: eLista } = await db.from('users').select('*').order('created_at');
  if (eLista) throw new Error(`Falha ao ler users: ${eLista.message}`);
  const pendentes = usuarios.filter((u) => !u.auth_id);
  log(`${usuarios.length} usuário(s); ${pendentes.length} a migrar; ${usuarios.length - pendentes.length} já migrado(s).`);

  const relatorio = { migrados: [], temporarias: [], falhas: [] };
  for (const u of pendentes) {
    const email = loginParaEmail(u.login, dominio);
    const temSenhaBoa = typeof u.pass_hash === 'string' && u.pass_hash.length >= SENHA_MIN;
    const senha = temSenhaBoa ? u.pass_hash : senhaTemporaria();

    if (dryRun) { log(`  [simulação] ${u.login} → ${email}${temSenhaBoa ? '' : ' (senha temporária)'}`); continue; }

    let authId = null;
    const { data: conta, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome: u.name } });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        authId = await acharContaPorEmail(db, email);
        if (!authId) { relatorio.falhas.push({ login: u.login, motivo: 'conta existe no Auth mas não foi localizada' }); continue; }
      } else { relatorio.falhas.push({ login: u.login, motivo: error.message }); continue; }
    } else authId = conta.user.id;

    const { error: eUp } = await db.from('users').update({ auth_id: authId }).eq('id', u.id);
    if (eUp) { relatorio.falhas.push({ login: u.login, motivo: `vincular auth_id: ${eUp.message}` }); continue; }
    relatorio.migrados.push(u.login);
    if (!temSenhaBoa && !error) relatorio.temporarias.push({ login: u.login, senha });
    log(`  ✔ ${u.login}`);
  }

  // 3. Apaga as senhas em texto puro dos migrados (se a coluna ainda existir)
  if (!dryRun && relatorio.migrados.length) {
    const { error } = await db.from('users').update({ pass_hash: null }).in('login', relatorio.migrados);
    if (error && !/pass_hash|column/i.test(error.message)) log(`⚠ não consegui limpar pass_hash: ${error.message}`);
  }
  return relatorio;
}

async function acharContaPorEmail(db, email) {
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { data, error } = await db.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const achou = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (achou) return achou.id;
  }
  return null;
}

async function principal() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_KEY (chave "service_role", NUNCA a anon).');
    process.exit(1);
  }
  const dominio = process.env.AUTH_EMAIL_DOMAIN || 'celulaagape.app';
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await migrar({ db, dominio, dryRun: process.argv.includes('--dry-run') });

  console.log(`\nMigrados: ${r.migrados.length}`);
  if (r.temporarias.length) {
    console.log('\n⚠ Senhas TEMPORÁRIAS (a senha antiga era curta demais). Anote e avise cada pessoa — não serão exibidas de novo:');
    for (const t of r.temporarias) console.log(`   ${t.login}  →  ${t.senha}`);
  }
  if (r.falhas.length) {
    console.log('\n✖ Falhas:');
    for (const f of r.falhas) console.log(`   ${f.login}: ${f.motivo}`);
    process.exit(2);
  }
  console.log('\nPróximo passo: faça o deploy do app novo e teste o login. Só então rode supabase/02_seguranca_rls.sql.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => { console.error(`\n✖ ${e.message}`); process.exit(1); });
}
