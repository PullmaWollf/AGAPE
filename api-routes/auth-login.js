import { envolver, responder, HttpError, cookieSessao } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { criarSessao, carregarPermissoes, SESSION_TTL_SECONDS } from '../api/_lib/auth.js';
import { normalizarLogin } from '../api/_lib/login.js';
import { verifyPassword } from '../api/_lib/password.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const login = normalizarLogin(req.body?.login);
  const senha = String(req.body?.senha ?? '');
  if (!login || senha.length < 1 || senha.length > 128) throw new HttpError(400, 'login ou senha inválidos');
  const db = clienteAdmin();
  const { data: perfil, error } = await db.from('users')
    .select('id,name,login,role,perfil_id,avatar_url,session_version,pass_hash,created_at')
    .eq('login', login).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil || !(await verifyPassword(senha, perfil.pass_hash))) {
    throw new HttpError(401, 'login ou senha inválidos');
  }
  const permissoes = await carregarPermissoes(db, perfil);
  res.setHeader('Set-Cookie', cookieSessao(criarSessao(perfil), SESSION_TTL_SECONDS));
  const { pass_hash, session_version, ...usuario } = perfil;
  return responder(res, 200, { ok: true, usuario: { ...usuario, permissoes } });
});
