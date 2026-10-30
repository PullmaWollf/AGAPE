/* Ágape: alternância claro/escuro persistente, sem interferir na sessão. */
(function(){
  'use strict';
  const root=document.documentElement;
  const key='agape-theme';
  const media=window.matchMedia?.('(prefers-color-scheme: dark)');
  function atualizar(){
    const dark=root.dataset.theme==='dark';
    const btn=document.getElementById('theme-toggle');
    if(btn){
      btn.setAttribute('aria-label',dark?'Ativar modo claro':'Ativar modo escuro');
      btn.setAttribute('aria-pressed',String(dark));
      btn.title=dark?'Ativar modo claro':'Ativar modo escuro';
      const ico=btn.querySelector('.theme-toggle-icon');
      if(ico)ico.textContent=dark?'☀':'☾';
      const label=btn.querySelector('.theme-toggle-label');
      if(label)label.textContent=dark?'Claro':'Escuro';
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#21171e':'#8d2946');
  }
  function definir(modo,salvar=true){
    const dark=modo==='dark';
    root.dataset.theme=dark?'dark':'light';
    if(salvar)try{localStorage.setItem(key,dark?'dark':'light');}catch(e){}
    atualizar();
  }
  function toggle(){definir(root.dataset.theme==='dark'?'light':'dark');}
  window.agapeTheme={toggle,definir};
  atualizar();
  media?.addEventListener?.('change',e=>{
    try{if(localStorage.getItem(key))return;}catch(err){return;}
    definir(e.matches?'dark':'light',false);
  });
})();