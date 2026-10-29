/* Relatórios de frequência — CSS/SVG nativos sem dependências externas. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={raw:null,resultado:null};
  const permitido=()=>!!window.S?.me && (window.S.me.permissoes?.frequencia_relatorio || window.S.me.role==='adm');
  const nomeData=d=>d?d.slice(8,10)+'/'+d.slice(5,7):'—';
  function status(msg,error=false){$('freq-status').textContent=msg;$('freq-status').classList.toggle('error',error);}
  function periodoAlterado(){
    if($('freq-periodo').value==='personalizado')return;
    const end=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T12:00:00Z');
    const start=new Date(end);
    start.setUTCDate(start.getUTCDate()-({mes:30,'3meses':90,ano:365}[$('freq-periodo').value]||90));
    $('freq-inicio').value=start.toISOString().slice(0,10);
    $('freq-fim').value=end.toISOString().slice(0,10);
  }
  async function abrir(){
    if(!permitido())return window.toast('Área exclusiva da liderança.','warn');
    window.goPage('frequencia');
    if(!$('freq-inicio').value)periodoAlterado();
    await carregar();
  }
  async function carregar(){
    if(!permitido())return;
    const inicio=$('freq-inicio').value,fim=$('freq-fim').value;
    if(!inicio||!fim||inicio>fim)return status('Escolha um intervalo válido.',true);
    status('Consultando as chamadas registradas…');
    $('freq-conteudo').hidden=true;
    try {
      const r=await window.chamarApi('/api/frequencia',{inicio,fim});
      state.raw=r;
      const sel=$('freq-pessoa'),antigo=sel.value;
      sel.innerHTML='<option value="">Todas as pessoas</option>'+r.membros.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
      if([...sel.options].some(o=>o.value===antigo))sel.value=antigo;
      renderizar();
      status(r.chamadas.length?`Dados de ${r.chamadas.length} reunião(ões) concluída(s).`:'Não há chamadas salvas nesse período.');
      $('freq-conteudo').hidden=false;
    }catch(e){status((e.message||'Falha de conexão')+' · Verifique a migração do banco e tente novamente.',true);}
  }
  const indicador=(titulo,valor,obs='')=>`<div class="freq-indicador"><span>${esc(titulo)}</span><strong>${esc(valor)}</strong><small>${esc(obs)}</small></div>`;
  function renderizar(){
    if(!state.raw)return;
    const r=window.agapeCalcularFrequencia(state.raw,$('freq-pessoa').value);
    state.resultado=r;
    const i=r.indicadores;
    $('freq-indicadores').innerHTML=[
      indicador('Presença média',i.taxa===null?'—':i.taxa+'%','Entre as marcações registradas'),
      indicador('Células realizadas',i.realizadas,'No período selecionado'),
      indicador('Média de presentes',String(i.media).replace('.',','),'Por reunião'),
      indicador('Melhor semana',i.melhor?nomeData(i.melhor.data):'—',i.melhor?.percentual==null?'Sem dados':i.melhor.percentual+'%'),
      indicador('Menor presença',i.pior?nomeData(i.pior.data):'—',i.pior?.percentual==null?'Sem dados':i.pior.percentual+'%')
    ].join('');
    const chart=$('freq-grafico-semanas');
    const validas=r.semanas.filter(s=>s.percentual!==null);
    chart.innerHTML=validas.length
      ?`<div class="freq-week-bars">${validas.map(w=>`<div class="freq-week-col" title="${esc(w.data)}: ${w.presentes} presentes, ${w.ausentes} faltas"><span>${w.percentual}%</span><div class="freq-week-bar"><i style="height:${w.percentual}%"></i></div><small>${nomeData(w.data)}</small></div>`).join('')}</div>`
      :'<p class="freq-empty">Nenhuma semana com presença registrada.</p>';
    const people=$('freq-grafico-pessoas');
    people.innerHTML=r.linhas.length?
      r.linhas.map(p=>`<div class="freq-person"><div><strong>${esc(p.nome)}</strong><span>${p.percentual===null?'—':p.percentual+'%'} · ${p.presente}/${p.realizado}</span></div><div class="freq-person-track"><i class="${p.percentual!==null&&p.percentual<50?'low':''}" style="width:${p.percentual??0}%"></i></div></div>`).join(''):
      '<p class="freq-empty">Sem pessoas ativas para o filtro.</p>';
    const tot=r.proporcao.presentes+r.proporcao.ausentes;
    const p=tot?Math.round(r.proporcao.presentes*100/tot):0;
    $('freq-grafico-proporcao').innerHTML=tot?
      `<div class="freq-donut-box"><div class="freq-donut" style="--freq-p:${p}%"><strong>${p}%</strong></div><div class="freq-legend"><p><i class="present"></i>Presentes: ${r.proporcao.presentes}</p><p><i class="absent"></i>Faltas: ${r.proporcao.ausentes}</p></div></div>`:
      '<p class="freq-empty">Nenhuma marcação registrada.</p>';
    $('freq-pastoral').innerHTML=r.pastoral.length?
      '<p class="freq-subtitle">Pessoas com duas ou mais ausências consecutivas entre as últimas reuniões registradas:</p>'+
      r.pastoral.map(p=>`<div class="freq-pastoral-row">❤️ <strong>${esc(p.nome)}</strong><span>${p.consecutivas} ausências seguidas</span></div>`).join(''):
      '<p class="freq-empty">Nenhuma sequência recente de ausências identificada.</p>';
    const head=r.chamadas.map(c=>`<th scope="col">${nomeData(c.data_celula)}</th>`).join('');
    $('freq-tabela').innerHTML=`<thead><tr><th scope="col">Pessoa</th>${head}<th>Presenças</th><th>Faltas</th><th>%</th></tr></thead>
      <tbody>${r.linhas.map(p=>`<tr><th scope="row">${esc(p.nome)}</th>${p.datas.map(v=>`<td class="freq-cell ${v||'indefinido'}" title="${v||'Não aplicável ou não registrado'}">${v==='presente'?'✓':v==='ausente'?'✕':'—'}</td>`).join('')}<td>${p.presente}</td><td>${p.ausente}</td><td>${p.percentual===null?'—':p.percentual+'%'}</td></tr>`).join('')}</tbody>`;
  }
  const csvCell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  function csv(){
    if(!state.resultado)return;
    const r=state.resultado;
    const data=[
      ['Membro',...r.chamadas.map(c=>c.data_celula),'Presenças','Faltas','Frequência (%)'],
      ...r.linhas.map(p=>[p.nome,...p.datas.map(s=>s==='presente'?'P':s==='ausente'?'F':''),p.presente,p.ausente,p.percentual??''])
    ];
    const blob=new Blob(['\ufeff'+data.map(l=>l.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`agape-frequencia-${$('freq-inicio').value}-${$('freq-fim').value}.csv`;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function pdf(){
    if(!state.resultado)return;
    const title=document.title;
    document.title=`Célula Ágape | Frequência ${$('freq-inicio').value} a ${$('freq-fim').value}`;
    // A folha de impressão inclui os gráficos CSS, indicadores e tabela.
    window.addEventListener('afterprint',()=>{document.title=title;},{once:true});
    window.print();
  }
  window.agapeFrequencia={abrir,carregar,renderizar,periodoAlterado,csv,pdf};
})();