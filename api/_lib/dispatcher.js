// Despachante: pega no banco o que está na hora de enviar e entrega aos aparelhos.
// Toda a lógica de "o que enviar, para quem e quando" fica no Postgres
// (claim_notificacoes); aqui só entregamos e registramos o resultado.

async function emLotes(itens, concorrencia, fn) {
  const fila = [...itens];
  const trabalhadores = Array.from({ length: Math.min(concorrencia, fila.length) }, async () => {
    while (fila.length) await fn(fila.shift());
  });
  await Promise.all(trabalhadores);
}

export async function despachar({ db, enviar, limite = 100, concorrencia = 8, agora = () => Date.now() }) {
  const { data, error } = await db.rpc('claim_notificacoes', { p_limite: limite });
  if (error) throw new Error(`claim_notificacoes: ${error.message}`);
  const lote = Array.isArray(data) ? data : [];

  const resumo = { reivindicadas: lote.length, enviadas: 0, adiadas: 0, semDispositivo: 0, aparelhosRemovidos: 0 };

  await emLotes(lote, concorrencia, async (n) => {
    const subs = Array.isArray(n.subs) ? n.subs : [];
    if (subs.length === 0) {
      resumo.semDispositivo++;
      resumo.adiadas++;
      await finalizar(db, n.id, 0, 'sem dispositivo cadastrado');
      return;
    }

    const restanteSeg = Math.max(60, Math.floor((new Date(n.expira_em).getTime() - agora()) / 1000));
    const payload = {
      title: n.titulo, body: n.corpo, url: n.url || '/',
      tag: `agape-${n.id}`, notificacaoId: n.id, kind: n.kind,
    };

    let ok = 0;
    const erros = [];
    const mortos = [];
    for (const s of subs) {
      const r = await enviar(s.subscription_json, payload, { ttl: Math.min(restanteSeg, 86400), urgencia: 'high' });
      if (r.ok) ok++;
      else if (r.gone) mortos.push(s.id);
      else erros.push(r.motivo);
    }

    if (mortos.length) {
      const { error: e } = await db.from('push_subscriptions').delete().in('id', mortos);
      if (!e) resumo.aparelhosRemovidos += mortos.length;
    }

    if (ok > 0) resumo.enviadas++;
    else resumo.adiadas++;
    const motivo = ok > 0 ? null
      : (erros.join('; ') || (mortos.length ? 'aparelhos expirados foram removidos' : 'falha desconhecida'));
    await finalizar(db, n.id, ok, motivo);
  });

  return resumo;
}

async function finalizar(db, id, ok, erro) {
  const { error } = await db.rpc('finalizar_notificacao', { p_id: id, p_ok: ok, p_erro: erro });
  // Se isto falhar, a notificação volta sozinha para "pendente" após 3 min (destrava no claim).
  if (error) console.error(`[despachante] finalizar_notificacao ${id}:`, error.message);
}
