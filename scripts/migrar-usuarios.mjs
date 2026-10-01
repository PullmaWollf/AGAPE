import { clienteAdmin } from '../api/_lib/supabase.js';
import { loginParaEmail } from '../api/_lib/login.js';
import { randomBytes } from 'node:crypto';

export async function migrar({ db = clienteAdmin(), dominio = process.env.AUTH_EMAIL_DOMAIN || 'celulaagape.app', dryRun = false, log = console.log } = {}) {
  const { data: users, error } = await db.from('users').select('id,name,login,role,pass_hash,auth_id');
  if (error) throw new Error(error.message);
  const probeEmail = `__agape_probe_${Date.now()}_${randomBytes(4).toString('hex')}@${dominio}`;
  if (!dryRun) {
    const probe = await db.auth.admin.createUser({ email: probeEmail, password: randomBytes(9).toString('base64url'), email_confirm: true });
    if (probe.error) throw new Error(`Supabase recusou o domínio; confira AUTH_EMAIL_DOMAIN: ${probe.error.message}`);
    await db.auth.admin.deleteUser(probe.data.user.id);
  }
  const migrados = [], temporarias = [], falhas = [];
  for (const user of users || []) {
    if (user.auth_id) continue;
    const senha = String(user.pass_hash || '').length >= 6 ? user.pass_hash : randomBytes(9).toString('base64url');
    if (String(user.pass_hash || '').length < 6) temporarias.push({ login: user.login, senha });
    if (dryRun) { migrados.push(user.login); continue; }
    try {
      const email = loginParaEmail(user.login, dominio);
      const created = await db.auth.admin.createUser({ email, password: senha, email_confirm: true });
      let authId = created.data?.user?.id;
      if (created.error) {
        const listed = await db.auth.admin.listUsers();
        authId = listed.data?.users?.find((u) => u.email === email)?.id;
        if (!authId) throw new Error(created.error.message);
      }
      const updated = await db.from('users').update({ auth_id: authId, pass_hash: null }).eq('id', user.id);
      if (updated.error) throw new Error(updated.error.message);
      migrados.push(user.login);
    } catch (e) { falhas.push({ login: user.login, erro: e.message }); }
  }
  log(`Migração concluída: ${migrados.length} usuário(s).`);
  return { migrados, temporarias, falhas };
}

if (import.meta.url === `file://${process.argv[1]}`) migrar().catch((error) => { console.error(error.message); process.exitCode = 1; });
export default migrar;
