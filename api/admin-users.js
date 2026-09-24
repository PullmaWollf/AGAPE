// Gestão de usuários (só ADM). Usa a chave de serviço porque criar/excluir contas
// no Supabase Auth e trocar senhas não pode ser feito pelo navegador.
import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { exigirAdmin, hashSenha } from './_lib/auth.js';
import { loginParaEmail, normalizarLogin } from './_lib/login.js';

const PERFIS = ['adm', 'membro'];

function validarSenha(s) {
  if (typeof s !== 'string' || s.length < 6) throw new HttpError(400, 'a senha precisa ter pelo menos 6 caracteres');
  if (s.length > 72) throw new HttpError(400, 'a senha pode ter no máximo 72 caracteres');
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

    if (acao === 'criar') {
      const nome = String(req.body.nome ?? '').trim();
      const login = normalizarLogin(req.body.login);
      const perfil = req.body.perfil ?? 'membro';
      if (nome.length < 2 || nome.length > 80) throw new HttpError(400, 'informe o nome (2 a 80 caracteres)');
      if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw new HttpError(400, 'login: 3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado');
      if (!PERFIS.includes(perfil)) throw new HttpError(400, 'perfil inválido');
      validarSenha(req.body.senha);

      const { data: existente } = await db.from('users').select('id').ilike('login', login).maybeSingle();
      if (existente) throw new HttpError(409, 'já existe um usuário com esse login');

      const { data: conta, error: eAuth } = await db.auth.admin.createUser({
        email: loginParaEmail(login), password: req.body.senha, email_confirm: true, user_metadata: { nome },
      });
      if (eAuth) throw new HttpError(400, traduzirAuth(eAuth.message));

      const { data: novo, error: eIns } = await db.from('users')
        .insert({ name: nome, login, role: perfil, auth_id: conta.user.id })
        .select('id, name, login, role').single();
      if (eIns) {
        await db.auth.admin.deleteUser(conta.user.id);   // desfaz para não deixar conta órfã
        throw new Error(eIns.message);
      }
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
      validarSenha(req.body.senha);
      const alvo = await buscarUsuario(db, req.body.id);
      if (alvo.auth_id) {
        const { error } = await db.auth.admin.updateUserById(alvo.auth_id, { password: req.body.senha });
        if (error) throw new HttpError(400, traduzirAuth(error.message));
      } else {   // usuário ainda não migrado: cria a conta agora
        const { data: conta, error } = await db.auth.admin.createUser({
          email: loginParaEmail(alvo.login), password: req.body.senha, email_confirm: true,
        });
        if (error) throw new HttpError(400, traduzirAuth(error.message));
        await db.from('users').update({ auth_id: conta.user.id }).eq('id', alvo.id);
      }
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
