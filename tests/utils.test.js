import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../js/utils.js';
import { normalizarLogin as loginServidor, loginParaEmail as emailServidor } from '../api/_lib/login.js';
import { novoBanco, sql, comoUsuario } from './helpers/db.js';

const U = globalThis.AgapeUtils;

describe('esc / idSeguro', () => {
  test('neutraliza HTML e aspas', () => {
    assert.equal(U.esc(`<img src=x onerror="alert(1)">'&\``), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;&#96;');
    assert.equal(U.esc(null), '');
    assert.equal(U.esc(0), '0');
  });
  test('id só passa se parecer uuid', () => {
    assert.equal(U.idSeguro('3f2b8c1e-7a40-4b9e-8d55-0c1f9a2b7d10'), '3f2b8c1e-7a40-4b9e-8d55-0c1f9a2b7d10');
    assert.equal(U.idSeguro(`x'); alert(1);//`), '');
  });
});

describe('login → e-mail: navegador e servidor têm que concordar', () => {
  for (const l of ['Ana', ' José.Silva ', 'Maria da Luz', 'ÁÉÍ_ÓÚ', 'a.b-c_d', 'João  Pedro!!', '--x--', 'çãõ']) {
    test(`"${l}"`, () => {
      assert.equal(U.normalizarLogin(l), loginServidor(l));
      assert.equal(U.loginParaEmail(l, 'x.com'), emailServidor(l, 'x.com'));
    });
  }
});

describe('datas do mês', () => {
  test('sextas de setembro/2026 (4) e de outubro/2026 (5)', () => {
    assert.deepEqual(U.datasDoMes(2026, 9, 5), ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
    assert.deepEqual(U.datasDoMes(2026, 10, 5), ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
  });
  test('quantidade varia entre 4 e 5 conforme o mês (nunca 3 sem intervenção do admin)', () => {
    for (let dia = 0; dep(dia); dia++) {
      for (let m = 1; m <= 12; m++) {
        const n = U.datasDoMes(2026, m, dia).length;
        assert.ok(n === 4 || n === 5, `mês ${m} dia ${dia}: ${n}`);
      }
    }
    function dep(d) { return d < 7; }
  });
  test('fevereiro de ano não bissexto e bissexto', () => {
    assert.equal(U.datasDoMes(2027, 2, 1).length, 4);
    assert.equal(U.datasDoMes(2028, 2, 2).length, 5);   // 29 dias
  });
  test('formatação em pt-BR', () => {
    assert.equal(U.dataLonga('2026-09-18'), 'sexta-feira, 18/09');
    assert.equal(U.tituloMes('2026-03'), 'Março de 2026');
    assert.equal(U.hojeISO('America/Sao_Paulo', new Date('2026-09-19T02:30:00Z')), '2026-09-18');   // ainda é dia 18 em SP
  });
});

describe('agrupamento da escala por mês', () => {
  const semanas = [
    { id: 'c', date: '2026-10-02' }, { id: 'a', date: '2026-09-11' }, { id: 'b', date: '2026-09-18' },
    { id: 'd', date: '2026-10-09' }, { id: 'e', date: '2026-09-04' },
  ];
  test('ordena, agrupa e numera dentro do mês', () => {
    const g = U.agruparPorMes(semanas);
    assert.deepEqual(g.map((x) => [x.chave, x.titulo, x.itens.length]), [['2026-09', 'Setembro de 2026', 3], ['2026-10', 'Outubro de 2026', 2]]);
    assert.deepEqual(g[0].itens.map((s) => `${s.id}:${s.numero}/${s.total}`), ['e:1/3', 'a:2/3', 'b:3/3']);
  });
  test('próxima semana = primeira com data >= hoje', () => {
    assert.equal(U.proximaSemana(semanas, '2026-09-12').id, 'b');
    assert.equal(U.proximaSemana(semanas, '2026-09-18').id, 'b');   // hoje conta
    assert.equal(U.proximaSemana(semanas, '2027-01-01'), null);
  });
});

describe('fuso horário do alarme', () => {
  test('UTC → horário de Brasília (input datetime-local)', () => {
    assert.equal(U.paraLocalInput('2026-09-18T20:00:00Z'), '2026-09-18T17:00');
    assert.equal(U.paraLocalInput('2026-09-19T02:59:00Z'), '2026-09-18T23:59');
    assert.equal(U.paraLocalInput('2026-09-19T03:00:00Z'), '2026-09-19T00:00');   // meia-noite sem virar "24:00"
    assert.equal(U.paraLocalInput(null), '');
  });
  test('resumo do alarme para exibir no card', () => {
    assert.equal(U.resumoAlarme({ alarm_ts: '2026-09-18T20:00:00Z', alarm_1d: true, alarm_3h: false, alarm_30m: true, alarm_semana: true }),
      'às 17:00 + início da semana, 1 dia antes, 30 min antes');
    assert.equal(U.resumoAlarme({ alarm_ts: null, alarm_semana: false }), '');
  });
});

describe('compressão de imagem (planejamento)', () => {
  test('mantém proporção e nunca aumenta', () => {
    assert.deepEqual(U.dimensoesAlvo(4000, 3000, 1280), { w: 1280, h: 960 });
    assert.deepEqual(U.dimensoesAlvo(3000, 4000, 1280), { w: 960, h: 1280 });
    assert.deepEqual(U.dimensoesAlvo(800, 600, 1280), { w: 800, h: 600 });
    assert.deepEqual(U.dimensoesAlvo(1, 5000, 1280), { w: 1, h: 1280 });
  });
  test('o plano só fica mais leve a cada tentativa e o alvo é menor que o limite do banco', () => {
    const p = U.planoCompressao();
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i].maxDim <= p[i - 1].maxDim);
      if (p[i].maxDim === p[i - 1].maxDim) assert.ok(p[i].q < p[i - 1].q);
    }
    assert.ok(U.ALVO_IMAGEM < U.LIMITE_IMAGEM);
    assert.equal(U.LIMITE_IMAGEM, 307200);   // mesmo número do bucket/trigger no SQL
    assert.equal(U.formatarBytes(153600), '150 KB');
  });
  test('o limite do JS é o mesmo do SQL', async () => {
    const texto = sql('01_schema.sql');
    assert.match(texto, /file_size_limit[\s\S]*?15728640/);
    assert.match(texto, /> 307200/);
  });
});

