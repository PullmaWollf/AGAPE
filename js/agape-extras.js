/* Ágape — editor da home e contatos. Sem alterar permissões ou HTML arbitrário. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const adm=()=>['adm','admin','administrador'].includes(String(window.S?.me?.role||'').toLowerCase());
const lider=()=>!!window.S?.me?.permissoes?.frequencia_relatorio;
const api=(acao,data={})=>window.chamarApi('/api/agape-extras',{acao,...data});
let layout={},contatos=[],contatosProntos=false;
const ids=['prox-home','home-leadership-heading','lider-presenca-acesso','lider-presenca-explicacao','home-links-section','quick-grid'];
const nomes={'prox-home':'Próxima escala','home-leadership-heading':'Título da gestão','lider-presenca-acesso':'Ações de presença','lider-presenca-explicacao':'Explicação da chamada','home-links-section':'Título Seu espaço','quick-grid':'Atalhos da comunidade'};
const paletas={
  light:[
    {id:'rose',nome:'Rosé clássico',cores:['#842e49','#f9f6f3','#fffefd']},
    {id:'ocean',nome:'Azul oceano',cores:['#1463a3','#f4f8fc','#ffffff']},
    {id:'emerald',nome:'Verde esmeralda',cores:['#14785b','#f5f9f5','#ffffff']},
    {id:'indigo',nome:'Índigo moderno',cores:['#5146a5','#f8f7fc','#ffffff']},
    {id:'amber',nome:'Âmbar elegante',cores:['#985b15','#fbf8f1','#fffefa']}
  ],
  dark:[
    {id:'wine',nome:'Vinho Ágape',cores:['#e6a0b5','#1c191c','#272126']},
    {id:'midnight',nome:'Azul meia-noite',cores:['#83bdf2','#101b29','#1b2938']},
    {id:'forest',nome:'Floresta',cores:['#88d9b2','#13231c','#1d3027']},
    {id:'graphite',nome:'Grafite',cores:['#c2d0dd','#1b1f24','#292e34']},
    {id:'violet',nome:'Violeta',cores:['#c6a5ff','#1c1627','#2c2239']}
  ]
};
function paletaAplicar(){
  const modo=document.documentElement.dataset.theme==='dark'?'dark':'light';
  const chave=modo==='dark'?'paletaDark':'paletaLight';
  const selecionada=layout[chave]||(modo==='dark'?'wine':'rose');
  const item=paletas[modo].find(p=>p.id===selecionada)||paletas[modo][0];
  document.documentElement.dataset.palette=item.id;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',item.cores[1]);
}
document.addEventListener('agape:theme-change',paletaAplicar);
const padrao={navNome:'Célula Ágape',logoUrl:'',heroUrl:'',heroCor:'#35202a',heroDecoracoes:true,paletaLight:'rose',paletaDark:'wine',eyebrow:'by / VIDEIRA GARAVELO',titulo:'Um lugar para',destaque:'pertencer.',descricao:'Célula Ágape — encontros, comunhão e uma fé vivida juntos.',botao1:'Explorar o mural',botao2:'Onde nos encontrar',sections:ids,hidden:[]};
function dom(){
  const hero=$('page-home')?.querySelector('.hero-content');
  if(hero){
    const h=hero.querySelector('h1');
    if(h){h.innerHTML='<span id="agape-hero-titulo"></span><br><em id="agape-hero-destaque"></em>';}
    const ey=hero.querySelector('.hero-eyebrow');if(ey)ey.id='agape-hero-eyebrow';
    const desc=hero.querySelector('p');if(desc)desc.id='agape-hero-descricao';
    const b=hero.querySelectorAll('.hero-btns button');if(b[0])b[0].id='agape-hero-botao1';if(b[1])b[1].id='agape-hero-botao2';
  }
  const quick=$('page-home')?.querySelector('.quick-grid');
  if(quick){quick.id='quick-grid';const h=quick.previousElementSibling;if(h)h.id='home-links-section';}
  if(quick&&!$('agape-home-contatos')){
    const card=document.createElement('div');card.className='quick-card';card.id='agape-home-contatos';card.onclick=()=>window.goPage('contatos');
    card.innerHTML='<div class="qc-icon"><svg class="ag-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></div><div class="qc-title">Contatos</div><div class="qc-sub">Agenda e WhatsApp</div>';
    quick.appendChild(card);
  }
  const admTabs=$('page-adm')?.querySelector('.adm-tabs');
  if(admTabs&&!$('agape-layout-tab')){
    const b=document.createElement('button');b.className='adm-tab';b.id='agape-layout-tab';b.textContent='Personalizar início';
    b.onclick=()=>{window.admTab('personalizar',b);editor();};admTabs.append(b);
    const panel=document.createElement('div');panel.className='adm-panel';panel.id='adm-personalizar';
    panel.innerHTML='<div class="form-card"><h3>Personalizar página inicial</h3><p class="hint">Altere textos, ordem e visibilidade dos blocos. As mudanças são salvas para todos os usuários. Permissões continuam protegidas.</p><div id="agape-editor"></div></div>';
    $('page-adm').querySelector('.container').append(panel);
  }
  const nav=$('desktop-links');if(nav&&!$('agape-nav-contatos')){
    const b=document.createElement('button');b.id='agape-nav-contatos';b.textContent='Contatos';b.onclick=()=>window.goPage('contatos');nav.insertBefore(b,nav.querySelector('#dl-adm'));
  }
  if(!$('page-contatos')){
    const page=document.createElement('div');page.className='page';page.id='page-contatos';
    page.innerHTML='<div class="container agape-contatos"><div class="sec-hdr"><h2>Contatos</h2><p>Agenda da célula e acesso rápido ao WhatsApp</p></div><div class="form-card"><label for="agape-contatos-busca">Buscar pessoa</label><input id="agape-contatos-busca" placeholder="Digite um nome" oninput="agapeExtras.renderContatos()"><p class="hint">Telefones visíveis apenas à administração e liderança autorizada. As mensagens abrem no WhatsApp para conferência antes do envio.</p><div id="agape-contatos-lista"></div></div></div>';
    $('page-adm').before(page);
  }
  const sheet=$('conta-sheet')?.querySelector('.sheet');
  if(sheet&&!$('agape-conta-telefone')){
    const card=document.createElement('div');card.className='form-card';card.innerHTML='<h3>Meu telefone / WhatsApp</h3><p class="hint">Informe seu número com DDD. Ele ficará disponível na agenda da liderança.</p><div class="fld"><label for="agape-conta-telefone">Telefone</label><input id="agape-conta-telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(62) 99999-9999" maxlength="20"></div><button type="button" class="btn btn-primary btn-full" onclick="agapeExtras.salvarMeuTelefone()">Salvar telefone</button>';
    sheet.insertBefore(card,sheet.querySelector('.form-card'));
  }
  const tabs=$('page-adm')?.querySelector('.adm-tabs');
  if(tabs&&!$('agape-adm-contatos')){
    const b=document.createElement('button');b.className='adm-tab';b.id='agape-adm-contatos';b.textContent='Contatos';b.onclick=()=>{window.admTab('contatos',b);abrirContatos();};tabs.append(b);
    const panel=document.createElement('div');panel.className='adm-panel';panel.id='adm-contatos';panel.innerHTML='<div class="form-card"><h3>Agenda de contatos</h3><p class="hint">Atualize os telefones cadastrados e abra conversas pelo WhatsApp.</p><button type="button" class="btn btn-ghost" onclick="agapeExtras.abrirContatos()">Atualizar contatos</button><div id="agape-adm-contatos-lista"></div></div>';
    $('page-adm').querySelector('.container').append(panel);
  }
}
function aplicar(){
  const x={...padrao,...layout};
  paletaAplicar();
  const nav=$('page-home')?.ownerDocument.querySelector('.nav-logo');
  const nome=nav?.querySelector('.nav-logo-text');
  if(nome){
    const palavras=String(x.navNome||padrao.navNome).trim().split(/\s+/);
    nome.replaceChildren();
    if(palavras.length>1){
      nome.append(document.createTextNode(palavras.slice(0,-1).join(' ')+' '));
      const destaque=document.createElement('em');destaque.textContent=palavras.at(-1);nome.append(destaque);
    }else nome.textContent=palavras[0]||padrao.navNome;
  }
  const logo=nav?.querySelector('img');
  if(logo){
    if(!logo.dataset.agapePadrao)logo.dataset.agapePadrao=logo.src;
    logo.src=x.logoUrl||logo.dataset.agapePadrao;
    logo.alt='Logo '+(x.navNome||padrao.navNome);
  }
  document.title=x.navNome||padrao.navNome;
  const favicon=document.querySelector('link[rel="icon"]');
  if(favicon){
    if(!favicon.dataset.agapePadrao)favicon.dataset.agapePadrao=favicon.href;
    favicon.href=x.logoUrl||favicon.dataset.agapePadrao;
    favicon.type=x.logoUrl?'image/png':'image/x-icon';
  }
  const hero=$('page-home')?.querySelector('.hero');
  if(hero){
    hero.style.setProperty('--agape-hero-bg',x.heroCor||padrao.heroCor);
    hero.style.setProperty('--agape-hero-image',x.heroUrl?'linear-gradient(rgba(15,10,14,.40),rgba(15,10,14,.40)),url("'+x.heroUrl+'")':'none');
    hero.classList.toggle('agape-sem-decoracao',x.heroDecoracoes===false);
  }
  for(const [k,id] of Object.entries({eyebrow:'agape-hero-eyebrow',titulo:'agape-hero-titulo',destaque:'agape-hero-destaque',descricao:'agape-hero-descricao'}))if($(id))$(id).textContent=x[k]||padrao[k];
  for(const [k,id] of [['botao1','agape-hero-botao1'],['botao2','agape-hero-botao2']]){
    const b=$(id);if(!b)continue;
    b.textContent=x[k]||padrao[k];
  }
  const grid=$('quick-grid');const parent=grid?.parentElement;
  if(parent){
    const order=Array.isArray(x.sections)?x.sections:ids;
    for(const id of [...order,...ids]){const el=$(id);if(el&&el.parentElement===parent)parent.appendChild(el);}
    for(const id of ids){const el=$(id);if(el)el.classList.toggle('agape-layout-hidden',(x.hidden||[]).includes(id));}
  }
}
function editor(){
  const el=$('agape-editor');if(!el)return;
  const x={...padrao,...layout};
  el.innerHTML=['navNome','eyebrow','titulo','destaque','descricao','botao1','botao2'].map(k=>'<div class="fld"><label>'+esc({navNome:'Nome exibido na barra de navegação',eyebrow:'Texto superior',titulo:'Título',destaque:'Palavra em destaque',descricao:'Descrição',botao1:'Botão Mural',botao2:'Botão Localização'}[k])+'</label><input data-layout="'+k+'" maxlength="'+(k==='descricao'?240:110)+'" value="'+esc(x[k]||'')+'"></div>').join('')+
  '<h3>Identidade visual</h3><div class="agape-identidade-grid"><div class="agape-identidade-grupo"><h4>Logo da navbar e ícone do app</h4><p class="hint">Envie uma imagem quadrada. Ela será usada na navbar, no favicon e nas próximas instalações do PWA.</p><div id="agape-logo-preview" class="agape-identidade-preview"></div><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Enviar novo logo" onchange="agapeExtras.enviarImagem(this,\'logo\')"><button type="button" class="btn btn-ghost" onclick="agapeExtras.removerImagem(\'logo\')">Usar imagem padrão</button></div><div class="agape-identidade-grupo"><h4>Fundo do header</h4><p class="hint">Cor sólida ou imagem opcional. O texto continuará editável abaixo.</p><div id="agape-hero-preview" class="agape-identidade-preview"></div><input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Enviar imagem de fundo do header" onchange="agapeExtras.enviarImagem(this,\'hero\')"><button type="button" class="btn btn-ghost" onclick="agapeExtras.removerImagem(\'hero\')">Remover imagem de fundo</button></div></div><div class="fld"><label for="agape-hero-cor">Cor do fundo do header</label><input type="color" id="agape-hero-cor" value="'+esc(x.heroCor||padrao.heroCor)+'"></div><label class="agape-toggle"><input type="checkbox" id="agape-hero-decoracoes" '+(x.heroDecoracoes!==false?'checked':'')+'> Mostrar detalhes decorativos no header</label>'+ 
  '<h3>Paleta de cores</h3><p class="agape-paleta-dica">Escolha uma combinação para cada modo. O botão de tema continuará alternando entre claro e escuro para todos os usuários.</p>'+
  ['light','dark'].map(modo=>'<div class="agape-paleta-grupo"><h4>'+(modo==='light'?'Modo claro':'Modo escuro')+'</h4><div class="agape-paleta-grid">'+paletas[modo].map(p=>'<label class="agape-paleta-opcao"><input type="radio" name="agape-paleta-'+modo+'" value="'+p.id+'" '+((modo==='light'?x.paletaLight:x.paletaDark)===p.id?'checked':'')+'><span class="agape-paleta-amostra" aria-hidden="true">'+p.cores.map(c=>'<i style="background:'+c+'"></i>').join('')+'</span><span>'+esc(p.nome)+'</span></label>').join('')+'</div></div>').join('')+
  '<h3>Blocos da página</h3><p class="hint">Use as setas para reorganizar. Desmarque para ocultar.</p><div id="agape-layout-blocos"></div><button type="button" class="btn btn-primary btn-full" onclick="agapeExtras.salvarLayout()">Publicar alterações</button><button type="button" class="btn btn-ghost btn-full" onclick="agapeExtras.restaurarLayout()">Restaurar padrão</button>';
  atualizarPrevias();
  const lista=$('agape-layout-blocos');const order=[...new Set([...(x.sections||ids),...ids])];
  lista.innerHTML=order.map((id,i)=>'<div class="agape-layout-row" data-section="'+id+'"><label><input type="checkbox" '+(!(x.hidden||[]).includes(id)?'checked':'')+'> '+esc(nomes[id])+'</label><span><button type="button" class="btn btn-ghost" onclick="agapeExtras.mover(this,-1)" aria-label="Mover para cima">↑</button><button type="button" class="btn btn-ghost" onclick="agapeExtras.mover(this,1)" aria-label="Mover para baixo">↓</button></span></div>').join('');
}
function atualizarPrevias(){
  const logo=$('agape-logo-preview'),hero=$('agape-hero-preview');
  if(logo){logo.replaceChildren();const img=document.createElement('img');img.src=layout.logoUrl||document.querySelector('.nav-logo img')?.dataset.agapePadrao||'/icons/icon-192.png';img.alt='Prévia da identidade';logo.append(img);}
  if(hero){hero.replaceChildren();if(layout.heroUrl){const img=document.createElement('img');img.src=layout.heroUrl;img.alt='Prévia do fundo';hero.append(img);}else hero.textContent='Sem imagem — será usada a cor selecionada';}
}
async function enviarImagem(input,tipo){
  if(!adm()||!input.files?.[0])return;
  const arquivo=input.files[0];
  if(!['image/png','image/jpeg','image/webp'].includes(arquivo.type)||arquivo.size>8*1024*1024){window.toast('Escolha PNG, JPG ou WebP de até 8 MB.','err');input.value='';return;}
  try{
    const imagem=await createImageBitmap(arquivo);
    const tamanho=tipo==='logo'?512:1200;
    const escala=Math.min(1,tamanho/Math.max(imagem.width,imagem.height));
    const canvas=document.createElement('canvas');
    canvas.width=tipo==='logo'?512:Math.max(1,Math.round(imagem.width*escala));
    canvas.height=tipo==='logo'?512:Math.max(1,Math.round(imagem.height*escala));
    const ctx=canvas.getContext('2d');
    if(tipo==='logo'){
      const lado=Math.min(imagem.width,imagem.height);
      ctx.drawImage(imagem,(imagem.width-lado)/2,(imagem.height-lado)/2,lado,lado,0,0,512,512);
    }else ctx.drawImage(imagem,0,0,canvas.width,canvas.height);
    imagem.close?.();
    const data=canvas.toDataURL('image/png');
    if(data.length>1400000)throw new Error('Imagem muito detalhada. Use uma imagem menor.');
    const resposta=await api('identidade_upload',{tipo,data});
    layout[tipo==='logo'?'logoUrl':'heroUrl']=resposta.url;
    atualizarPrevias();
    window.toast('Imagem enviada. Clique em Publicar alterações para aplicá-la.');
  }catch(e){window.toast(e.message||'Erro no envio','err');}
  finally{input.value='';}
}
function removerImagem(tipo){
  if(!adm())return;
  layout[tipo==='logo'?'logoUrl':'heroUrl']='';
  atualizarPrevias();
  window.toast('Clique em Publicar alterações para confirmar a remoção.');
}
function mover(btn,delta){const row=btn.closest('[data-section]'),box=row.parentElement;if(delta<0&&row.previousElementSibling)box.insertBefore(row,row.previousElementSibling);if(delta>0&&row.nextElementSibling)box.insertBefore(row.nextElementSibling,row);}
async function salvarLayout(){
  if(!adm())return;
  const x={};$('agape-editor').querySelectorAll('[data-layout]').forEach(i=>x[i.dataset.layout]=i.value.trim());
  x.logoUrl=layout.logoUrl||'';
  x.heroUrl=layout.heroUrl||'';
  x.heroCor=$('agape-hero-cor')?.value||padrao.heroCor;
  x.heroDecoracoes=!!$('agape-hero-decoracoes')?.checked;
  x.paletaLight=$('agape-editor').querySelector('input[name="agape-paleta-light"]:checked')?.value||'rose';
  x.paletaDark=$('agape-editor').querySelector('input[name="agape-paleta-dark"]:checked')?.value||'wine';
  const rows=[...$('agape-layout-blocos').querySelectorAll('[data-section]')];x.sections=rows.map(r=>r.dataset.section);x.hidden=rows.filter(r=>!r.querySelector('input').checked).map(r=>r.dataset.section);
  try{const r=await api('layout_salvar',{layout:x});layout=r.layout;aplicar();window.toast('Página inicial atualizada para todos!');}catch(e){window.toast(e.message,'err');}
}
async function restaurarLayout(){if(!adm()||!confirm('Restaurar os textos e a ordem padrão da página inicial?'))return;try{const r=await api('layout_salvar',{layout:padrao});layout=r.layout;aplicar();editor();window.toast('Layout padrão restaurado.');}catch(e){window.toast(e.message,'err');}}
async function lerLayout(){try{const r=await api('layout_ler');layout=r.layout||{};aplicar();}catch(e){console.warn('Layout da home:',e);}}
async function lerMeuTelefone(){if(!window.S?.me)return;try{const r=await api('telefone_meu_ler');if($('agape-conta-telefone'))$('agape-conta-telefone').value=r.telefone||'';}catch(e){console.warn(e);}}
async function salvarMeuTelefone(){try{const r=await api('telefone_meu_salvar',{telefone:$('agape-conta-telefone').value});$('agape-conta-telefone').value=r.telefone||'';contatosProntos=false;window.toast('Telefone salvo com sucesso.');}catch(e){window.toast(e.message,'err');}}
async function carregarContatos(){const r=await api('contatos_listar');contatos=r.contatos||[];contatosProntos=true;return contatos;}
async function abrirContatos(){
  if(!adm()&&!lider()){window.toast('Agenda exclusiva da liderança.','warn');return;}
  try{await carregarContatos();renderContatos();}catch(e){window.toast(e.message,'err');}
}
function whatsapp(telefone,mensagem=''){const num=String(telefone||'').replace(/\D/g,'');if(!/^55[1-9][0-9]{9,10}$/.test(num)){window.toast('Cadastre um telefone válido antes de abrir o WhatsApp.','warn');return;}window.open('https://wa.me/'+num+(mensagem?'?text='+encodeURIComponent(mensagem):''),'_blank','noopener,noreferrer');}
function renderContatos(){
  const busca=String($('agape-contatos-busca')?.value||'').toLocaleLowerCase('pt-BR');
  const html=contatos.filter(u=>u.name.toLocaleLowerCase('pt-BR').includes(busca)).map(u=>{
    const id=esc(u.id);const numero=u.telefone||'';
    return '<div class="agape-contato-row"><div><strong>'+esc(u.name)+'</strong><small>'+esc(numero||'Telefone não cadastrado')+'</small></div><div class="agape-contato-acoes">'+(numero?'<button type="button" class="btn btn-primary" onclick="agapeExtras.abrirZap(\''+id+'\')">WhatsApp</button>':'')+(adm()?'<button type="button" class="btn btn-ghost" onclick="agapeExtras.editarTelefone(\''+id+'\')">Editar</button>':'')+'</div></div>';
  }).join('')||'<p class="hint">Nenhum contato encontrado.</p>';
  if($('agape-contatos-lista'))$('agape-contatos-lista').innerHTML=html;
  if($('agape-adm-contatos-lista'))$('agape-adm-contatos-lista').innerHTML=html;
}
function abrirZap(id){const u=contatos.find(x=>x.id===id);if(u)whatsapp(u.telefone);}
async function editarTelefone(id){if(!adm())return;const u=contatos.find(x=>x.id===id);if(!u)return;const telefone=prompt('Telefone de '+u.name+' (DDD + número):',u.telefone||'');if(telefone===null)return;try{await api('contato_salvar',{id,telefone});await abrirContatos();window.toast('Contato atualizado.');}catch(e){window.toast(e.message,'err');}}
async function enviarPastoral(id){
  if(!lider())return window.toast('Acesso restrito à liderança.','warn');
  try{
    if(!contatosProntos)await carregarContatos();
    const u=contatos.find(x=>x.id===id);if(!u?.telefone)return window.toast('Cadastre o telefone desta pessoa em Contatos antes de enviar.','warn');
    const primeiro=String(u.name).trim().split(/\s+/)[0];
    const mensagem='Olá, '+primeiro+'! Tudo bem? Aqui é da liderança da Célula Ágape. Passando para saber como você está e dizer que sentimos sua falta nos nossos encontros. Você é muito importante para nós! Se precisar conversar, de oração ou de qualquer apoio, estamos por aqui. Que Deus abençoe sua semana!';
    whatsapp(u.telefone,mensagem);
  }catch(e){window.toast(e.message,'err');}
}
function atualizarAcesso(){
  const botao=$('agape-nav-contatos');if(botao)botao.hidden=!(adm()||lider());
  if($('agape-home-contatos'))$('agape-home-contatos').hidden=!(adm()||lider());
  if($('agape-layout-tab'))$('agape-layout-tab').hidden=!adm();
  if($('agape-adm-contatos'))$('agape-adm-contatos').hidden=!adm();
  if(!window.S?.me)contatosProntos=false;
}
function inicializar(){dom();atualizarAcesso();lerLayout();}
window.agapeExtras={atualizarAcesso,abrirContatos,renderContatos,lerMeuTelefone,salvarMeuTelefone,abrirZap,editarTelefone,enviarPastoral,salvarLayout,restaurarLayout,mover,enviarImagem,removerImagem};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inicializar);else inicializar();
})();