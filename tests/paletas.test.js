import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js=readFileSync(new URL('../js/agape-extras.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/agape-palettes.css',import.meta.url),'utf8');
const api=readFileSync(new URL('../api-routes/agape-extras.js',import.meta.url),'utf8');
const theme=readFileSync(new URL('../js/theme.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
test('10 opções, 5 por modo, com validação no backend',()=>{
  const light=['rose','ocean','emerald','indigo','amber'];
  const dark=['wine','midnight','forest','graphite','violet'];
  for(const id of [...light,...dark])assert.ok(js.includes("id:'"+id+"'"));
  assert.ok(api.includes("['"+light.join("','")+"']"));
  assert.ok(api.includes("['"+dark.join("','")+"']"));
  assert.match(js,/paletaLight:'rose',paletaDark:'wine'/);
  assert.match(api,/const layout=\{paletaLight,paletaDark/);
});
test('tema mantém escolha por modo e carrega CSS',()=>{
  assert.match(theme,/agape:theme-change/);
  assert.match(js,/addEventListener\('agape:theme-change',paletaAplicar\)/);
  assert.match(css,/data-theme="light"\]\[data-palette="ocean"/);
  assert.match(css,/data-theme="dark"\]\[data-palette="midnight"/);
  assert.match(html,/\/css\/agape-palettes\.css/);
  assert.match(sw,/\/css\/agape-palettes\.css/);
});
