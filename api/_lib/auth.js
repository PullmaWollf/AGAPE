// Sessões do próprio Ágape: não utilizam Supabase Auth nem JWT do Supabase.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError, tokenDaRequisicao } from './http.js';

// Sessões persistentes: até um ano sem uso; renovação em cada reabertura do app.
// Nunca armazenamos a senha em cookies, localStorage ou no PWA.
export const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;
const segredo = () => {
  const chave = process.env.AUTH_SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
  if (!chave) throw new Error('Configure AUTH_SESSION_SECRET ou SUPABASE_SERVICE_KEY no servidor');
  return chave;
};
const codificar = (valor) => Buffer.from(JSON.stringify(valor)).toString('base64url');
const assinatura = (valor) => createHmac('sha256', segredo()).update(valor).digest('base64url');

export function criarSessao(perfil) {
  const corpo = codificar({
    sub: perfil.id,
    v: Number(perfil.session_version || 0),
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
  return `${corpo}.${assinatura(corpo)}`;
}

function lerSessao(token) {
  try {
    const [corpo, sig, extra] = String(token || '').split('.');
    if (!corpo || !sig || extra || corpo.length > 2000) return null;
    const esperada = assinatura(corpo);
    if (sig.length !== esperada.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperada))) return null;
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return dados.sub && Number.isFinite(dados.exp) && dados.exp > Date.now() ? dados : null;
  } catch {
    return null;
  }
}

export async function usuarioAutenticado(db, req) {
  const sessao = lerSessao(tokenDaRequisicao(req));
  if (!sessao) throw new HttpError(401, 'sessão inválida ou expirada');
  const { data: perfil, error } = await db.from('users')
    .select('id,name,login,role,perfil_id,created_at,avatar_url,session_version')
    .eq('id', sessao.sub).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil || Number(perfil.session_version || 0) !== Number(sessao.v || 0)) {
    throw new HttpError(401, 'sessão inválida ou expirada');
  }
  return { perfil };
}

export async function carregarPermissoes(db, perfil) {
  const adm = ['adm','admin','administrador'].includes(String(perfil.role || '').toLowerCase());
  const basicas = adm ? Object.fromEntries([
    'gerencial','usuarios','perfis','mural_publicar','mural_excluir',
    'palavra','escala','escala_visualizar','modelos','notificacoes','uploads',
  ].map((chave) => [chave, true])) : {};
  if (!perfil.perfil_id) return basicas;
  const { data, error } = await db.from('perfis_permissao')
    .select('nome,permissoes').eq('id', perfil.perfil_id).maybeSingle();
  if (error) throw new Error(error.message);
  const nome = String(data?.nome || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const lider = ['lider','lider em treinamento'].includes(nome);
  // Chamada e frequência só podem aparecer para Líder/LT, inclusive quando o usuário é ADM.
  // A API valida novamente o perfil e as permissões antes de ler/gravar dados.
  return {
    ...(adm ? basicas : (data?.permissoes || {})),
    chamada_registrar: lider && data?.permissoes?.chamada_registrar === true,
    frequencia_relatorio: lider && data?.permissoes?.frequencia_relatorio === true,
  };
}

export async function exigirPermissao(db, req, permissao) {
  const u = await usuarioAutenticado(db, req);
  const permissoes = await carregarPermissoes(db, u.perfil);
  if (permissoes[permissao] !== true) throw new HttpError(403, 'você não tem permissão para isso');
  return { ...u, permissoes };
}

export async function exigirAdmin(db, req) {
  const usuario = await usuarioAutenticado(db, req);
  if (!['adm','admin','administrador'].includes(String(usuario.perfil.role).toLowerCase())) {
    throw new HttpError(403, 'somente o administrador pode gerenciar contas');
  }
  return { ...usuario, permissoes: await carregarPermissoes(db, usuario.perfil) };
}
