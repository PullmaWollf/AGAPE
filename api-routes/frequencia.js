import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirLiderChamada, validarPeriodo } from '../api/_lib/chamada-acesso.js';

export function criarHandler({ criarCliente = clienteAdmin } = {}) {
  return envolver(async (req,res)=>{
    if(req.method!=='POST')throw new HttpError(405,'Método não permitido');
    const db=criarCliente();
    await exigirLiderChamada(db,req,'frequencia_relatorio');
    const [inicio,fim]=validarPeriodo(req.body?.inicio,req.body?.fim);
    const [users, calls]=await Promise.all([
      db.from('users').select('id,name,created_at,data_ingresso_celula,ativo').eq('ativo',true).order('name'),
      db.from('chamadas').select('id,data_celula,atualizado_em')
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
    return responder(res,200,{ok:true,inicio,fim,
      membros:users.data||[],chamadas,presencas:chunks});
  });
}
export default criarHandler();