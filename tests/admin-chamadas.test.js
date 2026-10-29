import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { criarSessao } from '../api/_lib/auth.js';
import { criarHandler } from '../api-routes/admin-chamadas.js';

process.env.AUTH_SESSION_SECRET = 'teste-adm-chamadas-sessao-segura-123456';
const adminId = '11111111-1111-4111-8111-111111111111';
const chamadaId = '22222222-2222-4222-8222-222222222222';
const perfilId = '33333333-3333-4333-8333-333333333333';
const membroId = '44444444-4444-4444-8444-444444444444';
const registro = {
  id: chamadaId, data_celula: '2026-10-30', registrado_por: adminId,
  criado_em: '2026-10-29T19:00:00Z', atualizado_em: '2026-10-29T19:00:00Z'
};
const presencas = [
  { id: '1', chamada_id: chamadaId, status: 'presente' },
  { id: '2', chamada_id: chamadaId, status: 'presente' },
  { id: '3', chamada_id: chamadaId, status: 'ausente' }
];
function criarDb({ role = 'adm', nomePerfil = 'Líder', permissao = true } = {}) {
  const usuario = { id: adminId, name: 'Responsável', login: 'responsavel',
    role, perfil_id: perfilId, session_version: 0 };
  const estado = { chamadas: [registro], presencas: [...presencas], deletes: 0 };
  const db = {
    from(tabela) {
      const q = {
        filtros: [], ids: null, ordem: [], acao: 'select',
        select(_campos, options) { this.count = options?.count; return this; },
        eq(k,v) { this.filtros.push([k,v]); return this; },
        in(k,vs) { this.ids = [k,vs]; return this; },
        order(k,opts) { this.ordem.push([k,opts]); return this; },
        range(a,b) { this.faixa=[a,b]; return this.executar(); },
        delete() { this.acao='delete'; return this; },
        maybeSingle() { return this.executar().then(r=>({...r,data:r.data?.[0]||null})); },
        then(resolve,reject) { return this.executar().then(resolve,reject); },
        async executar() {
          let rows=[];
          if(tabela==='users')rows=[usuario,{id:membroId,name:'Outro integrante'}];
          if(tabela==='perfis_permissao')rows=[{id:perfilId,nome:nomePerfil,permissoes:{chamada_registrar:permissao}}];
          if(tabela==='chamadas')rows=estado.chamadas;
          if(tabela==='chamada_presencas')rows=estado.presencas;
          for(const [k,v] of this.filtros)rows=rows.filter(x=>x[k]===v);
          if(this.ids)rows=rows.filter(x=>this.ids[1].includes(x[this.ids[0]]));
          const count=rows.length;
          if(this.acao==='delete') {
            estado.deletes+=rows.length;
            const removidos=new Set(rows.map(x=>x.id));
            estado.chamadas=estado.chamadas.filter(x=>!removidos.has(x.id));
            estado.presencas=estado.presencas.filter(x=>!removidos.has(x.chamada_id));
          }
          if(this.ordem.length)rows=[...rows].sort((a,b)=>{
            for(const [k,opts] of this.ordem) {
              const cmp=String(a[k]).localeCompare(String(b[k]));
              if(cmp)return opts?.ascending===false?-cmp:cmp;
            }
            return 0;
          });
          if(this.faixa)rows=rows.slice(this.faixa[0],this.faixa[1]+1);
          return {data:rows,error:null,count};
        }
      };
      return q;
    }
  };
  const req = (acao, extras = {}) => ({
    method:'POST',
    headers:{cookie:'agape-session='+encodeURIComponent(criarSessao(usuario))},
    body:{acao,...extras}
  });
  const executar = async (acao, extras = {}) => {
    const res = {setHeader(){return this;},status(n){this.statusCode=n;return this;},json(x){this.body=x;return x;}};
    await criarHandler({criarCliente:()=>db})(req(acao,extras),res);
    return {status:res.statusCode,...res.body};
  };
  return {executar,estado};
}
test('ADM Líder vê datas, autor e totais de presenças e faltas',async()=>{
  const {executar}=criarDb();
  const r=await executar('listar',{pagina:1});
  assert.equal(r.status,200);
  assert.equal(r.total,1);
  assert.equal(r.chamadas[0].data_celula,'2026-10-30');
  assert.equal(r.chamadas[0].registrado_por_nome,'Responsável');
  assert.equal(r.chamadas[0].presentes,2);
  assert.equal(r.chamadas[0].ausentes,1);
});
test('cancelamento por ID e data remove chamada e presenças, e atualiza a lista',async()=>{
  const {executar,estado}=criarDb();
  const r=await executar('cancelar',{id:chamadaId,data:'2026-10-30'});
  assert.equal(r.status,200);
  assert.equal(r.cancelada,true);
  assert.equal(estado.deletes,1);
  assert.equal(estado.presencas.length,0);
  assert.equal((await executar('listar',{pagina:1})).total,0);
  assert.equal((await executar('cancelar',{id:chamadaId,data:'2026-10-30'})).status,404);
});
test('não cancela outra data, ID inválido ou página inválida',async()=>{
  const {executar,estado}=criarDb();
  assert.equal((await executar('cancelar',{id:chamadaId,data:'2026-10-23'})).status,404);
  assert.equal((await executar('cancelar',{id:'inválido',data:'2026-10-30'})).status,400);
  assert.equal((await executar('listar',{pagina:-1})).status,400);
  assert.equal(estado.deletes,0);
});
test('perfil Membro com role ADM não pode ver nem cancelar chamadas',async()=>{
  const {executar,estado}=criarDb({role:'adm',nomePerfil:'Membro',permissao:true});
  assert.equal((await executar('listar',{pagina:1})).status,403);
  assert.equal((await executar('cancelar',{id:chamadaId,data:'2026-10-30'})).status,403);
  assert.equal(estado.deletes,0);
});
test('Líder em Treinamento sem role ADM não pode acessar aba administrativa',async()=>{
  const {executar}=criarDb({role:'membro',nomePerfil:'Líder em Treinamento',permissao:true});
  assert.equal((await executar('listar',{pagina:1})).status,403);
});
test('ADM Líder sem permissão de chamada não pode acessar lista',async()=>{
  const {executar}=criarDb({role:'adm',nomePerfil:'Líder',permissao:false});
  assert.equal((await executar('listar',{pagina:1})).status,403);
});

