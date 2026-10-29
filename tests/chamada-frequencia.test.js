import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { criarSessao } from '../api/_lib/auth.js';
import { exigirLiderChamada, validarPeriodo } from '../api/_lib/chamada-acesso.js';

const ctx={};vm.runInNewContext(readFileSync(new URL('../js/frequencia-calculos.js', import.meta.url),'utf8'),ctx);
const calcular=ctx.agapeCalcularFrequencia;
const id1='11111111-1111-4111-8111-111111111111';
const id2='22222222-2222-4222-8222-222222222222';
const eventos=[
  {id:'a',data_celula:'2026-10-02'},{id:'b',data_celula:'2026-10-09'},{id:'c',data_celula:'2026-10-16'}
];
test('não penaliza pessoa que ingressou depois das primeiras reuniões',()=>{
  const r=calcular({membros:[
    {id:id1,name:'Ana',ativo:true,created_at:'2026-09-01T12:00:00Z'},
    {id:id2,name:'Beto',ativo:true,created_at:'2026-10-09T12:00:00Z',data_ingresso_celula:'2026-10-09'},
  ],chamadas:eventos,presencas:[
    {chamada_id:'a',user_id:id1,status:'presente'},
    {chamada_id:'b',user_id:id1,status:'ausente'},
    {chamada_id:'c',user_id:id1,status:'ausente'},
    {chamada_id:'b',user_id:id2,status:'presente'},
    {chamada_id:'c',user_id:id2,status:'presente'}
  ]});
  assert.deepEqual(Array.from(r.linhas.find(x=>x.id===id2).datas),[null,'presente','presente']);
  assert.equal(r.linhas.find(x=>x.id===id2).percentual,100);
  assert.equal(r.indicadores.taxa,60);
  assert.equal(r.pastoral.length,1);
  assert.equal(r.pastoral[0].nome,'Ana');
});
test('sem chamadas: nenhum usuário é tratado como ausente',()=>{
  const r=calcular({membros:[{id:id1,name:'Ana',ativo:true}],chamadas:[],presencas:[]});
  assert.equal(r.indicadores.taxa,null);
  assert.equal(r.indicadores.realizadas,0);
  assert.equal(r.proporcao.ausentes,0);
});
test('ignora usuários inativos e marcações ausentes do registro',()=>{
  const r=calcular({membros:[{id:id1,name:'Ana',ativo:true,created_at:'2026-01-01'},
    {id:id2,name:'Inativo',ativo:false,created_at:'2026-01-01'}],
    chamadas:[eventos[0]],presencas:[{chamada_id:'a',user_id:id2,status:'ausente'}]});
  assert.equal(r.linhas.length,1);
  assert.equal(r.indicadores.taxa,null);
});
test('filtro de pessoa recalcula todos os indicadores',()=>{
  const r=calcular({membros:[{id:id1,name:'Ana',created_at:'2026-01-01'},{id:id2,name:'Beto',created_at:'2026-01-01'}],
    chamadas:[eventos[0]],presencas:[{chamada_id:'a',user_id:id1,status:'presente'},{chamada_id:'a',user_id:id2,status:'ausente'}]},id1);
  assert.equal(r.indicadores.taxa,100);
  assert.equal(r.linhas.length,1);
});
test('intervalo máximo permitido é de 5 anos',()=>{
  assert.deepEqual(validarPeriodo('2026-01-01','2026-02-01'),['2026-01-01','2026-02-01']);
  assert.throws(()=>validarPeriodo('2026-10-29','2026-02-01'));
});
process.env.AUTH_SESSION_SECRET='local-test-secret-at-least-32-characters';
function stubPerfil(nome,permissions){
  const user={id:id1,name:'Pessoa',login:'pessoa',role:'membro',perfil_id:id2,session_version:0};
  return {
    req:{headers:{cookie:'agape-session='+encodeURIComponent(criarSessao(user))}},
    db:{from(tab){
      if(tab==='users')return {select(){return {eq(){return {async maybeSingle(){return {data:user,error:null};}};}};}};
      if(tab==='perfis_permissao')return {select(){return {eq(){return {async maybeSingle(){return {data:{nome,permissoes:permissions},error:null};}};}};}};
      throw new Error('unexpected table '+tab);
    }}
  };
}
test('backend bloqueia Membro ainda que receba a permissão por engano',async()=>{
  const {req,db}=stubPerfil('Membro',{chamada_registrar:true});
  await assert.rejects(()=>exigirLiderChamada(db,req,'chamada_registrar'),e=>e.status===403);
});
test('backend permite Líder em Treinamento com permissão concedida',async()=>{
  const {req,db}=stubPerfil('Líder em Treinamento',{chamada_registrar:true});
  const r=await exigirLiderChamada(db,req,'chamada_registrar');
  assert.equal(r.nomePerfil,'Líder em Treinamento');
});
test('backend bloqueia LT quando permissão for revogada',async()=>{
  const {req,db}=stubPerfil('Líder em Treinamento',{chamada_registrar:false});
  await assert.rejects(()=>exigirLiderChamada(db,req,'chamada_registrar'),e=>e.status===403);
});
