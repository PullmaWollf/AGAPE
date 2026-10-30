import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirLiderChamada, validarDataISO } from '../api/_lib/chamada-acesso.js';

export function criarHandler({ criarCliente = clienteAdmin } = {}) {
  return envolver(async (req,res) => {
    if (req.method!=='POST') throw new HttpError(405,'Método não permitido');
    const db=criarCliente();
    const { acao }=req.body||{};
    const tipo=String(req.body?.tipo||'celula').toLowerCase();
    if(!['celula','culto'].includes(tipo))throw new HttpError(400,'Tipo de reunião inválido');
    const { perfil }=await exigirLiderChamada(db,req,'chamada_registrar');
    if (acao==='config') {
      const r=await db.from('config').select('chave,valor').in('chave',['celula_dia_semana','celula_hora']);
      if(r.error)throw new Error(r.error.message);
      return responder(res,200,{ok:true,config:Object.fromEntries((r.data||[]).map(x=>[x.chave,x.valor]))});
    }
    if (acao==='abrir') {
      const data=validarDataISO(req.body.data);
      const [membros, config, chamada]=await Promise.all([
        db.from('users').select('id,name,avatar_url,ativo,created_at,data_ingresso_celula')
          .eq('ativo',true).order('name'),
        db.from('config').select('chave,valor').in('chave',['celula_dia_semana','celula_hora']),
        db.from('chamadas').select('id,data_celula,tipo,atualizado_em')
          .eq('data_celula',data).eq('tipo',tipo).maybeSingle(),
      ]);
      if(membros.error) throw new Error(membros.error.message);
      if(config.error) throw new Error(config.error.message);
      if(chamada.error) throw new Error(chamada.error.message);
      let presencas=[];
      if(chamada.data) {
        const r=await db.from('chamada_presencas').select('user_id,status')
          .eq('chamada_id',chamada.data.id);
        if(r.error)throw new Error(r.error.message);
        presencas=r.data||[];
      }
      return responder(res,200,{
        ok:true,data,tipo,chamada:chamada.data||null,
        membros:(membros.data||[]).filter(m=> (m.data_ingresso_celula || m.created_at?.slice(0,10) || '0000-01-01')<=data),
        presencas,config:Object.fromEntries((config.data||[]).map(x=>[x.chave,x.valor])),
      });
    }
    if (acao==='excluir') {
      const data=validarDataISO(req.body.data);
      const { data: chamada, error: consultaErro }=await db.from('chamadas')
        .select('id').eq('data_celula',data).eq('tipo',tipo).maybeSingle();
      if(consultaErro)throw new Error(consultaErro.message);
      if(!chamada)throw new HttpError(404,'Nenhuma chamada de '+(tipo==='culto'?'culto':'célula')+' salva nesta data');
      // ON DELETE CASCADE remove as presenças; relatório deixa de contar a reunião.
      const { error }=await db.from('chamadas').delete().eq('id',chamada.id);
      if(error)throw new HttpError(503,'Não foi possível excluir a chamada. Tente novamente.');
      return responder(res,200,{ok:true,excluida:true});
    }
    if (acao==='salvar' || acao==='atualizar') {
      const data=validarDataISO(req.body.data);
      const lista=req.body.presencas;
      if(!Array.isArray(lista)||!lista.length||lista.length>500) throw new HttpError(400,'Marque ao menos uma pessoa');
      const ids=new Set();
      for(const p of lista) {
        if(!/^[a-f0-9-]{36}$/i.test(String(p?.user_id||''))||
          !['presente','ausente'].includes(p?.status)||ids.has(p.user_id)){
          throw new HttpError(400,'Lista de presença inválida ou duplicada');
        }
        ids.add(p.user_id);
      }
      const { data: chamada_id, error }=await db.rpc(acao==='salvar'?'salvar_chamada':'atualizar_chamada',{
        p_data:data,p_tipo:tipo,p_registrado_por:perfil.id,p_presencas:lista.map(x=>({user_id:x.user_id,status:x.status})),
      });
      if(error) {
        if(error.code==='23505')throw new HttpError(409,'Já existe uma chamada deste tipo salva nesta data. Abra a chamada existente para corrigir ou excluir.');
        if(error.code==='P0002')throw new HttpError(404,'Chamada não encontrada para edição. Atualize a tela.');
        console.error('[chamada] falha ao salvar:',error.code,error.message);
        throw new HttpError(503,'Não foi possível salvar a chamada. Suas marcações continuam neste dispositivo.');
      }
      return responder(res,200,{ok:true,chamada_id,modo:acao});
    }
    throw new HttpError(400,'Ação desconhecida');
  });
}
export default criarHandler();