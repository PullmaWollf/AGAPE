// Identifica quem está chamando a API a partir do token de sessão do Supabase Auth.
import { HttpError, tokenDaRequisicao } from './http.js';

export async function usuarioAutenticado(db, req) {
  const token = tokenDaRequisicao(req);
  if (!token) throw new HttpError(401, 'faça login');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'sessão inválida ou expirada');
  const { data: perfil, error: e2 } = await db
    .from('users').select('id, name, login, role, auth_id').eq('auth_id', data.user.id).maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!perfil) throw new HttpError(403, 'usuário sem cadastro na célula');
  return { authId: data.user.id, perfil };
}

export async function exigirAdmin(db, req) {
  const u = await usuarioAutenticado(db, req);
  if (u.perfil.role !== 'adm') throw new HttpError(403, 'apenas administradores');
  return u;
}
