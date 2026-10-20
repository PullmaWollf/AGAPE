import { clienteAdmin } from '../api/_lib/supabase.js';
import { usuarioAutenticado, carregarPermissoes } from '../api/_lib/auth.js';
import { envolver, responder, HttpError } from '../api/_lib/http.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const db = clienteAdmin();
  const { perfil } = await usuarioAutenticado(db, req);
  const permissoes = await carregarPermissoes(db, perfil);
  const { session_version, ...usuario } = perfil;
  return responder(res, 200, { ok: true, usuario: { ...usuario, permissoes } });
});
