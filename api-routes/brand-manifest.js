import { envolver, HttpError } from '../api/_lib/http.js';
import { clienteAdmin } from '../api/_lib/supabase.js';

export default envolver(async (req,res)=>{
  if(req.method!=='GET')throw new HttpError(405,'Método não permitido');
  const {data,error}=await clienteAdmin().from('config').select('valor').eq('chave','home_layout_v1').maybeSingle();
  if(error)throw new Error(error.message);
  let layout={};try{layout=JSON.parse(data?.valor||'{}');}catch{}
  const nome=String(layout.navNome||'Célula Ágape').slice(0,70);
  const logo=String(layout.logoUrl||'');
  const valido=logo.startsWith('https://pubrskqrsskiamzflpmj.supabase.co/storage/v1/object/public/profile-avatars/branding/app-icon.');
  const icons=valido?[192,512].map(n=>({src:logo,sizes:n+'x'+n,type:'image/png',purpose:'any'})):[
    {src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'}
  ];
  res.setHeader('Content-Type','application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.status(200).send(JSON.stringify({
    id:'/',start_url:'/',scope:'/',name:nome,short_name:nome.slice(0,24),
    description:'Comunidade da Célula Ágape',display:'standalone',
    background_color:'#fff6f4',theme_color:'#8d2946',lang:'pt-BR',
    categories:['lifestyle','social'],icons
  }));
});
