import { HttpError } from './http.js';
import { usuarioAutenticado } from './auth.js';

export const permissoesChamada = [
  ['chamada_registrar', 'Realizar chamadas de presença'],
  ['frequencia_relatorio', 'Visualizar relatórios de frequência'],
];
function normalizar(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
export async function exigirLiderChamada(db, req, chave) {
  const { perfil } = await usuarioAutenticado(db, req);
  const { data, error } = await db.from('perfis_permissao')
    .select('nome,permissoes').eq('id', perfil.perfil_id).maybeSingle();
  if (error) throw new Error(error.message);
  // Proteger em DUAS camadas: perfil fixo elegível E permissão no painel.
  // Não basta ser ADM ou receber a chave em outro perfil.
  if (!['lider', 'lider em treinamento'].includes(normalizar(data?.nome))) {
    throw new HttpError(403, 'Acesso exclusivo a Líder e Líder em Treinamento');
  }
  // A permissão deve estar habilitada no perfil da liderança.
  if (data?.permissoes?.[chave] !== true) {
    throw new HttpError(403, 'Permissão de chamada não concedida');
  }
  return { perfil, nomePerfil: data.nome };
}

export function validarDataISO(v) {
  const str = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new HttpError(400,'Data inválida');
  const dt = new Date(str+'T12:00:00Z');
  if (!Number.isFinite(dt.getTime()) || dt.toISOString().slice(0,10)!==str) throw new HttpError(400,'Data inválida');
  return str;
}
export function validarPeriodo(inicio, fim) {
  const a=validarDataISO(inicio),b=validarDataISO(fim);
  const dias=(Date.parse(b)-Date.parse(a))/86400000;
  if (dias < 0 || dias > 366*5) throw new HttpError(400,'Período inválido (máximo de 5 anos)');
  return [a,b];
}