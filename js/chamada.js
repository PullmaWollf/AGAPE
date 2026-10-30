/* ÁGAPE — Chamada estilo MATCH. JS puro, gestos Pointer Events. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={data:'',membros:[],marcacoes:{},historico:[],chamada:null,carregando:false,salvando:false,modoEdicao:false,animando:false,reqId:0};
  const autorizado=()=>Boolean(window.S?.me && (
    window.S.me.permissoes?.chamada_registrar===true
  ));
  const chave=()=>`agape:chamada:rascunho:${window.S?.me?.id||'anon'}:${state.data}`;
  const dataSP=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const dataPadrao=(dia=5)=>{
    const base=new Date(dataSP()+'T12:00:00Z');
    const alvo=Number.isInteger(Number(dia)) ? Number(dia):5;
    base.setUTCDate(base.getUTCDate()+((alvo-base.getUTCDay()+7)%7));
    return base.toISOString().slice(0,10);
  };
  const avatar=(m)=>{
    const url=String(m.avatar_url||'');
    if(/^https:\/\//i.test(url))return `<img src="${esc(url)}" alt="Foto de ${esc(m.name)}" loading="lazy">`;
    const initials=String(m.name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('');
    let hash=0;for(const c of m.id)hash=((hash*31)+c.charCodeAt(0))|0;
    return `<span class="chamada-iniciais" style="--avatar-hue:${Math.abs(hash)%360}">${esc(initials)}</span>`;
  };
  function feedback(msg,error=false) {
    const el=$('chamada-feedback');el.textContent=msg;el.classList.toggle('error',error);
  }
  function salvarRascunho(){
    if(!state.data||!window.S?.me||state.chamada)return;
    try {localStorage.setItem(chave(),JSON.stringify({marcacoes:state.marcacoes,atualizado:new Date().toISOString()}));}
    catch(e){console.warn('[chamada] rascunho sem armazenamento',e);}
  }
  function aplicarRascunho(){
    try {
      const r=JSON.parse(localStorage.getItem(chave())||'null');
      if(!r?.marcacoes)return;
      // Não sobrescrever chamada salva depois do rascunho local.
      if(state.chamada?.atualizado_em && Date.parse(r.atualizado)<Date.parse(state.chamada.atualizado_em))return;
      const ids=new Set(state.membros.map(m=>m.id));
      for(const [id,status] of Object.entries(r.marcacoes)){
        if(ids.has(id)&&['presente','ausente'].includes(status))state.marcacoes[id]=status;
      }
    }catch(e){console.warn('[chamada] rascunho ignorado',e);}
  }
  function atualizaAcesso(){
    const sec=$('lider-presenca-acesso');
    if(sec)sec.hidden=!autorizado() && !(window.S?.me?.permissoes?.frequencia_relatorio);
    const hint=$('lider-presenca-explicacao');if(hint)hint.hidden=sec?.hidden??true;
    if(!window.S?.me && (document.getElementById('page-chamada')?.classList.contains('active') ||
      document.getElementById('page-frequencia')?.classList.contains('active'))){
      window.goPage('home');
    }
  }
  async function abrir(dataSelecionada){
    if(!autorizado())return window.toast('Área exclusiva da liderança.','warn');
    window.goPage('chamada');
    feedback('Carregando padrão da célula…');
    try {
      const r=await window.chamarApi('/api/chamada',{acao:'config'});
      state.data=/^\d{4}-\d{2}-\d{2}$/.test(String(dataSelecionada||''))
        ? dataSelecionada : dataPadrao(r.config?.celula_dia_semana);
      $('chamada-data').value=state.data;
      await carregar();
    }catch(e){
      feedback((e.message||'Não foi possível abrir a chamada.')+' A migração SQL pode estar pendente.',true);
    }
  }
  async function mudarData(data) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data))return;
    state.data=data;await carregar();
  }
  async function carregar(){
    if(!autorizado()||state.salvando)return;
    const token=++state.reqId;
    state.carregando=true;feedback('Carregando participantes…');
    $('chamada-game').hidden=true;$('chamada-summary').hidden=true;
    const existente=$('chamada-existente');if(existente)existente.hidden=true;
    try {
      const r=await window.chamarApi('/api/chamada',{acao:'abrir',data:state.data});
      if(token!==state.reqId)return;
      state.membros=r.membros||[];state.chamada=r.chamada;state.historico=[];state.modoEdicao=false;
      state.marcacoes=Object.fromEntries((r.presencas||[]).map(p=>[p.user_id,p.status]));
      if(!state.chamada)aplicarRascunho();
      render();
      feedback(state.chamada?'Esta data já tem chamada salva. Não é possível lançar outra. Use as opções abaixo para consultar ou corrigir.':'Nova chamada: marque quem veio e quem faltou.');
    }catch(e){if(token===state.reqId)feedback((e.message||'Falha de conexão')+' · Suas marcações locais foram preservadas.',true);}
    finally{if(token===state.reqId)state.carregando=false;}
  }
  function renderExistente(){
    $('chamada-game').hidden=true;$('chamada-summary').hidden=true;
    const box=$('chamada-existente');if(!box)return;
    const presentes=Object.values(state.marcacoes).filter(x=>x==='presente').length;
    const faltas=Object.values(state.marcacoes).filter(x=>x==='ausente').length;
    const data=state.data.split('-').reverse().join('/');
    box.hidden=false;
    box.innerHTML=`<div class="chamada-ja-registrada">
      <div class="chamada-ja-icon" aria-hidden="true">✓</div>
      <span class="chamada-eyebrow">REUNIÃO REGISTRADA</span>
      <h3>Já existe uma chamada em ${esc(data)}</h3>
      <p>Esta data já foi lançada. Não é possível fazer outra chamada para o mesmo dia.</p>
      <div class="chamada-ja-totais"><span>✓ ${presentes} vieram</span><span>✕ ${faltas} faltaram</span></div>
      <div class="chamada-ja-acoes">
        <button type="button" class="btn btn-primary" id="chamada-revisar-existente">Ver / corrigir chamada</button>
        <button type="button" class="btn btn-ghost" id="chamada-excluir-existente">🗑️ Excluir chamada</button>
      </div>
      <p class="chamada-ja-hint">Para registrar outra reunião, selecione uma data diferente acima.</p>
    </div>`;
    $('chamada-revisar-existente').addEventListener('click',()=>{
      state.modoEdicao=true;box.hidden=true;resumo();
    });
    $('chamada-excluir-existente').addEventListener('click',excluir);
  }
  function restantes(){return state.membros.filter(m=>!state.marcacoes[m.id]);}
  function progresso(){
    const done=state.membros.length-restantes().length;
    const total=state.membros.length;
    $('chamada-counter').textContent=`${done} de ${total}`;
    const p=total?Math.round(done*100/total):0;
    $('chamada-progress-percent').textContent=p+'%';
    $('chamada-progress-bar').style.width=p+'%';
  }
  function cardHtml(m,back=false){
    return `<article class="match-card${back?' match-back':''}" data-user="${esc(m.id)}">
      <div class="match-stamp match-stamp-no">NÃO VEIO</div><div class="match-stamp match-stamp-yes">VEIO</div>
      <div class="match-avatar">${avatar(m)}</div>
      <div class="match-name">${esc(m.name)}</div>
      <p>${back?'Próximo participante':'Você viu esta pessoa na célula?'}</p>
      </article>`;
  }
  function render(){
    if(state.chamada && !state.modoEdicao){renderExistente();return;}
    const existente=$('chamada-existente');if(existente)existente.hidden=true;
    progresso();
    const queue=restantes();
    const game=$('chamada-game'),summary=$('chamada-summary');
    game.hidden=queue.length===0||state.membros.length===0;
    summary.hidden=queue.length!==0 && state.membros.length>0;
    if(!state.membros.length){summary.hidden=false;summary.innerHTML='<div class="chamada-empty">Nenhum participante ativo e elegível nessa data.</div>';return;}
    if(!queue.length){resumo();return;}
    const deck=$('chamada-deck');
    deck.innerHTML=(queue[1]?cardHtml(queue[1],true):'')+cardHtml(queue[0]);
    const card=deck.querySelector('.match-card:not(.match-back)');
    instalarArrasto(card,queue[0].id);
    const undo=$('chamada-game').querySelector('.chamada-undo');
    undo.disabled=state.historico.length===0;
    summary.hidden=true;
  }
  function instalarArrasto(card,id){
    let startX=0, startY=0, active=false,dx=0,dy=0;
    function mover(x,y) {
      dx=x-startX;dy=y-startY;
      card.style.transform=`translate(${dx}px,${dy*.25}px) rotate(${dx/18}deg)`;
      card.style.setProperty('--direction-opacity',Math.min(1,Math.abs(dx)/115).toFixed(2));
      card.dataset.direction=dx>0?'yes':'no';
    }
    card.addEventListener('pointerdown',e=>{
      if(e.button!==0||active)return;
      active=true;startX=e.clientX;startY=e.clientY;
      card.setPointerCapture(e.pointerId);card.classList.add('dragging');
    });
    card.addEventListener('pointermove',e=>{if(active)mover(e.clientX,e.clientY);});
    function fim(){
      if(!active)return;active=false;card.classList.remove('dragging');
      if(Math.abs(dx)>90){responder(dx>0?'presente':'ausente');return;}
      card.style.transform='';card.style.setProperty('--direction-opacity','0');card.dataset.direction='';
    }
    card.addEventListener('pointerup',fim);
    card.addEventListener('pointercancel',fim);
  }
  function responder(status){
    if(state.salvando||state.animando||state.carregando||state.chamada&&!state.modoEdicao)return;
    const m=restantes()[0];
    if(!m||!['presente','ausente'].includes(status))return;
    state.marcacoes[m.id]=status;state.historico.push(m.id);
    salvarRascunho();if(navigator.vibrate)navigator.vibrate(18);
    const card=$('chamada-deck').querySelector('.match-card:not(.match-back)');
    if(card){
      state.animando=true;
      card.style.transition='transform .17s ease,opacity .17s ease';
      card.style.transform=`translateX(${status==='presente'?600:-600}px) rotate(${status==='presente'?18:-18}deg)`;
      card.style.opacity='0';setTimeout(()=>{state.animando=false;render();},170);
    }else render();
  }
  function desfazer(){
    if(state.salvando||state.animando)return;
    const id=state.historico.pop();if(!id)return;
    delete state.marcacoes[id];salvarRascunho();render();
  }
  function corrigir(id){
    if(state.salvando||!state.marcacoes[id]||state.chamada&&!state.modoEdicao)return;
    state.marcacoes[id]=state.marcacoes[id]==='presente'?'ausente':'presente';
    salvarRascunho();resumo();
  }
  function resumo(){
    if(state.chamada&&!state.modoEdicao){renderExistente();return;}
    const queue=restantes();
    $('chamada-game').hidden=true;$('chamada-summary').hidden=false;
    const present=state.membros.filter(m=>state.marcacoes[m.id]==='presente');
    const absent=state.membros.filter(m=>state.marcacoes[m.id]==='ausente');
    $('chamada-summary').innerHTML=`<div class="chamada-result">
      <span class="chamada-eyebrow">CONFERÊNCIA</span><h3>Resumo da chamada</h3>
      <div class="chamada-metrics"><div><strong>${present.length}</strong><span>Vieram</span></div><div><strong>${absent.length}</strong><span>Não vieram</span></div><div><strong>${queue.length}</strong><span>Pendentes</span></div></div>
      <h4>Revise ou corrija antes de salvar</h4>
      <div class="chamada-result-list">${state.membros.map(m=>{
        const st=state.marcacoes[m.id];
        return `<div class="chamada-result-row"><span>${esc(m.name)}</span><button type="button" data-corrigir="${esc(m.id)}" ${!st?'disabled':''} class="${st||'pendente'}">${st==='presente'?'✓ Veio':st==='ausente'?'✕ Não veio':'Pendente'} · alterar</button></div>`;
      }).join('')}</div>
      <div class="chamada-summary-actions">
        ${queue.length?'<button type="button" class="btn btn-ghost" id="chamada-continuar">Continuar marcação</button>':
        `<button type="button" class="btn btn-primary" id="chamada-salvar">${state.chamada?'Salvar correções':'Salvar chamada'}</button>`}
        ${state.chamada?'<button type="button" class="btn btn-ghost chamada-excluir" id="chamada-excluir">🗑️ Excluir chamada salva</button>':''}
      </div></div>`;
    document.querySelectorAll('[data-corrigir]').forEach(b=>b.addEventListener('click',()=>corrigir(b.dataset.corrigir)));
    $('chamada-continuar')?.addEventListener('click',render);
    $('chamada-salvar')?.addEventListener('click',salvar);
    $('chamada-excluir')?.addEventListener('click',excluir);
  }
  async function excluir(){
    if(!state.chamada||state.salvando)return;
    const data=state.data.split('-').reverse().join('/');
    if(!window.confirm('Excluir definitivamente a chamada de '+data+'? Todas as presenças e faltas desta data serão removidas dos relatórios. Esta ação não pode ser desfeita.'))return;
    const btn=$('chamada-excluir')||$('chamada-excluir-existente');if(btn)btn.disabled=true;
    feedback('Excluindo chamada…');
    try{
      await window.chamarApi('/api/chamada',{acao:'excluir',data:state.data});
      localStorage.removeItem(chave());
      state.chamada=null;state.marcacoes={};state.historico=[];state.modoEdicao=false;
      render();
      window.agapeFrequencia?.invalidar?.();
      feedback('Chamada excluída. Você pode lançar uma nova chamada nesta data.');
      window.toast('Chamada excluída com sucesso!');
    }catch(e){
      feedback((e.message||'Não foi possível excluir')+' · Tente novamente.',true);
      if(btn)btn.disabled=false;
    }
  }
  async function salvar(){
    if(state.salvando||state.carregando||restantes().length||!state.membros.length||
       state.chamada&&!state.modoEdicao)return;
    state.salvando=true;
    const btn=$('chamada-salvar');if(btn){btn.disabled=true;btn.textContent='Salvando…';}
    feedback('Salvando chamada com segurança…');
    const edicao=!!state.chamada;
    try {
      await window.chamarApi('/api/chamada',{acao:edicao?'atualizar':'salvar',data:state.data,
        presencas:state.membros.map(m=>({user_id:m.id,status:state.marcacoes[m.id]}))});
      localStorage.removeItem(chave());
      state.historico=[];state.modoEdicao=false;state.chamada=null;state.data='';
      window.agapeFrequencia?.invalidar?.();
      window.goPage('home');
      window.toast(edicao?'Correções salvas com sucesso!':'Chamada salva com sucesso!');
    }catch(e){
      if(!edicao)salvarRascunho();
      feedback(e.message||'Falha ao salvar a chamada.',true);
      window.toast('Não foi possível salvar. Verifique o aviso.','err');
      if(e.status===409||String(e.message||'').includes('Já existe uma chamada')){
        state.salvando=false;
        await carregar();
      }
    }finally{
      state.salvando=false;
      if(btn){btn.disabled=false;btn.textContent=edicao?'Salvar correções':'Salvar chamada';}
    }
  }
  document.addEventListener('keydown',e=>{
    if(!$('page-chamada')?.classList.contains('active')||
      e.target?.matches('input,textarea,select,button')||e.altKey||e.ctrlKey||e.metaKey)return;
    if(e.key==='ArrowRight'){e.preventDefault();responder('presente');}
    if(e.key==='ArrowLeft'){e.preventDefault();responder('ausente');}
    if((e.key==='Backspace'||e.key==='z')&&state.historico.length){e.preventDefault();desfazer();}
  });
  window.agapeChamada={abrir,mudarData,responder,desfazer,resumo,atualizarAcesso:atualizaAcesso};
})();