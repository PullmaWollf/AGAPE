import { clienteAdmin } from './_lib/supabase.js';
import { exigirPermissao } from './_lib/auth.js';
import { responder, HttpError } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    const db = clienteAdmin();
    if (req.method === 'GET') {
      const result = await db.from('escala_funcoes').select('id,nome').order('nome');
      if (result.error) throw new Error(result.error.message);
      return responder(res, 200, { ok: true, funcoes: result.data || [] });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
    await exigirPermissao(db, req, 'escala');
    const { acao = 'salvar', id, nome } = req.body || {};
    if (acao === 'excluir') {
      if (!id) throw new HttpError(400, 'função inválida');
      const used = await db.from('escala_atribuicoes').select('id', { count: 'exact', head: true }).eq('funcao_id', id);
      if (used.count) throw new HttpError(409, 'não é possível excluir uma função já usada em uma escala');
      const result = await db.from('escala_funcoes').delete().eq('id', id);
      if (result.error) throw new Error(result.error.message);
      return responder(res, 200, { ok: true });
    }
    const valor = String(nome || '').trim();
    if (valor.length < 2 || valor.length > 80) throw new HttpError(400, 'informe uma função entre 2 e 80 caracteres');
    const result = id
      ? await db.from('escala_funcoes').update({ nome: valor }).eq('id', id).select('id,nome').single()
      : await db.from('escala_funcoes').insert({ nome: valor }).select('id,nome').single();
    if (result.error) throw new Error(result.error.message);
    return responder(res, 200, { ok: true, funcao: result.data });
  } catch (error) {
    return responder(res, error.status || 500, { ok: false, erro: error.message || 'não foi possível salvar a função' });
  }
}
