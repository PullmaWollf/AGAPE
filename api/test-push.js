// "Enviar notificação de teste". O usuário testa os próprios aparelhos;
// o ADM pode testar os de qualquer pessoa (passando userId).
import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { usuarioAutenticado } from './_lib/auth.js';
import { criarEnviador } from './_lib/push.js';

export function criarHandler({ env = process.env, criarCliente = clienteAdmin, fabricaEnviador = criarEnviador } = {}) {
  return envolver(async (req, res) => {
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
    const db = criarCliente(env);
    const { perfil } = await usuarioAutenticado(db, req);

    const alvoId = req.body?.userId || perfil.id;
    if (alvoId !== perfil.id && perfil.role !== 'adm') throw new HttpError(403, 'apenas administradores testam outras pessoas');

    const { data: subs, error } = await db.from('push_subscriptions').select('id, subscription_json').eq('user_id', alvoId);
    if (error) throw new Error(error.message);
    if (!subs.length) {
      return responder(res, 200, { ok: true, total: 0, entregues: 0, mensagem: 'Nenhum aparelho cadastrado para receber notificações.' });
    }

    const enviar = fabricaEnviador({
      publica: env.VAPID_PUBLIC_KEY,
      privada: env.VAPID_PRIVATE_KEY,
      assunto: env.VAPID_SUBJECT || 'mailto:admin@celulaagape.app',
    });
    const payload = {
      title: '✅ Notificações funcionando',
      body: 'Este é um teste da Célula Ágape. Se você está lendo isto, tudo certo!',
      url: '/', tag: `teste-${Date.now()}`,
    };

    let entregues = 0;
    const falhas = [];
    const mortos = [];
    for (const s of subs) {
      const r = await enviar(s.subscription_json, payload, { ttl: 300, urgencia: 'high' });
      if (r.ok) entregues++;
      else { falhas.push(r.motivo); if (r.gone) mortos.push(s.id); }
    }
    if (mortos.length) await db.from('push_subscriptions').delete().in('id', mortos);

    return responder(res, 200, { ok: entregues > 0, total: subs.length, entregues, falhas, removidos: mortos.length });
  });
}

export default criarHandler();
