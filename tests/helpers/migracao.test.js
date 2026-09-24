import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrar } from '../scripts/migrar-usuarios.mjs';
import { criarFake } from './helpers/fake-supabase.js';

const silencio = () => {};

test('migra mantendo a senha antiga quando válida, gera temporária quando curta, limpa pass_hash e pula quem já migrou', async () => {
  const contas = {};
  const fake = criarFake({ contas, users: [
    { id: '1', name: 'Ana', login: 'ana', role: 'adm', pass_hash: 'agape2024', auth_id: null },
    { id: '2', name: 'Bruno', login: 'Bruno', role: 'membro', pass_hash: '123', auth_id: null },
    { id: '3', name: 'Carla', login: 'carla', role: 'membro', pass_hash: 'xxxxxxx', auth_id: 'ja-migrada' },
  ] });
  const r = await migrar({ db: fake, dominio: 'celulaagape.app', log: silencio });
  assert.deepEqual(r.migrados, ['ana', 'Bruno']);
  assert.equal(r.temporarias.length, 1);
  assert.equal(r.temporarias[0].login, 'Bruno');
  assert.ok(r.temporarias[0].senha.length >= 6);
  assert.equal(r.falhas.length, 0);

  // a senha antiga da Ana virou a senha da conta no Auth
  assert.equal(fake.tabelas.users[0].auth_id !== null, true);
  assert.equal(contas['ana@celulaagape.app'].password, 'agape2024');
  assert.equal(contas['bruno@celulaagape.app'].password, r.temporarias[0].senha);
  // texto puro apagado dos migrados; o já migrado ficou intacto
  assert.equal(fake.tabelas.users[0].pass_hash, null);
  assert.equal(fake.tabelas.users[1].pass_hash, null);
  assert.equal(fake.tabelas.users[2].pass_hash, 'xxxxxxx');
  // e-mails internos previsíveis (o pré-teste "sonda" foi criado e apagado)
  assert.ok(fake.log.authCriadas.includes('ana@celulaagape.app'));
  assert.ok(fake.log.authCriadas.includes('bruno@celulaagape.app'));
  assert.equal(fake.log.authApagadas.length, 1);
});

test('rodar de novo é seguro (idempotente) e reaproveita conta que já existe no Auth', async () => {
  const fake = criarFake({
    users: [{ id: '1', name: 'Ana', login: 'ana', role: 'adm', pass_hash: 'agape2024', auth_id: null }],
    contas: { 'ana@celulaagape.app': { id: 'auth-existente', password: 'x' } } });
  const r = await migrar({ db: fake, dominio: 'celulaagape.app', log: silencio });
  assert.deepEqual(r.migrados, ['ana']);
  assert.equal(fake.tabelas.users[0].auth_id, 'auth-existente');
  const r2 = await migrar({ db: fake, dominio: 'celulaagape.app', log: silencio });
  assert.deepEqual(r2.migrados, []);
});

test('--dry-run não cria nada', async () => {
  const fake = criarFake({ users: [{ id: '1', name: 'Ana', login: 'ana', role: 'adm', pass_hash: 'agape2024', auth_id: null }] });
  await migrar({ db: fake, dominio: 'celulaagape.app', dryRun: true, log: silencio });
  assert.equal(fake.log.authCriadas.length, 0);
  assert.equal(fake.tabelas.users[0].auth_id, null);
});

test('pré-teste: se o Supabase recusar o domínio, para antes de mexer em qualquer usuário', async () => {
  const fake = criarFake({ users: [{ id: '1', name: 'Ana', login: 'ana', role: 'adm', pass_hash: 'agape2024', auth_id: null }] });
  fake.auth.admin.createUser = async () => ({ data: null, error: { message: 'Email address is invalid' } });
  await assert.rejects(migrar({ db: fake, dominio: 'dominio-ruim.xyz', log: silencio }), /recusou o domínio.*AUTH_EMAIL_DOMAIN/s);
  assert.equal(fake.tabelas.users[0].auth_id, null);
});
