// Envio de Web Push com criptografia (RFC 8291) e assinatura VAPID (RFC 8292),
// feito pela biblioteca "web-push". (A versão antiga mandava o corpo sem criptografar,
// o que os serviços de push não entregam.)
import webpush from 'web-push';

export function criarEnviador({ publica, privada, assunto = 'mailto:admin@celulaagape.app', enviarFn = webpush.sendNotification.bind(webpush) }) {
  if (!publica || !privada) throw new Error('Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis de ambiente da Vercel.');
  const vapidDetails = { subject: assunto, publicKey: publica, privateKey: privada };

  /**
   * @returns {{ok:true} | {ok:false, gone:boolean, motivo:string}}
   *  gone=true  → o aparelho não existe mais (404/410 ou assinatura inválida): pode apagar.
   *  gone=false → falha possivelmente temporária: tentar de novo depois.
   */
  return async function enviar(assinatura, payload, { ttl = 3600, urgencia = 'high' } = {}) {
    let sub = assinatura;
    if (typeof sub === 'string') {
      try { sub = JSON.parse(sub); } catch { return { ok: false, gone: true, motivo: 'assinatura ilegível' }; }
    }
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return { ok: false, gone: true, motivo: 'assinatura incompleta' };
    }
    try {
      await enviarFn(sub, JSON.stringify(payload), {
        vapidDetails, TTL: Math.max(60, Math.floor(ttl)), urgency: urgencia, timeout: 10000,
      });
      return { ok: true };
    } catch (e) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) return { ok: false, gone: true, motivo: `HTTP ${code} (aparelho removido)` };
      if (code === 401 || code === 403) return { ok: false, gone: false, motivo: `HTTP ${code}: chave VAPID não confere com a da inscrição` };
      if (code) return { ok: false, gone: false, motivo: `HTTP ${code}` };
      return { ok: false, gone: false, motivo: String(e?.code || e?.message || 'erro de rede').slice(0, 120) };
    }
  };
}
