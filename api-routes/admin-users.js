// Usuários e senhas são gerenciados pelo Ágape, sem criar contas no Supabase Auth.
import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirAdmin, usuarioAutenticado } from '../api/_lib/auth.js';
import { normalizarLogin } from '../api/_lib/login.js';
import { hashPassword, verifyPassword, validarSenha } from '../api/_lib/password.js';

function senhaOuErro(senha) {
  if (!validarSenha(senha)) throw new HttpError(400, 'a senha precisa ter entre 6 e 128 caracteres');
}
async function buscarUsuario(db, id) {
  const { data, error } = await db.from('users')
    .select('id,name,login,role,session_version,perfil_id').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, 'usuário não encontrado');
  return data;
}
async function contarAdmins(db) {
  const { count, error } = await db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'adm');
  if (error) throw new Error(error.message);
  return count || 0;
}
async function perfilPermitido(db, id) {
  if (!id) throw new HttpError(400, 'escolha um perfil de acesso');
  const { data, error } = await db.from('perfis_permissao')
    .select('id,nome').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(400, 'perfil de acesso inválido');
  return data;
}
async function atualizarSenha(db, id, senha, versao) {
  const { error } = await db.from('users').update({
    pass_hash: await hashPassword(senha),
    session_version: Number(versao || 0) + 1,
  }).eq('id', id);
  if (error) throw new Error(error.message);
}

export function criarHandler({ criarCliente = clienteAdmin } = {}) {
  return envolver(async (req, res) => {
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
    const db = criarCliente();
    const { acao } = req.body || {};

    if (acao === 'trocar_senha') {
      const { perfil: eu } = await usuarioAutenticado(db, req);
      senhaOuErro(req.body.senhaNova);
      const { data: atual, error } = await db.from('users')
        .select('pass_hash,session_version').eq('id', eu.id).single();
      if (error) throw new Error(error.message);
      if (!(await verifyPassword(String(req.body.senhaAtual || ''), atual?.pass_hash))) {
        throw new HttpError(401, 'senha atual incorreta');
      }
      await atualizarSenha(db, eu.id, req.body.senhaNova, atual.session_version);
      res.setHeader('Set-Cookie', 'agape-session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure');
      return responder(res, 200, { ok: true, entrar_novamente: true });
    }

    const { perfil: eu } = await exigirAdmin(db, req);
    if (acao === 'consultar_situacao') {
      const alvo = await buscarUsuario(db, req.body.id);
      const { data, error } = await db.from('users').select('ativo,data_ingresso_celula').eq('id', alvo.id).single();
      if (error) throw new HttpError(503, 'Cadastre primeiro a migração de Chamada/Frequência.');
      return responder(res, 200, { ok: true, usuario: { ...data, id: alvo.id } });
    }
    if (acao === 'salvar_situacao') {
      const alvo = await buscarUsuario(db, req.body.id);
      if (typeof req.body.ativo !== 'boolean') throw new HttpError(400, 'Situação inválida');
      if (alvo.id === eu.id && req.body.ativo === false) throw new HttpError(400, 'Você não pode inativar sua própria conta');
      const ingresso = req.body.data_ingresso_celula || null;
      if (ingresso && (!/^\d{4}-\d{2}-\d{2}$/.test(ingresso) ||
        Number.isNaN(Date.parse(ingresso)) || new Date(ingresso).toISOString().slice(0,10) !== ingresso)) {
        throw new HttpError(400, 'Data de ingresso inválida');
      }
      const { error } = await db.from('users').update({ ativo: req.body.ativo, data_ingresso_celula: ingresso }).eq('id', alvo.id);
      if (error) throw new Error(error.message);
      return responder(res, 200, { ok: true });
    }
    if (acao === 'listar') {
      const { data, error } = await db.from('users')
        .select('id,name,login,role,perfil_id,created_at,avatar_url').order('name');
      if (error) throw new Error(error.message);
      return responder(res, 200, { ok: true, usuarios: data || [] });
    }
    if (acao === 'criar') {
      const nome = String(req.body.nome || '').trim();
      const login = normalizarLogin(req.body.login);
      const perfilId = String(req.body.perfilId || '');
      if (nome.length < 2 || nome.length > 80) throw new HttpError(400, 'informe o nome (2 a 80 caracteres)');
      if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new HttpError(400, 'login inválido (3 a 30 caracteres)');
      senhaOuErro(req.body.senha);
      await perfilPermitido(db, perfilId);
      const { data: existente, error: buscaErro } = await db.from('users')
        .select('id').eq('login', login).maybeSingle();
      if (buscaErro) throw new Error(buscaErro.message);
      if (existente) throw new HttpError(409, 'já existe uma conta com esse login');
      const { data, error } = await db.from('users').insert({
        name: nome, login, role: 'membro', perfil_id: perfilId,
        pass_hash: await hashPassword(req.body.senha), auth_id: null,
      }).select('id,name,login,role,perfil_id').single();
      if (error) {
        if (error.code === '23505') throw new HttpError(409, 'já existe uma conta com esse login');
        throw new Error(error.message);
      }
      return responder(res, 201, { ok: true, usuario: data });
    }
    if (acao === 'redefinir_senha') {
      senhaOuErro(req.body.senha);
      const alvo = await buscarUsuario(db, req.body.id);
      await atualizarSenha(db, alvo.id, req.body.senha, alvo.session_version);
      return responder(res, 200, { ok: true });
    }
    if (acao === 'excluir') {
      const alvo = await buscarUsuario(db, req.body.id);
      if (alvo.id === eu.id) throw new HttpError(400, 'você não pode excluir sua própria conta');
      if (alvo.role === 'adm' && await contarAdmins(db) <= 1) {
        throw new HttpError(400, 'não é possível excluir o último administrador');
      }
      const { error } = await db.from('users').delete().eq('id', alvo.id);
      if (error) throw new Error(error.message);
      return responder(res, 200, { ok: true });
    }
    if (acao === 'alterar_perfil') {
      if (!['adm','membro'].includes(req.body.perfil)) throw new HttpError(400, 'perfil inválido');
      const alvo = await buscarUsuario(db, req.body.id);
      if (alvo.role === 'adm' && req.body.perfil !== 'adm' && await contarAdmins(db) <= 1) {
        throw new HttpError(400, 'não é possível remover o último administrador');
      }
      const { error } = await db.from('users').update({
        role: req.body.perfil,
        session_version: Number(alvo.session_version || 0) + 1,
      }).eq('id', alvo.id);
      if (error) throw new Error(error.message);
      return responder(res, 200, { ok: true });
    }
    throw new HttpError(400, 'ação desconhecida');
  });
}
export default criarHandler();
