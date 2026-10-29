import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const code=readFileSync(new URL('../js/chamada.js',import.meta.url),'utf8');
const report=readFileSync(new URL('../js/frequencia.js',import.meta.url),'utf8');
const markup=`<div id="lider-presenca-acesso" hidden></div><p id="lider-presenca-explicacao" hidden></p>
<div class="page" id="page-chamada"><input id="chamada-data"><div id="chamada-feedback"></div>
<section id="chamada-existente" hidden></section><section id="chamada-game" hidden>
<span id="chamada-counter"></span><span id="chamada-progress-percent"></span><span id="chamada-progress-bar"></span>
<div id="chamada-deck"></div><button class="chamada-undo"></button></section>
<section id="chamada-summary" hidden></section></div>
<div class="page" id="page-frequencia"><select id="freq-periodo"><option value="todas" selected>Todas</option></select>
<input id="freq-inicio"><input id="freq-fim"><div id="freq-status"></div><div id="freq-conteudo"></div></div>`;
const user={id:'11111111-1111-4111-8111-111111111111',name:'Pessoa',avatar_url:null};
function setup({existente=false,resolveSalvar}={}){
  const dom=new JSDOM(markup,{url:'https://celula-agape.vercel.app',runScripts:'dangerously'});
  const w=dom.window;
  w.S={me:{id:user.id,permissoes:{chamada_registrar:true,frequencia_relatorio:true}}};
  const pages=[];const actions=[];
  w.goPage=(id)=>{pages.push(id);w.document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+id));};
  w.toast=()=>{};
  w.chamarApi=async (url,body)=>{
    actions.push({url,body});
    if(url==='/api/chamada'&&body.acao==='config')return {config:{celula_dia_semana:'5'}};
    if(url==='/api/chamada'&&body.acao==='abrir')return {
      chamada:existente?{id:'a',data_celula:body.data,atualizado_em:'2026-10-29T00:00:00Z'}:null,
      membros:[user],presencas:existente?[{user_id:user.id,status:'presente'}]:[]
    };
    if(url==='/api/chamada'&&['salvar','atualizar'].includes(body.acao)){
      if(resolveSalvar)return resolveSalvar();
      return {ok:true};
    }
    if(url==='/api/frequencia'&&body.acao==='periodo')return {primeira:'2026-10-30',ultima:'2026-10-30'};
    if(url==='/api/frequencia')return {membros:[],chamadas:[],presencas:[]};
    return {ok:true};
  };
  w.eval(code);
  return {w,actions,pages,close:()=>dom.window.close()};
}
test('data com chamada salva bloqueia nova chamada e mostra aviso',async()=>{
  const t=setup({existente:true});
  try{
    await t.w.agapeChamada.abrir();
    assert.match(t.w.document.getElementById('chamada-existente').textContent,/Já existe uma chamada/);
    assert.equal(t.w.document.getElementById('chamada-game').hidden,true);
    t.w.agapeChamada.responder('ausente');
    assert.equal(t.actions.filter(a=>a.body.acao==='salvar').length,0);
    t.w.document.getElementById('chamada-revisar-existente').click();
    assert.ok(t.w.document.getElementById('chamada-salvar').textContent.includes('correções'));
  }finally{t.close();}
});
test('salvar apenas uma vez, desabilitar botão e voltar ao início',async()=>{
  let finish;
  const pendente=new Promise(resolve=>{finish=resolve;});
  const t=setup({resolveSalvar:()=>pendente});
  try{
    await t.w.agapeChamada.abrir();
    t.w.agapeChamada.responder('presente');
    await new Promise(r=>setTimeout(r,190));
    const btn=t.w.document.getElementById('chamada-salvar');
    assert.ok(btn);
    btn.click();btn.click();
    assert.equal(btn.disabled,true);
    assert.equal(t.actions.filter(a=>a.body.acao==='salvar').length,1);
    finish({ok:true});
    await new Promise(r=>setTimeout(r,15));
    assert.equal(t.pages.at(-1),'home');
  }finally{t.close();}
});
test('período padrão dos relatórios inclui chamada lançada para amanhã',async()=>{
  const dom=new JSDOM(markup+`<select id="freq-pessoa"></select><div id="freq-indicadores"></div><div id="freq-grafico-semanas"></div><div id="freq-grafico-pessoas"></div><div id="freq-grafico-proporcao"></div><div id="freq-pastoral"></div><table id="freq-tabela"></table>`,{url:'https://celula-agape.vercel.app',runScripts:'dangerously'});
  const w=dom.window;
  w.S={me:{permissoes:{frequencia_relatorio:true}}};w.goPage=()=>{};
  w.agapeCalcularFrequencia=()=>({chamadas:[],linhas:[],semanas:[],proporcao:{presentes:0,ausentes:0},pastoral:[],indicadores:{taxa:null,realizadas:0,media:0,melhor:null,pior:null}});
  w.chamarApi=async(_,body)=>body.acao==='periodo'?
    {primeira:'2026-10-30',ultima:'2026-10-30'}:{membros:[],chamadas:[],presencas:[]};
  w.eval(report);
  try{
    await w.agapeFrequencia.abrir();
    assert.equal(w.document.getElementById('freq-inicio').value,'2026-10-30');
    assert.equal(w.document.getElementById('freq-fim').value,'2026-10-30');
  }finally{dom.window.close();}
});
