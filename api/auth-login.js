import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { criarSessao } from './_lib/auth.js';
import { normalizarLogin } from './_lib/login.js';
import { scryptSync, timingSafeEqual } from 'node:crypto';

function senhaConfere(senha, armazenada) {
  if (typeof armazenada !== 'string') return false;
  if (armazenada.startsWith('scrypt$')) {
    const [, salt, esperado] = armazenada.split('$');
    try {
      const derivada = scryptSync(senha, salt, 64).toString('hex');
      return timingSafeEqual(Buffer.from(derivada, 'hex'), Buffer.from(esperado, 'hex'));
    } catch { return false; }
  }
  return armazenada === senha;
}

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const login = normalizarLogin(req.body?.login);
  const senha = String(req.body?.senha ?? '');
  if (!login || !senha) throw new HttpError(400, 'login ou senha inválidos');

  const db = clienteAdmin();
  const { data: perfil, error } = await db.from('users')
    .select('id,name,login,role,created_at,pass_hash')
    .eq('login', login).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil || !senhaConfere(senha, perfil.pass_hash)) throw new HttpError(401, 'login ou senha inválidos');

  return responder(res, 200, {
    ok: true,
    token: criarSessao(perfil),
    usuario: { id: perfil.id, name: perfil.name, login: perfil.login, role: perfil.role, created_at: perfil.created_at },
  });
});

export { senhaConfere };
