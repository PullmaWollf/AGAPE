import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { criarSessao } from './_lib/auth.js';
import { normalizarLogin } from './_lib/login.js';
import { verifyPassword } from './_lib/password.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const login = normalizarLogin(req.body?.login);
  const senha = String(req.body?.senha ?? '');
  if (!login || !senha) throw new HttpError(400, 'login ou senha inválidos');

  const db = clienteAdmin();
  const { data: perfil, error } = await db.from('users')
    .select('id,name,login,role,auth_id,pass_hash,created_at')
    .eq('login', login).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil || !(await verifyPassword(senha, perfil.pass_hash))) {
    throw new HttpError(401, 'login ou senha inválidos');
  }

  return responder(res, 200, {
    ok: true,
    token: criarSessao(perfil),
    usuario: { id: perfil.id, name: perfil.name, login: perfil.login, role: perfil.role, auth_id: perfil.auth_id, created_at: perfil.created_at },
  });
});

