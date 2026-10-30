import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../js/ui-icons.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/agape-editorial.css',import.meta.url),'utf8');

test('identidade editorial carrega após CSS existente e preserva páginas essenciais',()=>{
  assert.ok(html.indexOf('/css/agape-editorial.css')>html.indexOf('/css/agape-love.css'));
  assert.ok(html.includes('/js/ui-icons.js'));
  for(const id of ['page-home','page-mural','page-escala','page-local','page-adm','page-chamada','page-frequencia','theme-toggle','chamada-tipo','freq-tipo','adm-chamadas'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(css.includes('html[data-theme="dark"]'));
  assert.ok(css.includes('[hidden]{display:none!important}'));
});

test('substitui pictogramas por SVG sem alterar texto de navegação',async()=>{
  const dom=new JSDOM('<body><button class="tab-btn"><span class="tab-icon">🏠</span><span class="tab-label">Início</span></button><div class="quick-card"><span class="qc-icon">📖</span><span>Versículos</span></div><div id="dynamic"></div></body>',{runScripts:'dangerously'});
  const w=dom.window;
  try{
    w.eval(script);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    assert.equal(w.document.querySelectorAll('svg.ag-icon').length,2);
    assert.equal(w.document.querySelector('.tab-label').textContent,'Início');
    assert.equal(w.document.querySelector('.tab-icon').textContent,'');
    assert.equal(w.document.querySelector('.ag-icon').getAttribute('aria-hidden'),'true');
    w.document.querySelector('#dynamic').innerHTML='<button>⛪ Culto</button>';
    await new Promise(r=>setTimeout(r,10));
    assert.equal(w.document.querySelectorAll('svg.ag-icon').length,3);
    assert.equal(w.document.querySelector('#dynamic button').textContent.trim(),'Culto');
  }finally{w.close();}
});

test('não altera mensagens de usuário nem opções de formulário',()=>{
  const dom=new JSDOM('<body><div class="post-body">❤️ Obrigado!</div><select><option>📅 Reunião</option></select><div>📅 Calendário</div></body>',{runScripts:'dangerously'});
  const w=dom.window;
  try{
    w.eval(script);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    assert.equal(w.document.querySelector('.post-body').textContent,'❤️ Obrigado!');
    assert.equal(w.document.querySelector('option').textContent,'📅 Reunião');
    assert.equal(w.document.querySelectorAll('svg.ag-icon').length,1);
  }finally{w.close();}
});
