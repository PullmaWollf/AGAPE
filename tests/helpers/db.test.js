// Testes do banco: roda os SQLs de verdade num Postgres (PGlite) com roles/RLS.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { novoBanco, sql, comoUsuario, comoAnon, comoServico } from './helpers/db.js';

const ADM = '00000000-0000-4000-8000-0000000000a1';   // auth uid do admin
const MB1 = '00000000-0000-4000-8000-0000000000b1';
const MB2 = '00000000-0000-4000-8000-0000000000b2';
const RUIM = '00000000-0000-4000-8000-0000000000ff';  // logado no Auth, mas sem linha em public.users

const q = async (db, texto, params = []) => (await db.query(texto, params)).rows;
const rejeita = async (p, trecho) => {
  await assert.rejects(p, (e) => { assert.match(String(e.message), trecho); return true; });
};

async function prepara({ legado = false, rls = true } = {}) {
  const db = await novoBanco({ legado });
  await db.exec(sql('01_schema.sql'));
  return db;
}
async function criaUsuarios(db) {
  await db.exec(`
    insert into users (name, login, role, auth_id) values
      ('Ana Admin', 'ana', 'adm', '${ADM}'),
      ('Bruno Membro', 'bruno', 'membro', '${MB1}'),
      ('Carla Membra', 'carla', 'membro', '${MB2}');`);
  const m = {};
  for (const u of await q(db, 'select id, login from users')) m[u.login] = u.id;
  return m;
}
const hojeSP = async (db, dias = 0) =>
  (await q(db, `select to_char((now() at time zone 'America/Sao_Paulo')::date + $1::int, 'YYYY-MM-DD') d`, [dias]))[0].d;

