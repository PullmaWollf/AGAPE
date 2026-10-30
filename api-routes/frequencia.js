import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirLiderChamada, validarPeriodo } from '../api/_lib/chamada-acesso.js';

export function criarHandler({ criarCliente = clienteAdmin } = {}) {
  return envolver(async (req,res)=>{
    if(req.method!=='POST')throw new HttpError(405,'Método não permitido');
    const db=criarCliente();
    await exigirLiderChamada(db,req,'frequencia_relatorio');
    const tipo=String(req.body?.tipo||'todas').toLowerCase();
    if(!['todas','celula','culto'].includes(tipo))throw new HttpError(400,'Tipo de reunião inválido');
    const filtrarTipo=q=>tipo==='todas'?q:q.eq('tipo',tipo);
    if(req.body?.acao==='periodo'){
      const [primeira,ultima]=await Promise.all([
        filtrarTipo(db.from('chamadas').select('data_celula')).order('data_celula',{ascending:true}).limit(1).maybeSingle(),
        filtrarTipo(db.from('chamadas').select('data_celula')).order('data_celula',{ascending:false}).limit(1).maybeSingle(),
      ]);
      if(primeira.error)throw new Error(primeira.error.message);
      if(ultima.error)throw new Error(ultima.error.message);
      return responder(res,200,{ok:true,
        primeira:primeira.data?.data_celula||null,
        ultima:ultima.data?.data_celula||null});
    }
    const [inicio,fim]=validarPeriodo(req.body?.inicio,req.body?.fim);
    const [users, calls]=await Promise.all([
      db.from('users').select('id,name,created_at,data_ingresso_celula,ativo').eq('ativo',true).order('name'),
      filtrarTipo(db.from('chamadas').select('id,data_celula,tipo,atualizado_em'))
        .gte('data_celula',inicio).lte('data_celula',fim).order('data_celula'),
    ]);
    if(users.error)throw new Error(users.error.message);
    if(calls.error)throw new Error(calls.error.message);
    const chamadas=calls.data||[];
    const chunks=[];
    for(let i=0;i<chamadas.length;i+=100) {
      const ids=chamadas.slice(i,i+100).map(c=>c.id);
      const r=await db.from('chamada_presencas').select('chamada_id,user_id,status')
        .in('chamada_id',ids).limit(50000);
      if(r.error)throw new Error(r.error.message);
      chunks.push(...(r.data||[]));
    }
    return responder(res,200,{ok:true,inicio,fim,tipo,
      membros:users.data||[],chamadas,presencas:chunks});
  });
}
export default criarHandler();