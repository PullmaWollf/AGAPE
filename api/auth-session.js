import { clienteAdmin } from './_lib/supabase.js';
import { usuarioAutenticado, carregarPermissoes } from './_lib/auth.js';
import { responder, HttpError } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
    const db = clienteAdmin();
    const { perfil } = await usuarioAutenticado(db, req);
    const permissoes = await carregarPermissoes(db, perfil);
    return responder(res, 200, { ok: true, usuario: { ...perfil, permissoes } });
  } catch (error) {
    return responder(res, error.status || 500, { ok: false, erro: error.message || 'sessão inválida' });
  }
}

export const config = { api: { bodyParser: true } };