// ─────────────────────────────────────────────────────────────────────
describe('01_schema.sql — migração', () => {
  test('roda do zero e é idempotente', async () => {
    const db = await prepara();
    await db.exec(sql('01_schema.sql'));
    const t = await q(db, `select count(*)::int n from information_schema.tables where table_schema='public'`);
    assert.ok(t[0].n >= 12);
  });

  test('sobre o banco legado (sem PK/defaults) preserva dados e migra membros → atribuições', async () => {
    const db = await novoBanco({ legado: true });
    await db.exec(`
      insert into users (id, name, login, role, pass_hash) values
        ('11111111-1111-4111-8111-111111111111','Bruno Membro','bruno','membro','senha-antiga'),
        ('22222222-2222-4222-8222-222222222222','Carla Membra','carla','membro','x');
      insert into escala_semanas (id, date) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-10-02');
      insert into escala_membros (id, escala_id, user_id, user_name) values
        (gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Bruno Membro'),
        (gen_random_uuid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','Carla Membra');
      insert into posts (id, content, type, author_name) values (gen_random_uuid(),'olá','mensagem','Bruno Membro');
      insert into push_subscriptions (id, subscription_json) values (gen_random_uuid(), '{"endpoint":"https://push.example/abc","keys":{}}');
    `);
    await db.exec(sql('01_schema.sql'));
    const at = await q(db, 'select user_name, funcao_nome from escala_atribuicoes order by user_name');
    assert.deepEqual(at.map((r) => `${r.user_name}/${r.funcao_nome}`), ['Bruno Membro/Lanche', 'Carla Membra/Lanche']);
    assert.equal((await q(db, 'select count(*)::int n from posts'))[0].n, 1);
    // endpoint extraído do JSON antigo
    assert.equal((await q(db, 'select endpoint from push_subscriptions'))[0].endpoint, 'https://push.example/abc');
    // FK com cascade: apagar a semana leva as atribuições
    await db.exec(`delete from escala_semanas`);
    assert.equal((await q(db, 'select count(*)::int n from escala_atribuicoes'))[0].n, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('modelos de escala e geração do mês', () => {
  let db, u;
  before(async () => {
    db = await prepara();
    u = await criaUsuarios(db);
  });

  const rpc = (auth, nome, args) =>
    comoUsuario(db, auth, async () => (await db.query(`select public.${nome}(${args.map((_, i) => '$' + (i + 1)).join(',')}) r`, args)).rows[0].r);

  test('só ADM salva modelo; membro é barrado', async () => {
    await rejeita(rpc(MB1, 'salvar_modelo', [JSON.stringify({ nome: 'x', semanas: 4, itens: [] })]), /apenas administradores/);
  });

  test('modelo de 4 semanas → aplica em mês com 4 sextas, com alarme no fuso de São Paulo', async () => {
    const itens = [
      { semana: 1, user_id: u.bruno }, { semana: 2, user_id: u.carla },
      { semana: 3, user_id: u.bruno }, { semana: 4, user_id: u.carla },
    ];
    const mid = await rpc(ADM, 'salvar_modelo', [JSON.stringify({
      nome: 'Mês de 4 semanas', semanas: 4, hora_alarme: '17:00', alarm_semana: true, alarm_1d: true, alarm_3h: false, alarm_30m: false, itens })]);
    assert.ok(mid);

    const datas = ['2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22'];   // sextas (hipotético)
    const r = await rpc(ADM, 'aplicar_modelo', [mid, datas, 0, false]);
    assert.deepEqual(r, { criadas: 4, ignoradas: 0, substituidas: 0 });

    const sem = await q(db, `select date::text d, alarm_ts at time zone 'America/Sao_Paulo' local, alarm_1d, alarm_semana from escala_semanas order by date`);
    assert.equal(sem.length, 4);
    assert.match(String(sem[0].local.toISOString()), /^2027-01-01T17:00:00/);
    assert.equal(sem[0].alarm_1d, true);
    assert.equal(sem[0].alarm_semana, true);

    const at = await q(db, `select s.date::text d, a.user_name, a.funcao_nome from escala_atribuicoes a join escala_semanas s on s.id=a.escala_id order by s.date`);
    assert.deepEqual(at.map((x) => `${x.d} ${x.user_name} ${x.funcao_nome}`), [
      '2027-01-01 Bruno Membro Lanche', '2027-01-08 Carla Membra Lanche',
      '2027-01-15 Bruno Membro Lanche', '2027-01-22 Carla Membra Lanche']);
  });

  test('quantidade de datas diferente do modelo é recusada (3 ou 5 semanas exigem outro modelo)', async () => {
    const [m] = await q(db, 'select id from escala_modelos limit 1');
    await rejeita(rpc(ADM, 'aplicar_modelo', [m.id, ['2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26', '2027-02-27'], 0, false]),
      /tem 4 semanas, mas foram informadas 5 datas/);
  });

  test('rotação desloca o rodízio; datas já existentes são ignoradas ou substituídas', async () => {
    const [m] = await q(db, 'select id from escala_modelos limit 1');
    const feb = ['2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26'];
    await rpc(ADM, 'aplicar_modelo', [m.id, feb, 1, false]);   // rotação 1: 1ª data recebe a semana 2 do modelo (Carla)
    let at = await q(db, `select s.date::text d, a.user_name from escala_atribuicoes a join escala_semanas s on s.id=a.escala_id where s.date >= '2027-02-01' order by s.date`);
    assert.deepEqual(at.map((x) => `${x.d} ${x.user_name}`), [
      '2027-02-05 Carla Membra', '2027-02-12 Bruno Membro', '2027-02-19 Carla Membra', '2027-02-26 Bruno Membro']);

    const r2 = await rpc(ADM, 'aplicar_modelo', [m.id, feb, 0, false]);
    assert.deepEqual(r2, { criadas: 0, ignoradas: 4, substituidas: 0 });
    const r3 = await rpc(ADM, 'aplicar_modelo', [m.id, feb, 0, true]);
    assert.deepEqual(r3, { criadas: 4, ignoradas: 0, substituidas: 4 });
    at = await q(db, `select a.user_name from escala_atribuicoes a join escala_semanas s on s.id=a.escala_id where s.date = '2027-02-05'`);
    assert.equal(at[0].user_name, 'Bruno Membro');
  });

  test('modelo de 5 semanas e de 3 semanas convivem com o de 4', async () => {
    for (const n of [3, 5]) {
      const itens = Array.from({ length: n }, (_, i) => ({ semana: i + 1, user_id: i % 2 ? u.carla : u.bruno }));
      await rpc(ADM, 'salvar_modelo', [JSON.stringify({ nome: `Mês de ${n} semanas`, semanas: n, itens })]);
    }
    const ms = await q(db, 'select semanas from escala_modelos order by semanas');
    assert.deepEqual(ms.map((x) => x.semanas), [3, 4, 5]);
  });

  test('editar modelo troca os itens sem duplicar', async () => {
    const [m] = await q(db, `select id from escala_modelos where semanas = 3`);
    await rpc(ADM, 'salvar_modelo', [JSON.stringify({ id: m.id, nome: 'Mês curto', semanas: 3,
      itens: [{ semana: 1, user_id: u.carla }] })]);
    const it = await q(db, 'select semana, user_name from escala_modelo_itens where modelo_id = $1', [m.id]);
    assert.deepEqual(it.map((x) => `${x.semana}:${x.user_name}`), ['1:Carla Membra']);
  });

  test('salvar_semana: cria, edita atribuições e converte horário local para o fuso correto', async () => {
    const id = await rpc(ADM, 'salvar_semana', [JSON.stringify({
      date: '2027-03-05', alarm_local: '2027-03-05T18:30', alarm_30m: true,
      atribuicoes: [{ user_id: u.bruno, funcao_nome: 'Louvor' }] })]);
    let [s] = await q(db, `select alarm_ts at time zone 'America/Sao_Paulo' l, alarm_30m from escala_semanas where id=$1`, [id]);
    assert.match(s.l.toISOString(), /^2027-03-05T18:30:00/);
    assert.equal(s.alarm_30m, true);
    await rpc(ADM, 'salvar_semana', [JSON.stringify({ id, date: '2027-03-05',
      atribuicoes: [{ user_id: u.carla }, { user_id: u.bruno }] })]);
    const at = await q(db, 'select user_name, funcao_nome from escala_atribuicoes where escala_id=$1 order by user_name', [id]);
    assert.equal(at.length, 2);
    [s] = await q(db, 'select alarm_ts from escala_semanas where id=$1', [id]);
    assert.equal(s.alarm_ts, null);   // alarme removido ao salvar sem alarm_local
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('notificações: geração, fila, retentativas e avisos', () => {
  let db, u;
  before(async () => {
    db = await prepara();
    u = await criaUsuarios(db);
  });
  const servico = (fn) => comoServico(db, fn);
  const claim = (lim = 100) => servico(async () => (await db.query('select public.claim_notificacoes($1) r', [lim])).rows[0].r);
  const fin = (id, ok, erro) => servico(() => db.query('select public.finalizar_notificacao($1,$2,$3)', [id, ok, erro ?? null]));
  const semanaHoje = async (alarmeMinAtras, extras = {}) => {
    const hoje = await hojeSP(db);
    const alarm = (await q(db, `select to_char((now() - ($1::int || ' minutes')::interval) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') s`, [alarmeMinAtras]))[0].s;
    return comoUsuario(db, ADM, async () => (await db.query('select public.salvar_semana($1::jsonb) r', [JSON.stringify({
      date: hoje, alarm_local: alarm, atribuicoes: [{ user_id: u.bruno }], ...extras })])).rows[0].r);
  };

  test('alarme que já venceu vira notificação com texto personalizado e devolve os dispositivos', async () => {
    await db.exec(`insert into push_subscriptions (user_id, endpoint, subscription_json) values
      ('${u.bruno}', 'https://push.example/dev1', '{"endpoint":"https://push.example/dev1"}'),
      ('${u.bruno}', 'https://push.example/dev2', '{"endpoint":"https://push.example/dev2"}')`);
    const semId = await semanaHoje(1);
    const lote = await claim();
    assert.equal(lote.length, 1);
    const n = lote[0];
    assert.equal(n.user_id, u.bruno);
    assert.equal(n.kind, 'main');
    assert.match(n.corpo, /^Bruno, hoje às 19:30: você está na escala de Lanche da Célula Ágape\.$/);
    assert.equal(n.subs.length, 2);
    assert.equal(n.tentativas, 1);
    // segunda chamada não reivindica de novo (está "enviando")
    assert.equal((await claim()).length, 0);
    await fin(n.id, 2);
    const [row] = await q(db, 'select status, dispositivos_ok, enviada_em is not null ok from notificacoes where id=$1', [n.id]);
    assert.deepEqual([row.status, row.dispositivos_ok, row.ok], ['enviada', 2, true]);
    assert.equal((await claim()).length, 0);   // enviada não volta
    await db.exec(`delete from escala_semanas where id='${semId}'`);
  });

  test('falha temporária: volta para pendente com espera crescente e tenta de novo', async () => {
    await semanaHoje(1);
    const [n1] = await claim();
    await fin(n1.id, 0, 'HTTP 503');
    let [r] = await q(db, `select status, ultimo_erro, proxima_tentativa > now() futuro from notificacoes where id=$1`, [n1.id]);
    assert.deepEqual([r.status, r.ultimo_erro, r.futuro], ['pendente', 'HTTP 503', true]);
    assert.equal((await claim()).length, 0);            // ainda em espera
    await db.exec(`update notificacoes set proxima_tentativa = now() where id='${n1.id}'`);
    const [n2] = await claim();
    assert.equal(n2.id, n1.id);
    assert.equal(n2.tentativas, 2);
    await fin(n2.id, 1);
    [r] = await q(db, 'select status from notificacoes where id=$1', [n1.id]);
    assert.equal(r.status, 'enviada');
    await db.exec('delete from escala_semanas');
  });

  test('usuário sem dispositivo: fica pendente e recebe assim que cadastrar um aparelho (dentro da validade)', async () => {
    await db.exec(`delete from push_subscriptions; delete from escala_semanas;`);
    await semanaHoje(1);
    const [n] = await claim();
    assert.equal(n.subs.length, 0);
    await fin(n.id, 0, 'sem dispositivo cadastrado');
    await db.exec(`update notificacoes set proxima_tentativa = now()`);
    await comoUsuario(db, MB1, () => db.query(`select public.registrar_dispositivo('https://push.example/novo', '{"endpoint":"https://push.example/novo"}', 'UA')`));
    const [n2] = await claim();
    assert.equal(n2.subs.length, 1);
    await fin(n2.id, 1);
    await db.exec('delete from escala_semanas');
  });

  test('passou da validade sem entrega → expira; alarmes muito antigos nem chegam a ser criados', async () => {
    await semanaHoje(60 * 5);   // alarme "main" foi há 5h (validade 3h) → nem é criado
    assert.equal((await claim()).length, 0);
    assert.equal((await q(db, 'select count(*)::int n from notificacoes'))[0].n, 0);

    await semanaHoje(1);
    const [n] = await claim();
    await fin(n.id, 0, 'falhou');
    await db.exec(`update notificacoes set expira_em = now() - interval '1 minute', proxima_tentativa = now()`);
    assert.equal((await claim()).length, 0);
    const [r] = await q(db, 'select status from notificacoes where id=$1', [n.id]);
    assert.equal(r.status, 'expirada');
    await db.exec('delete from escala_semanas');
  });

  test('worker que morreu no meio: notificação "enviando" é liberada após 3 min', async () => {
    await semanaHoje(1);
    const [n] = await claim();
    await db.exec(`update notificacoes set travado_em = now() - interval '4 minutes' where id='${n.id}'`);
    const [n2] = await claim();
    assert.equal(n2.id, n.id);
    assert.equal(n2.tentativas, 2);
    await fin(n2.id, 1);
    await db.exec('delete from escala_semanas');
  });

  test('remover a pessoa da semana cancela o que estava pendente; reagendar reabre', async () => {
    await db.exec('delete from escala_semanas; delete from notificacoes;');
    // +9 dias (não +2): garante que a segunda-feira dessa semana também está no futuro,
    // senão o lembrete "início da semana" pode não ser gerado (depende do dia atual).
    const futuro = await hojeSP(db, 9);
    const id = await comoUsuario(db, ADM, async () => (await db.query('select public.salvar_semana($1::jsonb) r', [JSON.stringify({
      date: futuro, alarm_local: `${futuro}T17:00`, alarm_1d: true, alarm_3h: true, alarm_30m: true, alarm_semana: true,
      atribuicoes: [{ user_id: u.bruno }, { user_id: u.carla }] })])).rows[0].r);
    await claim();   // gera (nada vence ainda, exceto talvez "semana")
    const total = (await q(db, `select count(*)::int n from notificacoes where semana_id=$1`, [id]))[0].n;
    assert.ok(total >= 8, `esperava 5 tipos × 2 pessoas (menos os já vencidos), veio ${total}`);   // semana,1d,3h,30m,main × 2
    // tira a Carla
    await comoUsuario(db, ADM, () => db.query('select public.salvar_semana($1::jsonb)', [JSON.stringify({
      id, date: futuro, alarm_local: `${futuro}T17:00`, alarm_1d: true, alarm_3h: true, alarm_30m: true, alarm_semana: true,
      atribuicoes: [{ user_id: u.bruno }] })]));
    await claim();
    const c = await q(db, `select distinct n.status from notificacoes n where n.user_id=$1 and n.semana_id=$2`, [u.carla, id]);
    assert.deepEqual(c.map((x) => x.status), ['cancelada']);
    const b = await q(db, `select count(*)::int n from notificacoes n where n.user_id=$1 and n.semana_id=$2 and n.status='pendente'`, [u.bruno, id]);
    assert.ok(b[0].n >= 4);
    // reagenda: nova data/hora → fire_at muda
    const antes = (await q(db, `select fire_at from notificacoes where user_id=$1 and semana_id=$2 and kind='main'`, [u.bruno, id]))[0].fire_at;
    await comoUsuario(db, ADM, () => db.query('select public.salvar_semana($1::jsonb)', [JSON.stringify({
      id, date: futuro, alarm_local: `${futuro}T20:00`, atribuicoes: [{ user_id: u.bruno }] })]));
    await claim();
    const depois = (await q(db, `select fire_at, status from notificacoes where user_id=$1 and semana_id=$2 and kind='main'`, [u.bruno, id]))[0];
    assert.notEqual(String(depois.fire_at), String(antes));
    // desligar os extras cancela 1d/3h/30m/semana
    const st = await q(db, `select kind, status from notificacoes where user_id=$1 and semana_id=$2 order by kind`, [u.bruno, id]);
    for (const k of ['1d', '3h', '30m', 'semana']) assert.equal(st.find((x) => x.kind === k)?.status, 'cancelada', k);
    assert.equal(st.find((x) => x.kind === 'main').status, 'pendente');
  });

  test('aviso do mural vira notificação para todos, menos o autor', async () => {
    await db.exec('delete from notificacoes;');
    await db.exec(`insert into posts (type, content, author_id, author_name) values ('aviso', 'Célula   mudou   para sábado!', '${u.ana}', 'Ana')`);
    const rows = await q(db, `select u.login, n.corpo, n.kind, n.url from notificacoes n join users u on u.id=n.user_id order by u.login`);
    assert.deepEqual(rows.map((r) => r.login), ['bruno', 'carla']);
    assert.equal(rows[0].corpo, 'Célula mudou para sábado!');
    assert.equal(rows[0].kind, 'aviso');
    assert.equal((await claim()).length, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe('02_seguranca_rls.sql — quem pode o quê', () => {
  let db, u;
  before(async () => {
    db = await prepara();
    u = await criaUsuarios(db);
    await db.exec(`update users set pass_hash = 'agape2024'`);
    await db.exec(sql('02_seguranca_rls.sql'));
    await db.exec(`insert into posts (type, content, author_id, author_name) values ('mensagem','post do bruno','${u.bruno}','Bruno Membro')`);
    await db.exec(`insert into escala_semanas (date) values ('2027-05-07')`);
  });
  const ins = (auth, valores) => comoUsuario(db, auth, () =>
    db.query(`insert into posts (type, content, author_id, author_name, image_path, image_bytes) values ($1,$2,$3,$4,$5,$6) returning author_id, author_name`, valores));

  test('a coluna de senha em texto puro deixa de existir', async () => {
    const c = await q(db, `select 1 from information_schema.columns where table_name='users' and column_name='pass_hash'`);
    assert.equal(c.length, 0);
  });

  test('anônimo: lê mural e escala, mas não escreve nem enxerga usuários/dispositivos/notificações', async () => {
    await comoAnon(db, async () => {
      assert.equal((await db.query('select * from posts')).rows.length, 1);
      assert.equal((await db.query('select * from escala_semanas')).rows.length, 1);
      await rejeita(db.query(`insert into posts (type, content, author_name) values ('mensagem','spam','x')`), /permission denied|row-level security/);
      await rejeita(db.query(`delete from posts`), /permission denied/);
      await rejeita(db.query(`select * from users`), /permission denied/);
      await rejeita(db.query(`select * from push_subscriptions`), /permission denied/);
      await rejeita(db.query(`select * from notificacoes`), /permission denied/);
    });
  });

  test('membro publica, mas a identidade vem do servidor (não dá para se passar por outro)', async () => {
    const r = await ins(MB2, ['mensagem', 'oi', u.ana, 'Ana Admin (falso)', null, null]);
    assert.equal(r.rows[0].author_id, u.carla);
    assert.equal(r.rows[0].author_name, 'Carla Membra');
  });

  test('membro não publica aviso; admin publica', async () => {
    await rejeita(ins(MB1, ['aviso', 'fake', u.bruno, 'x', null, null]), /row-level security/);
    const r = await ins(ADM, ['aviso', 'reunião amanhã', u.ana, 'x', null, null]);
    assert.equal(r.rows[0].author_name, 'Ana Admin');
  });

  test('conta do Auth sem cadastro em users (signup aberto) não consegue escrever', async () => {
    await rejeita(ins(RUIM, ['mensagem', 'invasor', u.bruno, 'x', null, null]), /row-level security/);
  });

  test('limites de imagem: caminho de outra pessoa e arquivo grande são recusados; post vazio também', async () => {
    await rejeita(ins(MB1, ['mensagem', 'foto', u.bruno, 'x', `${MB2}/a.webp`, 1000]), /caminho de imagem inválido/);
    await rejeita(ins(MB1, ['mensagem', 'foto', u.bruno, 'x', `${MB1}/a.webp`, 400000]), /acima do limite/);
    await rejeita(ins(MB1, ['mensagem', '   ', u.bruno, 'x', null, null]), /post vazio/);
    const ok = await ins(MB1, ['mensagem', '', u.bruno, 'x', `${MB1}/a.webp`, 120000]);   // só imagem, ok
    assert.equal(ok.rows.length, 1);
  });

  test('apagar post: o dono ou ADM; outro membro não', async () => {
    const [p] = await q(db, `select id from posts where content='post do bruno'`);
    await comoUsuario(db, MB2, async () => {
      const r = await db.query('delete from posts where id=$1 returning id', [p.id]);
      assert.equal(r.rows.length, 0);
    });
    await comoUsuario(db, ADM, async () => {
      const r = await db.query('delete from posts where id=$1 returning id', [p.id]);
      assert.equal(r.rows.length, 1);
    });
  });

  test('users: membro lê a lista mas não altera; escala: membro não escreve; ADM escreve', async () => {
    await comoUsuario(db, MB1, async () => {
      assert.equal((await db.query('select * from users')).rows.length, 3);
      assert.equal((await db.query(`update users set role='adm' where login='bruno' returning id`)).rows.length, 0);
      await rejeita(db.query(`insert into escala_semanas (date) values ('2027-06-04')`), /row-level security/);
      await rejeita(db.query(`select public.salvar_semana('{"date":"2027-06-04"}'::jsonb)`), /apenas administradores/);
      await rejeita(db.query(`select public.dispositivos_por_usuario()`), /apenas administradores/);
    });
    await comoUsuario(db, ADM, async () => {
      await db.query(`insert into escala_semanas (date) values ('2027-06-04')`);
      const d = (await db.query(`select public.dispositivos_por_usuario() r`)).rows[0].r;
      assert.equal(d.length, 3);
    });
  });

  test('dispositivos: cada um enxerga só os seus; aparelho pode trocar de dono ao logar com outra conta', async () => {
    await comoUsuario(db, MB1, () => db.query(`select public.registrar_dispositivo('https://push.example/x', '{"endpoint":"https://push.example/x"}', 'Chrome')`));
    await comoUsuario(db, MB2, async () => assert.equal((await db.query('select * from push_subscriptions')).rows.length, 0));
    await comoUsuario(db, MB2, () => db.query(`select public.registrar_dispositivo('https://push.example/x', '{"endpoint":"https://push.example/x"}', 'Chrome')`));
    const [d] = await q(db, `select user_id from push_subscriptions where endpoint='https://push.example/x'`);
    assert.equal(d.user_id, u.carla);
    await comoUsuario(db, MB1, () => db.query(`select public.remover_dispositivo('https://push.example/x')`));   // não é mais dele
    assert.equal((await q(db, `select count(*)::int n from push_subscriptions`))[0].n, 1);
    await comoUsuario(db, MB2, () => db.query(`select public.remover_dispositivo('https://push.example/x')`));
    assert.equal((await q(db, `select count(*)::int n from push_subscriptions`))[0].n, 0);
  });

  test('funções internas de notificação só o service_role executa', async () => {
    await comoUsuario(db, ADM, async () => {
      await rejeita(db.query('select public.claim_notificacoes(10)'), /permission denied/);
      await rejeita(db.query('select public.gerar_notificacoes()'), /permission denied/);
    });
    await comoAnon(db, async () => {
      await rejeita(db.query('select public.claim_notificacoes(10)'), /permission denied/);
    });
  });

  test('storage: só grava na própria pasta; ADM apaga de qualquer um; anônimo não grava', async () => {
    const put = (auth, nome) => comoUsuario(db, auth, () => db.query(`insert into storage.objects (bucket_id, name) values ('mural', $1)`, [nome]));
    await put(MB1, `${MB1}/foto1.webp`);
    await rejeita(put(MB1, `${MB2}/foto2.webp`), /row-level security/);
    await rejeita(put(RUIM, `${RUIM}/foto.webp`), /row-level security/);
    await comoAnon(db, async () => rejeita(db.query(`insert into storage.objects (bucket_id, name) values ('mural','x/y.webp')`), /row-level security|permission denied/));
    await comoUsuario(db, MB2, async () => assert.equal((await db.query(`delete from storage.objects where name like '${MB1}/%' returning id`)).rows.length, 0));
    await comoUsuario(db, ADM, async () => assert.equal((await db.query(`delete from storage.objects where name like '${MB1}/%' returning id`)).rows.length, 1));
    const b = (await q(db, `select public, file_size_limit, allowed_mime_types from storage.buckets where id='mural'`))[0];
    assert.equal(b.public, true);
    assert.equal(Number(b.file_size_limit), 307200);
  });
});

describe('02_seguranca_rls.sql — trava de segurança', () => {
  test('recusa rodar enquanto houver usuário sem conta no Auth', async () => {
    const db = await prepara();
    await db.exec(`insert into users (name, login, role) values ('Sem Auth', 'semauth', 'membro')`);
    await rejeita(db.exec(sql('02_seguranca_rls.sql')), /sem conta no Supabase Auth/);
  });
});
