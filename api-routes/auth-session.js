import { clienteAdmin } from '../api/_lib/supabase.js';
import { usuarioAutenticado, carregarPermissoes, criarSessao, SESSION_TTL_SECONDS } from '../api/_lib/auth.js';
import { envolver, responder, HttpError, cookieSessao } from '../api/_lib/http.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const db = clienteAdmin();
  const { perfil } = await usuarioAutenticado(db, req);
  const permissoes = await carregarPermissoes(db, perfil);
  // Renova automaticamente a sessão protegida quando o PWA é reaberto.
  // Nada é gravado em localStorage; o cookie permanece entre fechamentos.
  res.setHeader('Set-Cookie', cookieSessao(criarSessao(perfil), SESSION_TTL_SECONDS));
  const { session_version, ...usuario } = perfil;
  return responder(res, 200, { ok: true, usuario: { ...usuario, permissoes } });
});
