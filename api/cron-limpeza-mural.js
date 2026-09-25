import { envolver, responder, segredoValido, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';

export default envolver(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  if (!segredoValido(req, process.env.CRON_SECRET)) throw new HttpError(401, 'não autorizado');
  const db = clienteAdmin();
  const { data, error } = await db.rpc('limpar_mural_mes_anterior');
  if (error) throw error;
  return responder(res, 200, { ok: true, removidos: data ?? null });
});
