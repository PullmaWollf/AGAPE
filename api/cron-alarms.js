// Despachante de notificações. Chamado a cada minuto pelo pg_cron do Supabase
// (03_agendador_pg_cron.sql) e, como reserva, pelo GitHub Actions.
// Também aceita o cron nativo da Vercel (que envia Authorization: Bearer CRON_SECRET).
import { envolver, responder, segredoValido, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { criarEnviador } from './_lib/push.js';
import { despachar } from './_lib/dispatcher.js';

export function criarHandler({ env = process.env, criarCliente = clienteAdmin, fabricaEnviador = criarEnviador, despacho = despachar } = {}) {
  return envolver(async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'GET') throw new HttpError(405, 'método não permitido');
    if (!segredoValido(req, env.CRON_SECRET)) throw new HttpError(401, 'não autorizado');

    const db = criarCliente(env);
    const enviar = fabricaEnviador({
      publica: env.VAPID_PUBLIC_KEY,
      privada: env.VAPID_PRIVATE_KEY,
      assunto: env.VAPID_SUBJECT || 'mailto:admin@celulaagape.app',
    });
    const resumo = await despacho({ db, enviar });
    return responder(res, 200, { ok: true, ...resumo, processed: resumo.reivindicadas });
  });
}

export default criarHandler();
