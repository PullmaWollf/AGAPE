// Gestão de usuários (só ADM). Usa a chave de serviço porque criar/excluir contas
// no Supabase Auth e trocar senhas não pode ser feito pelo navegador.
import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirAdmin } from '../api/_lib/auth.js';
import { normalizarLogin, loginParaEmail } from '../api/_lib/login.js';
import { hashPassword, verifyPassword, validarSenha } from '../api/_lib/password.js';

const PERFIS = ['adm', 'admin', 'administrador', 'membro'];

function validarSenhaOuErro(s) {
  if (!validarSenha(s)) throw new HttpError(400, 'a senha precisa ter entre 6 e 128 caracteres');
}

async function buscarUsuario(db, id) {
  const { data, error } = await db.from('users').select('id, name, login, role, auth_id').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, 'usuário não encontrado');
  return data;
}

async function contarAdmins(db) {
  const { count, error } = await db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'adm');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const traduzirAuth = (msg = '') =>
  /already|registered|exists/i.test(msg) ? 'já existe uma conta com esse login'
  : /email/i.test(msg) ? `o Supabase recusou o e-mail interno (${msg}). Veja AUTH_EMAIL_DOMAIN no README.`
  : msg;

export function criarHandler({ env = process.env, criarCliente = clienteAdmin } = {}) {
  return envolver(async (req, res) => {
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
    const db = criarCliente(env);
    const { perfil: eu } = await exigirAdmin(db, req);
    const { acao } = req.body || {};

    if (acao === 'listar') {
      const { data, error } = await db.from('users').select('id,name,login,role,perfil_id,created_at').order('name');
      if (error) throw new Error(error.message);
      return responder(res, 200, { ok: true, usuarios: data || [] });
    }

    if (acao === 'trocar_senha') {
      validarSenhaOuErro(req.body.senhaNova);
      const { data: atual } = await db.from('users').select('pass_hash').eq('id', eu.id).single();
      if (!atual || !(await verifyPassword(String(req.body.senhaAtual ?? ''), atual.pass_hash))) throw new HttpError(401, 'senha atual incorreta');
      const { error } = await db.from('users').update({ pass_hash: await hashPassword(req.body.senhaNova) }).eq('id', eu.id);
      if (error) throw new HttpError(400, error.message);
      return responder(res, 200, { ok: true });
    }

    if (acao === 'criar') {
      const nome = String(req.body.nome ?? '').trim();
      const login = normalizarLogin(req.body.login);
      const perfilId = String(req.body.perfilId || '').trim();
      const perfilLegado = String(req.body.perfil || '').trim();
      const roleSolicitada = perfilLegado === 'adm' || perfilLegado === 'admin' || perfilLegado === 'administrador' ? 'adm' : 'membro';
      if (nome.length < 2 || nome.length > 80) throw new HttpError(400, 'informe o nome (2 a 80 caracteres)');
      if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new HttpError(400, 'login: 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado');
      if (perfilLegado && !PERFIS.includes(perfilLegado)) throw new HttpError(400, 'perfil inválido');
      if (perfilId) {
        const { data: perfilAcesso, error: perfilError } = await db.from('perfis_permissao').select('id,nome,permissoes').eq('id', perfilId).maybeSingle();
        if (perfilError) throw new Error(perfilError.message);
        if (!perfilAcesso) throw new HttpError(400, 'perfil de acesso inválido');
      }
      validarSenhaOuErro(req.body.senha);
      const { data: existente } = await db.from('users').select('id').ilike('login', login).maybeSingle();
      if (existente) throw new HttpError(409, 'já existe um usuário com esse login');
      const email = loginParaEmail(login, env.AUTH_EMAIL_DOMAIN);
      const conta = await db.auth.admin.createUser({ email, password: req.body.senha, email_confirm: true });
      if (conta.error) throw new HttpError(409, traduzirAuth(conta.error.message));
      const authId = conta.data.user.id;
      const { data: novo, error: eIns } = await db.from('users')
        .insert({ name: nome, login, role: roleSolicitada, perfil_id: perfilId || null, auth_id: authId, pass_hash: null })
        .select('id, name, login, role, perfil_id').single();
      if (eIns) { await db.auth.admin.deleteUser(authId); throw new Error(eIns.message); }
      return responder(res, 200, { ok: true, usuario: novo });
    }

    if (acao === 'excluir') {
      const alvo = await buscarUsuario(db, req.body.id);
      if (alvo.id === eu.id) throw new HttpError(400, 'você não pode excluir a si mesmo');
      if (alvo.role === 'adm' && (await contarAdmins(db)) <= 1) throw new HttpError(400, 'não é possível excluir o último administrador');
      const { error } = await db.from('users').delete().eq('id', alvo.id);
      if (error) throw new Error(error.message);
      if (alvo.auth_id) await db.auth.admin.deleteUser(alvo.auth_id);
      return responder(res, 200, { ok: true });
    }

    if (acao === 'redefinir_senha') {
      validarSenhaOuErro(req.body.senha);
      const alvo = await buscarUsuario(db, req.body.id);
      let authId = alvo.auth_id;
      if (!authId) {
        const conta = await db.auth.admin.createUser({ email: loginParaEmail(alvo.login, env.AUTH_EMAIL_DOMAIN), password: req.body.senha, email_confirm: true });
        if (conta.error) throw new HttpError(400, traduzirAuth(conta.error.message));
        authId = conta.data.user.id;
        const vinculo = await db.from('users').update({ auth_id: authId }).eq('id', alvo.id);
        if (vinculo.error) throw new Error(vinculo.error.message);
      }
      const atualizacaoAuth = await db.auth.admin.updateUserById(authId, { password: req.body.senha });
      if (atualizacaoAuth.error) throw new HttpError(400, atualizacaoAuth.error.message);
      const { error } = await db.from('users').update({ pass_hash: null }).eq('id', alvo.id);
      if (error) throw new HttpError(400, error.message);
      return responder(res, 200, { ok: true });
    }

    if (acao === 'alterar_perfil') {
      if (!PERFIS.includes(req.body.perfil)) throw new HttpError(400, 'perfil inválido');
      const alvo = await buscarUsuario(db, req.body.id);
      if (alvo.role === 'adm' && req.body.perfil !== 'adm' && (await contarAdmins(db)) <= 1) {
        throw new HttpError(400, 'não é possível rebaixar o último administrador');
      }
      const { error } = await db.from('users').update({ role: req.body.perfil }).eq('id', alvo.id);
      if (error) throw new Error(error.message);
      return responder(res, 200, { ok: true });
    }

    throw new HttpError(400, 'ação desconhecida');
  });
}

export default criarHandler();
