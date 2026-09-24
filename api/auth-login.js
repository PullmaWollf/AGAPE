import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { criarSessao } from './_lib/auth.js';
import { normalizarLogin } from './_lib/login.js';

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const login = normalizarLogin(req.body?.login);
  const senha = String(req.body?.senha ?? '');
  if (!login || !senha) throw new HttpError(400, 'login ou senha inválidos');

  const db = clienteAdmin();
  const { data: conta, error: authError } = await db.auth.signInWithPassword({
    email: `${login}@${process.env.AUTH_EMAIL_DOMAIN || 'celulaagape.app'}`,
    password: senha,
  });
  if (authError || !conta?.user) throw new HttpError(401, 'login ou senha inválidos');

  const { data: perfil, error } = await db.from('users')
    .select('id,name,login,role,auth_id,created_at')
    .eq('auth_id', conta.user.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil) throw new HttpError(403, 'usuário sem cadastro na célula');

  return responder(res, 200, {
    ok: true,
    token: criarSessao(perfil),
    // Entrega a sessão oficial do Supabase ao navegador. Assim RLS, Storage,
    // RPCs de push e operações de posts usam exatamente o mesmo auth.uid().
    supabase_session: {
      access_token: conta.session?.access_token,
      refresh_token: conta.session?.refresh_token,
    },
    usuario: { id: perfil.id, name: perfil.name, login: perfil.login, role: perfil.role, auth_id: perfil.auth_id, created_at: perfil.created_at },
  });
});