describe('distribuirModelo (preview do app) = aplicar_modelo (banco)', () => {
  test('mesma distribuição para todas as rotações, em modelos de 3, 4 e 5 semanas', async () => {
    const db = await novoBanco();
    await db.exec(sql('01_schema.sql'));
    const AD = '00000000-0000-4000-8000-0000000000a1';
    await db.exec(`insert into users (name, login, role, auth_id) values ('Ana','ana','adm','${AD}'),('Bia','bia','membro',null),('Caio','caio','membro',null),('Duda','duda','membro',null),('Edu','edu','membro',null)`);
    const ids = (await db.query('select id, name from users where login <> \'ana\' order by name')).rows;
    let seq = 0;
    for (const n of [3, 4, 5]) {
      const itens = Array.from({ length: n }, (_, i) => ({ semana: i + 1, user_id: ids[i % ids.length].id, user_name: ids[i % ids.length].name }));
      const datas = U.datasDoMes(2031, n === 3 ? 2 : n === 4 ? 4 : 5, 5).slice(0, n);
      for (const rot of [0, 1, 2, -1, 7]) {
        const { rows: [{ id: mid }] } = await comoUsuario(db, AD, () => db.query(`select public.salvar_modelo($1::jsonb) id`, [JSON.stringify({ nome: `m${++seq}`, semanas: n, itens })]));
        await comoUsuario(db, AD, () => db.query('select public.aplicar_modelo($1,$2::date[],$3,true)', [mid, datas, rot]));
        const banco = (await db.query(`select s.date::text d, string_agg(a.user_name, ',' order by a.user_name) nomes
          from escala_semanas s join escala_atribuicoes a on a.escala_id=s.id where s.date = any($1::date[]) group by s.date order by s.date`, [datas])).rows;
        const app = U.distribuirModelo(itens, datas, rot).map((x) => ({ d: x.data, nomes: x.itens.map((i) => i.user_name).sort().join(',') }));
        assert.deepEqual(banco.map((b) => ({ d: b.d, nomes: b.nomes })), app, `n=${n} rot=${rot}`);
      }
    }
  });
});
