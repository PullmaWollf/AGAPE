import { clienteAdmin } from './_lib/supabase.js';
import { exigirPermissao } from './_lib/auth.js';
import { responder, HttpError } from './_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'método não permitido');
    const db = clienteAdmin();
    const { permissoes, perfil } = await exigirPermissao(db, req, 'escala');
    const p = req.body?.dados || {};
    if (!p.date) throw new HttpError(400, 'informe a data da célula');
    const tipo = p.tipo === 'funcoes' ? 'funcoes' : 'lanche';
    const dados = { tipo, date: p.date, alarm_ts: p.alarm_local || null, alarm_1d: Boolean(p.alarm_1d), alarm_3h: Boolean(p.alarm_3h), alarm_30m: Boolean(p.alarm_30m), alarm_semana: Boolean(p.alarm_semana) };
    let semana;
    if (p.id) {
      const result = await db.from('escala_semanas').update(dados).eq('id', p.id).select().single();
      if (result.error) throw new Error(result.error.message);
      semana = result.data;
      const removed = await db.from('escala_atribuicoes').delete().eq('escala_id', p.id);
      if (removed.error) throw new Error(removed.error.message);
    } else {
      const result = await db.from('escala_semanas').insert(dados).select().single();
      if (result.error) throw new Error(result.error.message);
      semana = result.data;
    }
    const atribuicoes = Array.isArray(p.atribuicoes) ? p.atribuicoes : [];
    const unicas = new Set();
    for (const item of atribuicoes) {
      if (!item.user_id) continue;
      const { data: user, error: userError } = await db.from('users').select('id,name').eq('id', item.user_id).maybeSingle();
      if (userError) throw new Error(userError.message);
      if (!user) continue;
  const funcaoId = item.funcao_id || null;
  let funcaoNome = item.funcao_nome || null;
  if (funcaoId && !funcaoNome) {
    const funcao = await db.from('escala_funcoes').select('nome').eq('id', funcaoId).maybeSingle();
    if (funcao.error) throw new Error(funcao.error.message);
    funcaoNome = funcao.data?.nome || null;
  }
  const chave = `${user.id}|${funcaoId || 'lanche'}`;
      if (unicas.has(chave)) continue;
      unicas.add(chave);
      const row = { escala_id: semana.id, user_id: user.id, user_name: user.name, funcao_id: funcaoId, funcao_nome: funcaoNome || (tipo === 'funcoes' ? 'Função' : 'Lanche') };
      const inserted = await db.from('escala_atribuicoes').insert(row);
      if (inserted.error) throw new Error(inserted.error.message);
    }
    return responder(res, 200, { ok: true, semana, perfil: perfil.id, permissoes });
  } catch (error) { return responder(res, error.status || 500, { ok: false, erro: error.message || 'não foi possível salvar a escala' }); }
}
