import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSessao } from '../api/_lib/auth.js';
import { criarHandler } from '../api-routes/palavra-celula.js';

process.env.AUTH_SESSION_SECRET = 'segredo-exclusivo-de-testes-locais-32-caracteres';

const ID = '2ba4709c-b78a-46cd-b641-5fa83d0ef123';
const pessoa = { id: ID, name: 'Administrador', role: 'adm', login: 'adm', perfil_id: null, session_version: 0 };

function ambiente() {
  const arquivo = { current: null, uploaded: false, removidos: [], attempts: 0 };
  const storage = {
    async createSignedUploadUrl(path) {
      arquivo.pending = path;
      return { data: { token: 'assinatura-temporaria' }, error: null };
    },
    async list(folder, { search }) {
      const full = folder + '/' + search;
      if (!arquivo.uploaded || full !== arquivo.pending) return { data: [], error: null };
      return { data: [{ id: 'storage-id', name: search, metadata: { size: 12345, mimetype: 'application/pdf' } }], error: null };
    },
    async remove(paths) { arquivo.removidos.push(...paths); return { error: null }; },
  };
  const db = {
    storage: { from: (bucket) => { assert.equal(bucket, 'palavra-celula'); return storage; } },
    from(table) {
      if (table === 'users') return {
        select() { return { eq(k, v) {
          assert.equal(k, 'id'); assert.equal(v, ID);
          return { async maybeSingle() { return { data: pessoa, error: null }; } };
        } }; },
      };
      if (table === 'palavra_celula') return {
        select() { return { eq(k, v) {
          assert.equal(k, 'id'); assert.equal(v, true);
          return { async maybeSingle() { return { data: arquivo.current, error: null }; } };
        } }; },
        upsert(row) {
          arquivo.current = row;
          return { select() { return { async single() { return { data: arquivo.current, error: null }; } }; } };
        },
        delete() { return { async eq() { arquivo.current = null; return { error: null }; } }; },
      };
      throw new Error('Tabela imprevista: ' + table);
    },
  };
  const handler = criarHandler({ criarCliente: () => db });
  const auth = 'agape-session=' + encodeURIComponent(criarSessao(pessoa));
  async function chamar(method, body, logado = true) {
    const res = {
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    await handler({ method, body, headers: { cookie: logado ? auth : '', origin: 'https://agape.example', host: 'agape.example', 'x-forwarded-proto': 'https' } }, res);
    return { code: res.code, ...res.payload };
  }
  return { arquivo, chamar };
}

test('consulta da Palavra é pública e vazia sem documento', async () => {
  const app = ambiente();
  const r = await app.chamar('GET');
  assert.equal(r.code, 200);
  assert.equal(r.palavra, null);
});

test('login é obrigatório para assinar upload', async () => {
  const app = ambiente();
  const r = await app.chamar('POST', { acao: 'preparar', nome_arquivo: 'palavra.pdf', tamanho: 100 }, false);
  assert.equal(r.code, 401);
});

test('não aceita arquivo fora do formato ou maior que 15 MB', async () => {
  const app = ambiente();
  assert.equal((await app.chamar('POST', { acao: 'preparar', nome_arquivo: 'palavra.jpg', tamanho: 100 })).code, 400);
  assert.equal((await app.chamar('POST', { acao: 'preparar', nome_arquivo: 'palavra.pdf', tamanho: 16 * 1024 * 1024 })).code, 400);
});

test('publica e substitui PDF sem pedir quantidade de páginas', async () => {
  const app = ambiente();
  const preparar = await app.chamar('POST', { acao: 'preparar', nome_arquivo: 'Palavra semanal.pdf', tamanho: 12345 });
  assert.equal(preparar.code, 200);
  assert.equal(preparar.token, 'assinatura-temporaria');
  assert.match(preparar.path, new RegExp('^' + ID + '/palavra-'));
  assert.equal((await app.chamar('POST', { acao: 'confirmar', path: preparar.path, nome_arquivo: 'Palavra semanal.pdf' })).code, 409);
  app.arquivo.uploaded = true;
  const publicar = await app.chamar('POST', { acao: 'confirmar', path: preparar.path, nome_arquivo: 'Palavra semanal.pdf' });
  assert.equal(publicar.code, 200);
  assert.equal(publicar.palavra.paginas, null);
  assert.equal(publicar.palavra.arquivo_path, preparar.path);
  const buscar = await app.chamar('GET', undefined, false);
  assert.equal(buscar.palavra.nome_arquivo, 'Palavra semanal.pdf');
  const remover = await app.chamar('POST', { acao: 'remover' });
  assert.equal(remover.code, 200);
  assert.deepEqual(app.arquivo.removidos, [preparar.path]);
  assert.equal((await app.chamar('GET')).palavra, null);
});

test('não aceita confirmação de caminho de outra conta', async () => {
  const app = ambiente();
  const resposta = await app.chamar('POST', { acao: 'confirmar', path: 'qualquer-outra-conta/palavra-20261029.pdf', nome_arquivo: 'a.pdf' });
  assert.equal(resposta.code, 400);
});
