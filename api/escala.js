import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { exigirPermissao } from './_lib/auth.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const db = clienteAdmin(process.env);
  const { acao, id } = req.body || {};
  await exigirPermissao(db, req, acao === 'excluir' ? 'escala' : 'escala');
  if (acao === 'excluir') {
    if (!id) throw new HttpError(400, 'escala inválida');
    const a = await db.from('escala_atribuicoes').delete().eq('escala_id', id);
    if (a.error) throw new Error(a.error.message);
    const s = await db.from('escala_semanas').delete().eq('id', id);
    if (s.error) throw new Error(s.error.message);
    return responder(res, 200, { ok: true });
  }
  throw new HttpError(400, 'ação desconhecida');
});
export const config = { api: { bodyParser: true } };

// Vercel serverless handler wrapper preserves the project error format.
function _unused() {}

export { _unused };
