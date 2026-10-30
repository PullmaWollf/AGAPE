/* Ágape — ícones de interface em SVG, sem dependência externa.
 * Substitui apenas pictogramas conhecidos da interface, inclusive conteúdo
 * montado dinamicamente. Nunca processa campos editáveis ou mensagens do mural.
 */
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';
const paths={
home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>',
book:'<path d="M12 7v14"/><path d="M3 18V5a2 2 0 0 1 2-2h3a4 4 0 0 1 4 4 4 4 0 0 1 4-4h3a2 2 0 0 1 2 2v13h-5a4 4 0 0 0-4 3 4 4 0 0 0-4-3z"/>',
clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5.5h6V3H9z"/><path d="M9 11h6M9 15h6"/>',
calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
map:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
settings:'<path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18"/><circle cx="12" cy="12" r="4"/>',
users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
chart:'<path d="M4 20V12M10 20V5M16 20v-9M22 20v-6"/>',
message:'<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.8-5A8.7 8.7 0 1 1 21 11.5Z"/>',
megaphone:'<path d="m3 11 14-6v14L3 13z"/><path d="M7 14v6h4l-1-5M20 9a4 4 0 0 1 0 6"/>',
camera:'<path d="M14 4H9L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="14" r="3.5"/>',
car:'<path d="M5 17H3v-5l2-6h14l2 6v5h-2"/><path d="M5 17h14M5 12h14"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/>',
globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
church:'<path d="M12 2v7M9 5h6M4 21V11l8-5 8 5v10M4 14h16M10 21v-5h4v5"/>',
hand:'<path d="M8 13V7a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-2a7 7 0 0 1-5.5-2.7L3 16a1.6 1.6 0 0 1 2.5-2Z"/>',
mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
bot:'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M9 3h6M1 12v4M23 12v4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 17h6"/>',
apple:'<path d="M12 7c-2-4-7-4-9 0-3 5 1 14 5 14 2 0 2-1 4-1s2 1 4 1c4 0 8-9 5-14-2-4-7-4-9 0Z"/><path d="M12 7c0-3 2-5 5-5"/>',
laptop:'<rect x="4" y="4" width="16" height="13" rx="1"/><path d="M2 21h20l-2-4H4z"/>',
bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
belloff:'<path d="M18 8a6 6 0 0 0-10-4M6 8c0 7-3 7-3 9h14M10 21h4M3 3l18 18"/>',
lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/>',
trash:'<path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
check:'<path d="m4 12 5 5L20 6"/>',
edit:'<path d="m4 20 4-.8L20 7.3 16.7 4 4.8 15.9z"/><path d="m14.5 6.2 3.3 3.3"/>',
folder:'<path d="M3 6h7l2 2h9v12H3z"/>',
key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M18 5l3 3"/>',
star:'<path d="m12 2 3.1 6.4 7 .9-5.1 5 .9 7-5.9-3.3-5.9 3.3.9-7-5.1-5 7-.9z"/>',
ban:'<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
gift:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18"/><path d="M12 9c-7 0-7-6-3-6 2 0 3 3 3 6Zm0 0c7 0 7-6 3-6-2 0-3 3-3 6Z"/>',
alert:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
download:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
moon:'<path d="M20 15.3A8.8 8.8 0 0 1 8.7 4a9 9 0 1 0 11.3 11.3Z"/>',
sparkle:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
coffee:'<path d="M4 8h14v7a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6zM18 9h2a3 3 0 0 1 0 6h-2M7 3v2M12 3v2"/>',
handshake:'<path d="m2 12 5-5 4 2 4-2 7 5-5 7-5-3-3 3-7-7Z"/><path d="m7 7 3-2h4l3 2"/>',
person:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
};
const map={
'🏠':'home','📖':'book','📋':'clipboard','🧁':'coffee','📍':'map','⚙️':'settings','⚙':'settings',
'🙋':'users','📊':'chart','💬':'message','📢':'megaphone','📷':'camera','📅':'calendar',
'🚗':'car','🌎':'globe','❤️':'heart','❤':'heart','⛪':'church','👆':'hand',
'🎤':'mic','🤖':'bot','🍎':'apple','💻':'laptop','🔔':'bell','🔕':'belloff',
'🔐':'lock','🔑':'key','🗑️':'trash','🗑':'trash','✅':'check','✏️':'edit','✏':'edit',
'🗂️':'folder','🗂':'folder','⭐':'star','🚫':'ban','🖼️':'image','🖼':'image',
'🎉':'sparkle','⚠️':'alert','⚠':'alert','📲':'download','⏳':'clock',
'🤝':'handshake','👤':'person','👁️':'eye','👁':'eye','☀️':'sun','☀':'sun',
'☾':'moon','＋':'plus'
};
paths.plus='<path d="M12 5v14M5 12h14"/>';
const tokens=Object.keys(map).sort((a,b)=>b.length-a.length);
const rx=new RegExp(tokens.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu');
function svg(name){
  const el=document.createElementNS(NS,'svg');
  el.setAttribute('viewBox','0 0 24 24');
  el.setAttribute('fill','none');
  el.setAttribute('stroke','currentColor');
  el.setAttribute('stroke-width','1.8');
  el.setAttribute('stroke-linecap','round');
  el.setAttribute('stroke-linejoin','round');
  el.setAttribute('class','ag-icon');
  el.setAttribute('aria-hidden','true');
  el.innerHTML=paths[name]||paths.heart;
  return el;
}
function blocked(node){
  const parent=node.parentElement;
  return !parent||!!parent.closest('script,style,noscript,svg,textarea,input,select,option,code,pre,[contenteditable],.post-body,.post-text,.post-content,.comment-body');
}
function convertText(node){
  if(blocked(node)||!node.nodeValue||!rx.test(node.nodeValue)){rx.lastIndex=0;return;}
  rx.lastIndex=0;
  const str=node.nodeValue,fragment=document.createDocumentFragment();
  let last=0,match;
  while((match=rx.exec(str))){
    if(match.index>last)fragment.appendChild(document.createTextNode(str.slice(last,match.index)));
    fragment.appendChild(svg(map[match[0]]));
    last=rx.lastIndex;
  }
  if(last<str.length)fragment.appendChild(document.createTextNode(str.slice(last)));
  node.replaceWith(fragment);
  rx.lastIndex=0;
}
function scan(root){
  if(root.nodeType===3){convertText(root);return;}
  if(root.nodeType!==1&&root.nodeType!==9&&root.nodeType!==11)return;
  if(root.nodeType===1&&root.matches('script,style,noscript,svg,textarea,input,select,option,code,pre,[contenteditable]'))return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const list=[];
  while(walker.nextNode())list.push(walker.currentNode);
  list.forEach(convertText);
}
function init(){
  scan(document.body);
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData'){scan(record.target);continue;}
      for(const node of record.addedNodes)scan(node);
    }
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
window.agapeIcon=svg;
})();
