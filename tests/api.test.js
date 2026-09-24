import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { criarEnviador } from '../api/_lib/push.js';
import { despachar } from '../api/_lib/dispatcher.js';
import { segredoValido } from '../api/_lib/http.js';
import { criarHandler as handlerCron } from '../api/cron-alarms.js';
import { criarHandler as handlerAdmin } from '../api/admin-users.js';
import { criarHandler as handlerTeste } from '../api/test-push.js';
import { normalizarLogin, loginParaEmail } from '../api/_lib/login.js';
import { criarFake, reqRes } from './helpers/fake-supabase.js';
import { novoBanco, sql, comoServico } from './helpers/db.js';

const b64u = (b) => Buffer.from(b).toString('base64url');

// ─────────────────────────────────────────────────────────────────────
describe('Web Push: o corpo agora é criptografado (RFC 8291) e assinado (VAPID)', () => {
  test('gera requisição aes128gcm que SÓ o aparelho consegue decifrar', () => {
    const vapid = webpush.generateVAPIDKeys();
    const aparelho = crypto.createECDH('prime256v1'); aparelho.generateKeys();
    const authSecret = crypto.randomBytes(16);
    const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: b64u(aparelho.getPublicKey()), auth: b64u(authSecret) } };
    const payload = { title: '🧁 Lembrete da escala', body: 'Bruno, hoje às 19:30: você está na escala de Lanche.', url: '/?page=escala' };

    const det = webpush.generateRequestDetails(sub, JSON.stringify(payload), {
      vapidDetails: { subject: 'mailto:a@b.co', publicKey: vapid.publicKey, privateKey: vapid.privateKey }, TTL: 600, urgency: 'high' });

    assert.equal(det.headers['Content-Encoding'], 'aes128gcm');
    assert.match(det.headers.Authorization, /^vapid t=.+, k=.+$/);
    assert.equal(det.headers.TTL, 600);
    assert.equal(det.headers.Urgency, 'high');
    assert.ok(!det.body.toString('utf8').includes('Lembrete'), 'o texto não pode aparecer em claro no corpo');

    // decifra como o navegador faria
    const corpo = det.body;
    const salt = corpo.subarray(0, 16);
    const idlen = corpo[20];
    const asPub = corpo.subarray(21, 21 + idlen);
    const cifrado = corpo.subarray(21 + idlen);
    const segredo = aparelho.computeSecret(asPub);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', segredo, authSecret,
      Buffer.concat([Buffer.from('WebPush: info\0'), aparelho.getPublicKey(), asPub]), 32));
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(cifrado.subarray(cifrado.length - 16));
    const claro = Buffer.concat([d.update(cifrado.subarray(0, cifrado.length - 16)), d.final()]);
    const semPad = claro.subarray(0, claro.lastIndexOf(0x02));
    assert.deepEqual(JSON.parse(semPad.toString('utf8')), payload);
  });

  test('criarEnviador classifica as respostas do serviço de push', async () => {
    const vapid = webpush.generateVAPIDKeys();
    const sub = { endpoint: 'https://push.example/x', keys: { p256dh: 'a', auth: 'b' } };
    const fabrica = (fn) => criarEnviador({ publica: vapid.publicKey, privada: vapid.privateKey, enviarFn: fn });

    assert.deepEqual(await fabrica(async () => ({ statusCode: 201 }))(sub, { a: 1 }), { ok: true });
    assert.deepEqual(await fabrica(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); })(sub, {}), { ok: false, gone: true, motivo: 'HTTP 410 (aparelho removido)' });
    assert.equal((await fabrica(async () => { throw Object.assign(new Error('x'), { statusCode: 404 }); })(sub, {})).gone, true);
    const vap = await fabrica(async () => { throw Object.assign(new Error('x'), { statusCode: 403 }); })(sub, {});
    assert.equal(vap.gone, false);            // não apaga aparelho por causa de configuração errada
    assert.match(vap.motivo, /VAPID/);
    const t = await fabrica(async () => { throw Object.assign(new Error('x'), { statusCode: 503 }); })(sub, {});
    assert.deepEqual([t.ok, t.gone, t.motivo], [false, false, 'HTTP 503']);
    const rede = await fabrica(async () => { throw Object.assign(new Error('boom'), { code: 'ECONNRESET' }); })(sub, {});
    assert.deepEqual([rede.gone, rede.motivo], [false, 'ECONNRESET']);
    assert.equal((await fabrica(async () => ({}))('não é json', {})).gone, true);
    assert.equal((await fabrica(async () => ({}))({ endpoint: 'https://x' }, {})).gone, true);
  });

  test('exige as chaves VAPID configuradas', () => {
    assert.throws(() => criarEnviador({ publica: '', privada: '' }), /VAPID_PUBLIC_KEY/);
  });

  test('TTL nunca vai abaixo de 60 s e é repassado ao serviço de push', async () => {
    const vapid = webpush.generateVAPIDKeys();
    let opcoes;
    const enviar = criarEnviador({ publica: vapid.publicKey, privada: vapid.privateKey, enviarFn: async (_s, _p, o) => { opcoes = o; } });
    await enviar({ endpoint: 'https://x', keys: { p256dh: 'a', auth: 'b' } }, {}, { ttl: 5 });
    assert.equal(opcoes.TTL, 60);
    assert.equal(opcoes.urgency, 'high');
    assert.equal(opcoes.vapidDetails.publicKey, vapid.publicKey);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('despachante ponta a ponta (API + SQL real no PGlite)', () => {
  const ADM = '00000000-0000-4000-8000-0000000000a1';
  const MB1 = '00000000-0000-4000-8000-0000000000b1';
  const MB2 = '00000000-0000-4000-8000-0000000000b2';

  // Adaptador: faz o PGlite responder como o cliente supabase-js (só o que o despachante usa)
  const adaptador = (db) => ({
    rpc: (nome, args) => comoServico(db, async () => {
      try {
        if (nome === 'claim_notificacoes') return { data: (await db.query('select public.claim_notificacoes($1) r', [args.p_limite])).rows[0].r, error: null };
        if (nome === 'finalizar_notificacao') { await db.query('select public.finalizar_notificacao($1,$2,$3)', [args.p_id, args.p_ok, args.p_erro]); return { data: null, error: null }; }
      } catch (e) { return { data: null, error: { message: e.message } }; }
    }),
    from: (t) => ({ delete: () => ({ in: async (col, ids) => { await comoServico(db, () => db.query(`delete from ${t} where ${col} = any($1::uuid[])`, [ids])); return { error: null }; } }) }),
  });

  async function cenario() {
    const db = await novoBanco();
    await db.exec(sql('01_schema.sql'));
    await db.exec(`insert into users (name, login, role, auth_id) values
      ('Ana Admin','ana','adm','${ADM}'),('Bruno Membro','bruno','membro','${MB1}'),('Carla Membra','carla','membro','${MB2}')`);
    const u = Object.fromEntries((await db.query('select id, login from users')).rows.map((r) => [r.login, r.id]));
    const hoje = (await db.query(`select to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') d`)).rows[0].d;
    const alarme = (await db.query(`select to_char((now() - interval '1 minute') at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI') s`)).rows[0].s;
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${ADM}',false)`);
    await db.query('select public.salvar_semana($1::jsonb)', [JSON.stringify({ date: hoje, alarm_local: alarme, atribuicoes: [{ user_id: u.bruno }, { user_id: u.carla }] })]);
    await db.exec(`reset role`);
    return { db, u };
  }
  const sub = (id) => JSON.stringify({ endpoint: `https://push.example/${id}`, keys: { p256dh: 'p', auth: 'a' } });

  test('entrega para todos os aparelhos, apaga o que morreu e registra o resultado', async () => {
    const { db, u } = await cenario();
    await db.exec(`insert into push_subscriptions (user_id, endpoint, subscription_json) values
      ('${u.bruno}','https://push.example/b-ok','${sub('b-ok')}'),
      ('${u.bruno}','https://push.example/b-morto','${sub('b-morto')}'),
      ('${u.carla}','https://push.example/c-503','${sub('c-503')}')`);
    const chamadas = [];
    const enviar = async (s, payload, opts) => {
      const ep = JSON.parse(s).endpoint;
      chamadas.push({ ep, payload, opts });
      if (ep.endsWith('b-ok')) return { ok: true };
      if (ep.endsWith('b-morto')) return { ok: false, gone: true, motivo: 'HTTP 410' };
      return { ok: false, gone: false, motivo: 'HTTP 503' };
    };

    const r = await despachar({ db: adaptador(db), enviar });
    assert.deepEqual(r, { reivindicadas: 2, enviadas: 1, adiadas: 1, semDispositivo: 0, aparelhosRemovidos: 1 });

    const n = (await db.query(`select u.login, n.status, n.dispositivos_ok, n.ultimo_erro, n.tentativas from notificacoes n join users u on u.id=n.user_id order by u.login`)).rows;
    assert.deepEqual(n[0], { login: 'bruno', status: 'enviada', dispositivos_ok: 1, ultimo_erro: null, tentativas: 1 });
    assert.deepEqual(n[1], { login: 'carla', status: 'pendente', dispositivos_ok: 0, ultimo_erro: 'HTTP 503', tentativas: 1 });
    // aparelho morto foi apagado do banco
    const restantes = (await db.query('select endpoint from push_subscriptions order by endpoint')).rows.map((x) => x.endpoint);
    assert.deepEqual(restantes, ['https://push.example/b-ok', 'https://push.example/c-503']);

    // payload entregue ao aparelho
    const p = chamadas.find((c) => c.ep.endsWith('b-ok')).payload;
    assert.equal(p.title, '🧁 Lembrete da escala');
    assert.match(p.body, /^Bruno, hoje às 19:30: você está na escala de Lanche/);
    assert.equal(p.url, '/?page=escala');
    assert.match(p.tag, /^agape-/);
    assert.ok(chamadas[0].opts.ttl >= 60 && chamadas[0].opts.ttl <= 86400);

    // logo em seguida: nada novo a enviar (Bruno enviada; Carla em espera de backoff)
    assert.equal((await despachar({ db: adaptador(db), enviar })).reivindicadas, 0);

    // passado o backoff, a tentativa acontece de novo — e agora o aparelho responde
    await db.exec(`update notificacoes set proxima_tentativa = now()`);
    const r2 = await despachar({ db: adaptador(db), enviar: async () => ({ ok: true }) });
    assert.equal(r2.enviadas, 1);
    assert.equal((await db.query(`select count(*)::int n from notificacoes where status='enviada'`)).rows[0].n, 2);
  });

  test('sem nenhum aparelho: fica em espera e é entregue quando a pessoa ativar as notificações', async () => {
    const { db, u } = await cenario();
    const enviar = async () => ({ ok: true });
    const r = await despachar({ db: adaptador(db), enviar });
    assert.equal(r.semDispositivo, 2);
    assert.equal(r.enviadas, 0);
    await db.exec(`update notificacoes set proxima_tentativa = now()`);
    await db.exec(`insert into push_subscriptions (user_id, endpoint, subscription_json) values ('${u.bruno}','https://push.example/tardio','${sub('tardio')}')`);
    const r2 = await despachar({ db: adaptador(db), enviar });
    assert.equal(r2.enviadas, 1);
    assert.equal(r2.semDispositivo, 1);
  });

  test('vários aparelhos da mesma pessoa: basta um aceitar para contar como enviada', async () => {
    const { db, u } = await cenario();
    await db.exec(`insert into push_subscriptions (user_id, endpoint, subscription_json) values
      ('${u.bruno}','https://push.example/1','${sub('1')}'),('${u.bruno}','https://push.example/2','${sub('2')}'),('${u.bruno}','https://push.example/3','${sub('3')}')`);
    let i = 0;
    await despachar({ db: adaptador(db), enviar: async () => (++i === 2 ? { ok: false, gone: false, motivo: 'HTTP 500' } : { ok: true }) });
    const [n] = (await db.query(`select status, dispositivos_ok from notificacoes n join users u on u.id=n.user_id where u.login='bruno'`)).rows;
    assert.deepEqual(n, { status: 'enviada', dispositivos_ok: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('endpoints HTTP', () => {
  const env = { CRON_SECRET: 's3gredo-longo', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };

  test('cron-alarms: recusa sem segredo, com segredo errado e método inválido', async () => {
    const h = handlerCron({ env, criarCliente: () => { throw new Error('não deveria criar cliente'); } });
    for (const cab of [{}, { authorization: 'Bearer errado' }, { authorization: 's3gredo-longo' }]) {
      const { req, res } = reqRes({ cabecalhos: cab });
      await h(req, res);
      assert.equal(res.codigo, 401);
    }
    const { req, res } = reqRes({ metodo: 'DELETE', cabecalhos: { authorization: 'Bearer s3gredo-longo' } });
    await h(req, res);
    assert.equal(res.codigo, 405);
  });

  test('cron-alarms: com segredo correto despacha e devolve o resumo; erro interno não vaza detalhes', async () => {
    let usou;
    const h = handlerCron({ env, criarCliente: () => 'db', fabricaEnviador: () => 'enviar',
      despacho: async ({ db, enviar }) => { usou = [db, enviar]; return { reivindicadas: 3, enviadas: 2, adiadas: 1, semDispositivo: 0, aparelhosRemovidos: 0 }; } });
    const { req, res } = reqRes({ cabecalhos: { authorization: 'Bearer s3gredo-longo' } });
    await h(req, res);
    assert.equal(res.codigo, 200);
    assert.equal(res.corpo.enviadas, 2);
    assert.equal(res.corpo.processed, 3);
    assert.deepEqual(usou, ['db', 'enviar']);

    const h2 = handlerCron({ env, criarCliente: () => 'db', fabricaEnviador: () => 'e', despacho: async () => { throw new Error('senha do banco = 123'); } });
    const r = reqRes({ cabecalhos: { authorization: 'Bearer s3gredo-longo' } });
    const silencio = console.error; console.error = () => {};
    await h2(r.req, r.res);
    console.error = silencio;
    assert.equal(r.res.codigo, 500);
    assert.doesNotMatch(JSON.stringify(r.res.corpo), /senha/);
  });

  test('segredoValido compara em tempo constante e rejeita segredo vazio', () => {
    assert.equal(segredoValido({ headers: { authorization: 'Bearer abc' } }, 'abc'), true);
    assert.equal(segredoValido({ headers: { authorization: 'Bearer abd' } }, 'abc'), false);
    assert.equal(segredoValido({ headers: { authorization: 'Bearer ' } }, ''), false);
    assert.equal(segredoValido({ headers: {} }, undefined), false);
  });

  // ── admin-users ──
  const montaAdmin = (extra = {}) => {
    const fake = criarFake({
      users: [
        { id: 'u-adm', name: 'Ana', login: 'ana', role: 'adm', auth_id: 'a-adm' },
        { id: 'u-mb', name: 'Bruno', login: 'bruno', role: 'membro', auth_id: 'a-mb' },
      ],
      tokens: { 'tk-adm': 'a-adm', 'tk-mb': 'a-mb', 'tk-fantasma': 'a-fantasma' }, ...extra,
    });
    const h = handlerAdmin({ env: {}, criarCliente: () => fake });
    const chama = async (token, corpo) => {
      const { req, res } = reqRes({ corpo, cabecalhos: token ? { authorization: `Bearer ${token}` } : {} });
      const silencio = console.error; console.error = () => {};
      await h(req, res); console.error = silencio;
      return res;
    };
    return { fake, chama };
  };

  test('admin-users: só ADM autenticado passa', async () => {
    const { chama } = montaAdmin();
    assert.equal((await chama(null, { acao: 'criar' })).codigo, 401);
    assert.equal((await chama('token-falso', { acao: 'criar' })).codigo, 401);
    assert.equal((await chama('tk-fantasma', { acao: 'criar' })).codigo, 403);   // logado no Auth, sem cadastro (signup aberto)
    const r = await chama('tk-mb', { acao: 'criar', nome: 'X', login: 'xis', senha: '123456' });
    assert.equal(r.codigo, 403);
  });

  test('admin-users: cria usuário (conta no Auth + linha em users) e valida entradas', async () => {
    const { fake, chama } = montaAdmin();
    const ok = await chama('tk-adm', { acao: 'criar', nome: 'José da Silva', login: 'José.Silva', senha: 'segredo1', perfil: 'membro' });
    assert.equal(ok.codigo, 200);
    assert.equal(ok.corpo.usuario.login, 'jose.silva');
    assert.deepEqual(fake.log.authCriadas, ['jose.silva@celulaagape.app']);
    const u = fake.tabelas.users.find((x) => x.login === 'jose.silva');
    assert.ok(u.auth_id.startsWith('auth-'));

    assert.equal((await chama('tk-adm', { acao: 'criar', nome: 'A', login: 'abc', senha: '123456' })).codigo, 400);              // nome curto
    assert.equal((await chama('tk-adm', { acao: 'criar', nome: 'Fulano', login: 'a', senha: '123456' })).codigo, 400);            // login curto demais
    assert.equal((await chama('tk-adm', { acao: 'criar', nome: 'Fulano', login: 'fulano', senha: '123' })).codigo, 400);          // senha curta
    assert.equal((await chama('tk-adm', { acao: 'criar', nome: 'Fulano', login: 'fulano', senha: '123456', perfil: 'root' })).codigo, 400);
    assert.equal((await chama('tk-adm', { acao: 'criar', nome: 'Outro Bruno', login: 'BRUNO', senha: '123456' })).codigo, 409);   // duplicado (sem diferenciar maiúsculas)
  });

  test('admin-users: se falhar ao gravar o perfil, a conta do Auth criada é desfeita', async () => {
    const { fake, chama } = montaAdmin();
    fake.falhaInsertEmUsers = 'violação de unicidade';
    const r = await chama('tk-adm', { acao: 'criar', nome: 'Maria', login: 'maria', senha: '123456' });
    assert.equal(r.codigo, 500);
    assert.equal(fake.log.authApagadas.length, 1);
  });

  test('admin-users: proteções (não excluir a si mesmo, nem o último ADM; redefinir senha; alterar perfil)', async () => {
    const { fake, chama } = montaAdmin();
    assert.equal((await chama('tk-adm', { acao: 'excluir', id: 'u-adm' })).codigo, 400);                    // a si mesmo
    assert.equal((await chama('tk-adm', { acao: 'alterar_perfil', id: 'u-adm', perfil: 'membro' })).codigo, 400);   // último ADM
    assert.equal((await chama('tk-adm', { acao: 'alterar_perfil', id: 'u-mb', perfil: 'adm' })).codigo, 200);       // agora há 2 ADMs
    assert.equal((await chama('tk-adm', { acao: 'alterar_perfil', id: 'u-mb', perfil: 'membro' })).codigo, 200);    // volta a 1
    assert.equal((await chama('tk-adm', { acao: 'alterar_perfil', id: 'u-adm', perfil: 'membro' })).codigo, 400);   // último ADM de novo
    assert.equal((await chama('tk-adm', { acao: 'redefinir_senha', id: 'u-mb', senha: '123' })).codigo, 400);
    assert.equal((await chama('tk-adm', { acao: 'redefinir_senha', id: 'u-mb', senha: 'nova-senha' })).codigo, 200);
    assert.deepEqual(fake.log.authSenhas, [{ id: 'a-mb', password: 'nova-senha' }]);
    assert.equal((await chama('tk-adm', { acao: 'redefinir_senha', id: 'nao-existe', senha: 'nova-senha' })).codigo, 404);
    assert.equal((await chama('tk-adm', { acao: 'excluir', id: 'u-mb' })).codigo, 200);
    assert.deepEqual(fake.log.authApagadas, ['a-mb']);
    assert.equal(fake.tabelas.users.some((x) => x.id === 'u-mb'), false);
    assert.equal((await chama('tk-adm', { acao: 'inventada' })).codigo, 400);
  });

  test('admin-users: redefinir senha de usuário ainda sem conta no Auth cria a conta', async () => {
    const fake = criarFake({ users: [
      { id: 'u-adm', name: 'Ana', login: 'ana', role: 'adm', auth_id: 'a-adm' },
      { id: 'u-velho', name: 'Velho', login: 'velho', role: 'membro', auth_id: null }], tokens: { t: 'a-adm' } });
    const h = handlerAdmin({ env: {}, criarCliente: () => fake });
    const { req, res } = reqRes({ corpo: { acao: 'redefinir_senha', id: 'u-velho', senha: 'abcdef' }, cabecalhos: { authorization: 'Bearer t' } });
    await h(req, res);
    assert.equal(res.codigo, 200);
    assert.ok(fake.tabelas.users.find((x) => x.id === 'u-velho').auth_id.startsWith('auth-'));
  });

  // ── test-push ──
  test('test-push: usuário testa o próprio aparelho; não testa o de outra pessoa; ADM pode', async () => {
    const fake = criarFake({
      users: [{ id: 'u-adm', name: 'Ana', login: 'ana', role: 'adm', auth_id: 'a-adm' }, { id: 'u-mb', name: 'Bruno', login: 'bruno', role: 'membro', auth_id: 'a-mb' }],
      push_subscriptions: [{ id: 's1', user_id: 'u-mb', subscription_json: '{"a":1}' }, { id: 's2', user_id: 'u-mb', subscription_json: '{"a":2}' }],
      tokens: { m: 'a-mb', a: 'a-adm' } });
    const enviados = [];
    const fabrica = () => async (s) => { enviados.push(s); return s === '{"a":2}' ? { ok: false, gone: true, motivo: 'HTTP 410' } : { ok: true }; };
    const h = handlerTeste({ env: {}, criarCliente: () => fake, fabricaEnviador: fabrica });
    const chama = async (token, corpo) => { const { req, res } = reqRes({ corpo, cabecalhos: { authorization: `Bearer ${token}` } }); await h(req, res); return res; };

    const r = await chama('m', {});
    assert.equal(r.codigo, 200);
    assert.deepEqual([r.corpo.total, r.corpo.entregues, r.corpo.removidos], [2, 1, 1]);
    assert.equal(fake.tabelas.push_subscriptions.length, 1);     // aparelho 410 foi removido

    assert.equal((await chama('m', { userId: 'u-adm' })).codigo, 403);
    const semAparelho = await chama('a', {});
    assert.equal(semAparelho.corpo.total, 0);
    const admTestaMb = await chama('a', { userId: 'u-mb' });
    assert.equal(admTestaMb.corpo.entregues, 1);
  });
});

describe('login → e-mail interno', () => {
  test('normaliza acentos, maiúsculas e caracteres estranhos de forma estável', () => {
    assert.equal(normalizarLogin('  José.Silva '), 'jose.silva');
    assert.equal(normalizarLogin('Maria da Luz'), 'maria-da-luz');
    assert.equal(normalizarLogin('ÁÉÍ_ÓÚ'), 'aei_ou');
    assert.equal(loginParaEmail('Ana', 'exemplo.com'), 'ana@exemplo.com');
    assert.equal(loginParaEmail('ana'), 'ana@celulaagape.app');
  });
});