const script = readFileSync(new URL('../js/admin-chamadas.js',import.meta.url),'utf8');
const markup = `<button id="adm-tab-chamadas" hidden></button>
<div id="adm-chamadas"><span id="adm-chamadas-total"></span>
<div id="adm-chamadas-status"></div><div id="adm-chamadas-lista"></div>
<button id="adm-chamadas-atualizar"></button><button id="adm-chamadas-mais" hidden></button></div>`;
function frontend({autorizado=true,confirmacao=true}={}){
  const dom = new JSDOM(markup,{url:'https://celula-agape.vercel.app',runScripts:'dangerously'});
  const w=dom.window, chamadas=[];
  w.S={me:{role:autorizado?'adm':'membro',permissoes:{chamada_registrar:true}}};
  w.confirm=()=>confirmacao;
  w.toast=()=>{};
  w.goPage=()=>{};
  w.agapeFrequencia={invalidar:()=>{chamadas.push({acao:'invalidar'});}};
  w.agapeChamada={abrir:data=>{chamadas.push({acao:'ver',data});}};
  let registros=[{...registro,registrado_por_nome:'Responsável',presentes:2,ausentes:1}];
  w.chamarApi=async(_url,body)=>{
    chamadas.push(body);
    if(body.acao==='listar')return {chamadas:registros,total:registros.length};
    if(body.acao==='cancelar'){registros=[];return {ok:true};}
    throw new Error('ação inesperada');
  };
  w.eval(script);
  return {w,chamadas,close:()=>dom.window.close()};
}
test('aba ADM exibe chamada, permite abrir data e cancelar com confirmação',async()=>{
  const t=frontend();
  try {
    assert.equal(t.w.document.getElementById('adm-tab-chamadas').hidden,false);
    await t.w.agapeAdminChamadas.abrir();
    assert.match(t.w.document.getElementById('adm-chamadas-lista').textContent,/30\/10\/2026/);
    assert.match(t.w.document.getElementById('adm-chamadas-lista').textContent,/2 presentes/);
    t.w.document.querySelector('[data-adm-ver]').click();
    assert.ok(t.chamadas.some(x=>x.acao==='ver'&&x.data==='2026-10-30'));
    t.w.document.querySelector('[data-adm-cancelar]').click();
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal(t.chamadas.filter(x=>x.acao==='cancelar').length,1);
    assert.equal(t.w.document.getElementById('adm-chamadas-total').textContent,'0 chamadas registradas');
    assert.ok(t.chamadas.some(x=>x.acao==='invalidar'));
  }finally{t.close();}
});
test('sem confirmação não envia exclusão ao servidor',async()=>{
  const t=frontend({confirmacao:false});
  try {
    await t.w.agapeAdminChamadas.abrir();
    t.w.document.querySelector('[data-adm-cancelar]').click();
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(t.chamadas.filter(x=>x.acao==='cancelar').length,0);
  }finally{t.close();}
});
test('usuário sem role ADM não enxerga a aba',()=>{
  const t=frontend({autorizado:false});
  try {
    assert.equal(t.w.document.getElementById('adm-tab-chamadas').hidden,true);
  }finally{t.close();}
});
