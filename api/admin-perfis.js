import { envolver, responder, HttpError } from './_lib/http.js';
import { clienteAdmin } from './_lib/supabase.js';
import { exigirPermissao } from './_lib/auth.js';

const PERMISSOES = [
  ['gerencial', 'Abrir o menu Gerencial'], ['usuarios', 'Gerenciar usuários'], ['perfis', 'Gerenciar perfis'],
  ['mural_publicar', 'Publicar no mural'], ['mural_excluir', 'Excluir publicações'], ['palavra', 'Gerenciar Palavra'],
  ['escala', 'Gerenciar escala'], ['escala_visualizar', 'Visualizar escala'], ['modelos', 'Gerenciar modelos'],
  ['notificacoes', 'Gerenciar notificações'], ['uploads', 'Enviar imagens e vídeos'],
];

function limparPermissoes(valor) {
  const origem = valor && typeof valor === 'object' ? valor : {};
  return Object.fromEntries(PERMISSOES.map(([chave]) => [chave, origem[chave] === true]));
}

export const permissoesDisponiveis = PERMISSOES;

export default envolver(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
  const db = clienteAdmin(process.env);
  await exigirPermissao(db, req, 'perfis');
  const { acao, id } = req.body || {};
  if (acao === 'listar') {
    const [perfis, usuarios] = await Promise.all([
      db.from('perfis_permissao').select('id,nome,descricao,permissoes,created_at,updated_at').order('nome'),
      db.from('users').select('id,name,login,role,perfil_id').order('name'),
    ]);
    if (perfis.error) throw new Error(perfis.error.message);
    if (usuarios.error) throw new Error(usuarios.error.message);
    return responder(res, 200, { ok: true, perfis: perfis.data || [], usuarios: usuarios.data || [], permissoes: PERMISSOES });
  }
  if (acao === 'salvar') {
    const nome = String(req.body.nome || '').trim();
    if (nome.length < 2 || nome.length > 50) throw new HttpError(400, 'O nome precisa ter entre 2 e 50 caracteres.');
    const payload = { nome, descricao: String(req.body.descricao || '').trim().slice(0, 200), permissoes: limparPermissoes(req.body.permissoes), updated_at: new Date().toISOString() };
    const query = id ? db.from('perfis_permissao').update(payload).eq('id', id) : db.from('perfis_permissao').insert(payload);
    const result = await query.select().single();
    if (result.error) throw new HttpError(400, result.error.message);
    return responder(res, 200, { ok: true, perfil: result.data });
  }
  if (acao === 'excluir') {
    if (!id) throw new HttpError(400, 'Perfil inválido.');
    const { count } = await db.from('users').select('id', { count: 'exact', head: true }).eq('perfil_id', id);
    if (count) throw new HttpError(409, 'Desvincule os usuários antes de excluir este perfil.');
    const result = await db.from('perfis_permissao').delete().eq('id', id);
    if (result.error) throw new Error(result.error.message);
    return responder(res, 200, { ok: true });
  }
  if (acao === 'vincular') {
    if (!req.body.userId) throw new HttpError(400, 'Usuário inválido.');
    const perfilId = id || null;
    if (perfilId) {
      const { data: perfil, error: perfilError } = await db.from('perfis_permissao').select('id').eq('id', perfilId).maybeSingle();
      if (perfilError) throw new Error(perfilError.message);
      if (!perfil) throw new HttpError(400, 'Perfil inválido.');
    }
    const result = await db.from('users').update({ perfil_id: perfilId }).eq('id', req.body.userId);
    if (result.error) throw new Error(result.error.message);
    return responder(res, 200, { ok: true });
  }
  throw new HttpError(400, 'ação desconhecida');
});
