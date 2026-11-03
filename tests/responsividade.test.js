import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/agape-ui-foundation.css', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

test('camada de responsividade é carregada após os estilos de domínio', () => {
  const last = html.indexOf('/css/agape-ui-foundation.css');
  for (const file of ['agape-home-v2.css', 'agape-presenca-dark.css', 'agape-extras.css']) {
    assert.ok(last > html.indexOf('/css/' + file), file + ' deve vir antes da foundation');
  }
  assert.equal((html.match(/href="\/css\/agape-extras\.css/g) || []).length, 1);
});

test('layout tem breakpoints para telefone, tablet e desktop', () => {
  for (const value of ['max-width: 355px', 'max-width: 480px', 'max-width: 768px', 'min-width: 1100px']) {
    assert.ok(css.includes(value), 'breakpoint ausente: ' + value);
  }
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.match(css, /overflow-x: auto/);
});

test('PWA inclui a camada visual no cache de recursos estáticos', () => {
  assert.ok(sw.includes("'/css/agape-ui-foundation.css'"));
  assert.ok(sw.includes("'/css/agape-extras.css'"));
  assert.ok(sw.includes("url.pathname.startsWith('/api/')"));
});
