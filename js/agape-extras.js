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
const padrao={eyebrow:'by / VIDEIRA GARAVELO',titulo:'Um lugar para',destaque:'pertencer.',descricao:'Célula Ágape — encontros, comunhão e uma fé vivida juntos.',botao1:'Explorar o mural',botao2:'Onde nos encontrar',sections:ids,hidden:[]};
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
  el.innerHTML=['eyebrow','titulo','destaque','descricao','botao1','botao2'].map(k=>'<div class="fld"><label>'+esc({eyebrow:'Texto superior',titulo:'Título',destaque:'Palavra em destaque',descricao:'Descrição',botao1:'Botão Mural',botao2:'Botão Localização'}[k])+'</label><input data-layout="'+k+'" maxlength="'+(k==='descricao'?240:110)+'" value="'+esc(x[k]||'')+'"></div>').join('')+
  '<h3>Blocos da página</h3><p class="hint">Use as setas para reorganizar. Desmarque para ocultar.</p><div id="agape-layout-blocos"></div><button type="button" class="btn btn-primary btn-full" onclick="agapeExtras.salvarLayout()">Publicar alterações</button><button type="button" class="btn btn-ghost btn-full" onclick="agapeExtras.restaurarLayout()">Restaurar padrão</button>';
  const lista=$('agape-layout-blocos');const order=[...new Set([...(x.sections||ids),...ids])];
  lista.innerHTML=order.map((id,i)=>'<div class="agape-layout-row" data-section="'+id+'"><label><input type="checkbox" '+(!(x.hidden||[]).includes(id)?'checked':'')+'> '+esc(nomes[id])+'</label><span><button type="button" class="btn btn-ghost" onclick="agapeExtras.mover(this,-1)" aria-label="Mover para cima">↑</button><button type="button" class="btn btn-ghost" onclick="agapeExtras.mover(this,1)" aria-label="Mover para baixo">↓</button></span></div>').join('');
}
function mover(btn,delta){const row=btn.closest('[data-section]'),box=row.parentElement;if(delta<0&&row.previousElementSibling)box.insertBefore(row,row.previousElementSibling);if(delta>0&&row.nextElementSibling)box.insertBefore(row.nextElementSibling,row);}
async function salvarLayout(){
  if(!adm())return;
  const x={};$('agape-editor').querySelectorAll('[data-layout]').forEach(i=>x[i.dataset.layout]=i.value.trim());
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
  if($('agape-layout-tab'))$('agape-layout-tab').hidden=!adm();
  if($('agape-adm-contatos'))$('agape-adm-contatos').hidden=!adm();
  if(!window.S?.me)contatosProntos=false;
}
function inicializar(){dom();atualizarAcesso();lerLayout();}
window.agapeExtras={atualizarAcesso,abrirContatos,renderContatos,lerMeuTelefone,salvarMeuTelefone,abrirZap,editarTelefone,enviarPastoral,salvarLayout,restaurarLayout,mover};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inicializar);else inicializar();
})();