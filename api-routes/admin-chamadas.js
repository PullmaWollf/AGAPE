/* Gestão administrativa de chamadas: lista paginada e cancelamento seguro.
 * Exclusivo de administrador vinculado a Líder/Líder em Treinamento.
 * Não altera o fluxo MATCH nem os relatórios existentes.
 */
import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirAdmin } from '../api/_lib/auth.js';
import { exigirLiderChamada, validarDataISO } from '../api/_lib/chamada-acesso.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const POR_PAGINA = 20;
const TAMANHO_LOTE = 1000;

export function criarHandler({ criarCliente = clienteAdmin } = {}) {
  return envolver(async (req, res) => {
    if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido');
    const db = criarCliente();
    // ADM sozinho NÃO autoriza acessar dados de presença. Exige também perfil Líder/LT.
    await exigirAdmin(db, req);
    await exigirLiderChamada(db, req, 'chamada_registrar');

    const { acao } = req.body || {};
    const tipo = String(req.body?.tipo || 'todas').toLowerCase();
    if (!['todas','celula','culto'].includes(tipo)) throw new HttpError(400,'Tipo de reunião inválido');
    if (acao === 'listar') {
      const pagina = Number(req.body.pagina ?? 1);
      if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000) {
        throw new HttpError(400, 'Página inválida');
      }
      const inicio = (pagina - 1) * POR_PAGINA;
      const consulta = db.from('chamadas')
        .select('id,data_celula,tipo,registrado_por,criado_em,atualizado_em', { count: 'exact' });
      const r = await (tipo === 'todas' ? consulta : consulta.eq('tipo',tipo))
        .order('data_celula', { ascending: false }).order('tipo', { ascending: true })
        .range(inicio, inicio + POR_PAGINA - 1);
      if (r.error) throw new Error(r.error.message);
      const chamadas = r.data || [];
      if (!chamadas.length) {
        return responder(res, 200, { ok: true, chamadas: [], total: r.count || 0, pagina, por_pagina: POR_PAGINA });
      }

      const ids = chamadas.map(c => c.id);
      const totais = new Map(ids.map(id => [id, { presentes: 0, ausentes: 0 }]));
      // Paginar as marcações para não perder resultados se houver mais de 1000 participantes.
      let fim = false;
      for (let offset = 0; offset < 100000; offset += TAMANHO_LOTE) {
        const p = await db.from('chamada_presencas')
          .select('id,chamada_id,status')
          .in('chamada_id', ids)
          .order('chamada_id').order('id')
          .range(offset, offset + TAMANHO_LOTE - 1);
        if (p.error) throw new Error(p.error.message);
        for (const marcacao of p.data || []) {
          const t = totais.get(marcacao.chamada_id);
          if (!t) continue;
          if (marcacao.status === 'presente') t.presentes++;
          if (marcacao.status === 'ausente') t.ausentes++;
        }
        if ((p.data || []).length < TAMANHO_LOTE) { fim = true; break; }
      }
      if (!fim) throw new HttpError(503, 'Muitas marcações para exibir. Tente novamente.');

      const autoresIds = [...new Set(chamadas.map(c => c.registrado_por).filter(Boolean))];
      let autores = new Map();
      if (autoresIds.length) {
        const u = await db.from('users').select('id,name').in('id', autoresIds);
        if (u.error) throw new Error(u.error.message);
        autores = new Map((u.data || []).map(p => [p.id, p.name]));
      }
      return responder(res, 200, {
        ok: true, total: r.count || 0, pagina, por_pagina: POR_PAGINA,
        chamadas: chamadas.map(c => ({
          id: c.id,
          data_celula: c.data_celula,
          tipo: c.tipo,
          criado_em: c.criado_em,
          atualizado_em: c.atualizado_em,
          registrado_por_nome: autores.get(c.registrado_por) || null,
          presentes: totais.get(c.id).presentes,
          ausentes: totais.get(c.id).ausentes,
        })),
      });
    }

    if (acao === 'cancelar') {
      const id = String(req.body.id || '');
      if (!UUID.test(id)) throw new HttpError(400, 'Identificador da chamada inválido');
      const data = validarDataISO(req.body.data);
      if (tipo === 'todas') throw new HttpError(400,'Informe o tipo da reunião');
      // Exige ID e data juntos: uma tela desatualizada não exclui outra chamada.
      const r = await db.from('chamadas').delete()
        .eq('id', id).eq('data_celula', data).eq('tipo',tipo)
        .select('id').maybeSingle();
      if (r.error) throw new HttpError(503, 'Não foi possível cancelar a chamada. Tente novamente.');
      if (!r.data) throw new HttpError(404, 'Chamada não encontrada ou já cancelada. Atualize a lista.');
      // A FK ON DELETE CASCADE remove as marcações e os relatórios deixam de contar essa reunião.
      return responder(res, 200, { ok: true, cancelada: true, data });
    }
    throw new HttpError(400, 'Ação desconhecida');
  });
}
export default criarHandler();
