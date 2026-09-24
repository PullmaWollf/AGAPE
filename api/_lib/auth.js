// Identifica quem está chamando a API a partir da sessão própria do Ágape.
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto';
import { HttpError, tokenDaRequisicao } from './http.js';

const segredo = () => process.env.AUTH_SESSION_SECRET || process.env.SUPABASE_SERVICE_KEY;
export function hashSenha(senha) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(senha, salt, 64).toString('hex')}`;
}
const codificar = (valor) => Buffer.from(JSON.stringify(valor)).toString('base64url');
const assinatura = (valor) => createHmac('sha256', segredo()).update(valor).digest('base64url');

export function criarSessao(perfil) {
  const corpo = codificar({ sub: perfil.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  return `${corpo}.${assinatura(corpo)}`;
}

function lerSessao(token) {
  const [corpo, sig] = String(token || '').split('.');
  if (!corpo || !sig) return null;
  const esperada = assinatura(corpo);
  if (sig.length !== esperada.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(esperada))) return null;
  const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
  return dados.exp > Date.now() ? dados : null;
}

export async function usuarioAutenticado(db, req) {
  const sessao = lerSessao(tokenDaRequisicao(req));
  if (!sessao) throw new HttpError(401, 'sessão inválida ou expirada');
  const { data: perfil, error } = await db
    .from('users').select('id, name, login, role, created_at, pass_hash').eq('id', sessao.sub).maybeSingle();
  if (error) throw new Error(error.message);
  if (!perfil) throw new HttpError(403, 'usuário sem cadastro na célula');
  return { perfil };
}

export async function exigirAdmin(db, req) {
  const u = await usuarioAutenticado(db, req);
  if (u.perfil.role !== 'adm') throw new HttpError(403, 'apenas administradores');
  return u;
}
