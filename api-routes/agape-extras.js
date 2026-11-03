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
  if(acao==='identidade_upload'){
    await exigirAdmin(db,req);
    const tipo=String(req.body?.tipo||'');
    if(!['logo','hero'].includes(tipo))throw new HttpError(400,'Tipo de imagem inválido');
    const data=String(req.body?.data||'');
    if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>1400000)
      throw new HttpError(400,'Use uma imagem PNG, JPG ou WebP de até 1 MB');
    const match=data.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
    const imagem=Buffer.from(match[2],'base64');
    if(imagem.length<50||imagem.length>1024*1024)throw new HttpError(400,'Tamanho de imagem inválido');
    const extensao=match[1]==='jpeg'?'jpg':match[1];
    const arquivo='branding/'+(tipo==='logo'?'app-icon':'hero')+'.'+extensao;
    const {error}=await db.storage.from('profile-avatars').upload(arquivo,imagem,{
      contentType:'image/'+match[1],upsert:true,cacheControl:'60'
    });
    if(error)throw new Error(error.message);
    const url=db.storage.from('profile-avatars').getPublicUrl(arquivo).data.publicUrl+'?v='+Date.now();
    return responder(res,200,{ok:true,url,tipo});
  }
  if(acao==='layout_salvar'){
    await exigirAdmin(db,req);
    const x=req.body?.layout;
    if(!x||typeof x!=='object'||Array.isArray(x))throw new HttpError(400,'Layout inválido');
    const txt=(v,n)=>String(v??'').trim().slice(0,n);
    const allowed=['prox-home','home-leadership-heading','lider-presenca-acesso','lider-presenca-explicacao','home-links-section','quick-grid'];
    const sections=Array.isArray(x.sections)?x.sections.filter(v=>allowed.includes(v)).filter((v,i,a)=>a.indexOf(v)===i):allowed;
    const hidden=Array.isArray(x.hidden)?x.hidden.filter(v=>allowed.includes(v)):[];
    const paletaLight=['rose','ocean','emerald','indigo','amber'].includes(x.paletaLight)?x.paletaLight:'rose';
    const paletaDark=['wine','midnight','forest','graphite','violet'].includes(x.paletaDark)?x.paletaDark:'wine';
    const validarUrl=(v,tipo)=>{
      const url=String(v||'').trim();
      if(!url)return '';
      const esperado=process.env.SUPABASE_URL||process.env.SUPA_URL||'https://pubrskqrsskiamzflpmj.supabase.co';
      const base=new URL(esperado);
      let u;try{u=new URL(url);}catch{throw new HttpError(400,'URL da imagem inválida');}
      if(u.protocol!=='https:'||u.origin!==base.origin||!u.pathname.startsWith('/storage/v1/object/public/profile-avatars/branding/'+(tipo==='logo'?'app-icon':'hero')+'.'))
        throw new HttpError(400,'Escolha uma imagem enviada pelo editor');
      return u.href;
    };
    const cor=/^#[0-9a-f]{6}$/i.test(String(x.heroCor||''))?x.heroCor:'#35202a';
    const layout={paletaLight,paletaDark,navNome:txt(x.navNome,70)||'Célula Ágape',logoUrl:validarUrl(x.logoUrl,'logo'),heroUrl:validarUrl(x.heroUrl,'hero'),heroCor:cor,heroDecoracoes:x.heroDecoracoes!==false,eyebrow:txt(x.eyebrow,90),titulo:txt(x.titulo,110),destaque:txt(x.destaque,90),descricao:txt(x.descricao,LIMITE),botao1:txt(x.botao1,55),botao2:txt(x.botao2,55),sections,hidden};
    const {error}=await db.from('config').upsert({chave:'home_layout_v1',valor:JSON.stringify(layout),atualizado_em:new Date().toISOString()},{onConflict:'chave'});
    if(error)throw new Error(error.message);
    return responder(res,200,{ok:true,layout});
  }
  throw new HttpError(400,'Ação inválida');
});
