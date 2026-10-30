// Configuração do padrão semanal da célula, validada no servidor.
// Nunca expõe a chave de serviço no navegador.
import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirPermissao } from '../api/_lib/auth.js';

const CHAVES = ['celula_dia_semana','celula_hora','hora_aviso_semana'];
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export default envolver(async (req,res)=>{
  if(req.method!=='POST') throw new HttpError(405,'método não permitido');
  const db=clienteAdmin();
  await exigirPermissao(db,req,'modelos');
  const {acao}=req.body||{};
  if(acao==='consultar'){
    const {data,error}=await db.from('config').select('chave,valor').in('chave',CHAVES);
    if(error)throw new Error(error.message);
    return responder(res,200,{ok:true,config:Object.fromEntries((data||[]).map(x=>[x.chave,x.valor]))});
  }
  if(acao==='salvar'){
    const dia=String(req.body.dia??'');
    const hora=String(req.body.hora??'');
    const aviso=String(req.body.horaAviso??'');
    if(!/^[0-6]$/.test(dia))throw new HttpError(400,'Escolha um dia válido da semana');
    if(!HORA.test(hora))throw new HttpError(400,'Informe um horário válido para a célula');
    if(!HORA.test(aviso))throw new HttpError(400,'Informe um horário válido para o aviso');
    const linhas=[
      {chave:'celula_dia_semana',valor:dia},
      {chave:'celula_hora',valor:hora},
      {chave:'hora_aviso_semana',valor:aviso},
    ];
    const {error}=await db.from('config').upsert(linhas,{onConflict:'chave'});
    if(error)throw new Error(error.message);
    return responder(res,200,{ok:true,config:Object.fromEntries(linhas.map(x=>[x.chave,x.valor]))});
  }
  throw new HttpError(400,'ação desconhecida');
});