import { clienteAdmin } from './_lib/supabase.js';
import { usuarioAutenticado } from './_lib/auth.js';
import { responder } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return responder(res, 405, { erro: 'método não permitido' });
    const db = clienteAdmin();
    const { perfil } = await usuarioAutenticado(db, req);
    const { acao, endpoint, subscription, userAgent } = req.body || {};
    if (!endpoint) return responder(res, 400, { erro: 'endpoint inválido' });
    if (acao === 'remover') {
      const { error } = await db.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', perfil.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from('push_subscriptions').upsert({ user_id: perfil.id, endpoint, subscription_json: subscription, user_agent: String(userAgent || '').slice(0, 200) }, { onConflict: 'endpoint' });
      if (error) throw new Error(error.message);
    }
    return responder(res, 200, { ok: true });
  } catch (error) { return responder(res, error.status || 500, { ok: false, erro: error.message || 'não foi possível salvar o dispositivo' }); }
}
