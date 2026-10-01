import { envolver, responder, HttpError, cookieSessao } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { criarSessao, carregarPermissoes } from '../api/_lib/auth.js';
import { normalizarLogin } from '../api/_lib/login.js';
import { verifyPassword } from '../api/_lib/password.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const login = normalizarLogin(req.body?.login);
  const senha = String(req.body?.senha ?? '');
  if (!login || !senha) throw new HttpError(400, 'login ou senha inválidos');

  const db = clienteAdmin();
  const { data: perfil, error } = await db.from('users')
    .select('id,name,login,role,perfil_id,auth_id,pass_hash,created_at')
    .eq('login', login).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil || !(await verifyPassword(senha, perfil.pass_hash))) {
    throw new HttpError(401, 'login ou senha inválidos');
  }

  const permissoes = await carregarPermissoes(db, perfil);
  const token = criarSessao(perfil);
  res.setHeader('Set-Cookie', cookieSessao(token));
  return responder(res, 200, {
    ok: true,
    token,
    usuario: { id: perfil.id, name: perfil.name, login: perfil.login, role: perfil.role, perfil_id: perfil.perfil_id, permissoes, auth_id: perfil.auth_id, created_at: perfil.created_at },
  });
});

