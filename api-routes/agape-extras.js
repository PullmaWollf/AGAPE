import { envolver, responder, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';
import { exigirAdmin, usuarioAutenticado } from '../api/_lib/auth.js';
import { exigirLiderChamada } from '../api/_lib/chamada-acesso.js';

const LIMITE = 240;
function telefoneValido(v) {
  const s = String(v ?? '').replace(/[^0-9]/g, '');
  if (!s) return null;
  const n = s.startsWith('55') ? s : '55' + s;
  if (!/^55[1-9][0-9]{9,10}$/.test(n)) throw new HttpError(400, 'Informe DDD e telefone válido (Brasil).');
  return n;
}
const isAdmin = u => ['adm','admin','administrador'].includes(String(u?.role||'').toLowerCase());
export default envolver(async (req,res)=>{
  if(req.method!=='POST')throw new HttpError(405,'Método não permitido');
  const db=clienteAdmin();
  const acao=String(req.body?.acao||'');
  if(acao==='layout_ler'){
    const {data,error}=await db.from('config').select('valor').eq('chave','home_layout_v1').maybeSingle();
    if(error)throw new Error(error.message);
    let layout={};try{layout=JSON.parse(data?.valor||'{}');}catch{}
    return responder(res,200,{ok:true,layout});
  }
  const {perfil:eu}=await usuarioAutenticado(db,req);
  if(acao==='telefone_meu_ler'){
    const {data,error}=await db.from('users').select('telefone').eq('id',eu.id).single();
    if(error)throw new Error(error.message);
    return responder(res,200,{ok:true,telefone:data?.telefone||''});
  }
  if(acao==='telefone_meu_salvar'){
    const telefone=telefoneValido(req.body?.telefone);
    const {error}=await db.from('users').update({telefone}).eq('id',eu.id);
    if(error)throw new Error(error.message);
    return responder(res,200,{ok:true,telefone:telefone||''});
  }
  if(acao==='contatos_listar'){
    if(!isAdmin(eu))await exigirLiderChamada(db,req,'frequencia_relatorio');
    const {data,error}=await db.from('users').select('id,name,telefone,ativo').order('name');
    if(error)throw new Error(error.message);
    return responder(res,200,{ok:true,contatos:data||[],podeEditar:isAdmin(eu)});
  }
  if(acao==='contato_salvar'){
    await exigirAdmin(db,req);
    const id=String(req.body?.id||'');
    if(!/^[a-f0-9-]{36}$/i.test(id))throw new HttpError(400,'Contato inválido');
    const telefone=telefoneValido(req.body?.telefone);
    const {data,error}=await db.from('users').update({telefone}).eq('id',id).select('id').maybeSingle();
    if(error)throw new Error(error.message);
    if(!data)throw new HttpError(404,'Usuário não encontrado');
    return responder(res,200,{ok:true});
  }
  if(acao==='layout_salvar'){
    await exigirAdmin(db,req);
    const x=req.body?.layout;
    if(!x||typeof x!=='object'||Array.isArray(x))throw new HttpError(400,'Layout inválido');
    const txt=(v,n)=>String(v??'').trim().slice(0,n);
    const allowed=['prox-home','home-leadership-heading','lider-presenca-acesso','lider-presenca-explicacao','home-links-section','quick-grid'];
    const sections=Array.isArray(x.sections)?x.sections.filter(v=>allowed.includes(v)).filter((v,i,a)=>a.indexOf(v)===i):allowed;
    const hidden=Array.isArray(x.hidden)?x.hidden.filter(v=>allowed.includes(v)):[];
    const layout={eyebrow:txt(x.eyebrow,90),titulo:txt(x.titulo,110),destaque:txt(x.destaque,90),descricao:txt(x.descricao,LIMITE),botao1:txt(x.botao1,55),botao2:txt(x.botao2,55),sections,hidden};
    const {error}=await db.from('config').upsert({chave:'home_layout_v1',valor:JSON.stringify(layout),atualizado_em:new Date().toISOString()},{onConflict:'chave'});
    if(error)throw new Error(error.message);
    return responder(res,200,{ok:true,layout});
  }
  throw new HttpError(400,'Ação inválida');
});
