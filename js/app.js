/* Célula Ágape — lógica do app (script clássico; os onclick do HTML chamam estas funções). */
'use strict';

const CFG = window.AGAPE_CONFIG;
const {
  esc, idSeguro, loginParaEmail, primeiroNome, inicial, hojeISO, datasDoMes, dataCurta, dataLonga,
  agruparPorMes, proximaSemana, modelosCom, distribuirModelo, paraLocalInput, resumoAlarme,
  dimensoesAlvo, planoCompressao, formatarBytes, LIMITE_IMAGEM, ALVO_IMAGEM, DIAS,
} = window.AgapeUtils;

const db = supabase.createClient(CFG.SUPA_URL, CFG.SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'agape-auth' },
});

const S = {
  me: null, session: null,
  posts: [], semanas: [], funcoes: [],
  users: [], modelos: [], config: {}, dispositivos: [], notifs: [], uso: null,
  perfis: [], permissoes: [],
  postType: 'versiculo', imgPendente: null, publicando: false, palavra: null,
  deferredInstall: null, pushOk: false,
};

const $ = (id) => document.getElementById(id);
const isAdm = () => S.me?.role === 'adm' || S.me?.permissoes?.gerencial === true;
const temPermissao = (chave) => Boolean(S.me?.role === 'adm' || S.me?.permissoes?.[chave] === true);
const hoje = () => hojeISO(CFG.TZ);
const BADGE = { versiculo: '📖 Versículo', mensagem: '💬 Mensagem', aviso: '📢 Aviso' };

// ══════════════════════════════════════════
// UTILIDADES DE INTERFACE
// ══════════════════════════════════════════
function toast(msg, tipo = 'ok') {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast show ' + tipo;
  clearTimeout(t._t); t._t = setTimeout(() => (t.className = 'toast'), 3600);
}
const msgErro = (e, padrao = 'Algo deu errado. Tente novamente.') => {
  const m = String(e?.message || '');
  if (/apenas administradores/i.test(m)) return 'Somente administradores podem fazer isso.';
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para isso.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sem conexão com o servidor.';
  return m && m.length < 160 ? m : padrao;
};
function openSheet(id) { $(id).classList.add('open'); }
function closeSheet(id) { $(id).classList.remove('open'); }
function sheetBg(e, id) { if (e.target === $(id)) closeSheet(id); }
async function comBotao(btn, fn) {
  if (btn?.disabled) return;
  if (btn) btn.disabled = true;
  try { return await fn(); } finally { if (btn) btn.disabled = false; }
}

async function chamarApi(caminho, corpo) {
  const token = S.session?.token || sessionStorage.getItem('agape-session');
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  const r = await fetch(caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}

// ══════════════════════════════════════════
// AUTENTICAÇÃO (Supabase Auth)
// ══════════════════════════════════════════
const COLS_USER = 'id,name,login,role,auth_id,created_at';

async function carregarPerfil(session) {
  const { data, error } = await db.from('users').select(COLS_USER).eq('auth_id', session.user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function restaurarSessao() {
  const token = sessionStorage.getItem('agape-session');
  const perfil = JSON.parse(sessionStorage.getItem('agape-user') || 'null');
  if (token && perfil) { S.me = perfil; S.session = { token, user: { id: perfil.id } }; }
}

function erroLogin(msg) {
  const el = $('login-err'); el.textContent = msg; el.style.display = 'block';
}

async function doLogin() {
  const login = $('li-user').value, senha = $('li-pass').value;
  $('login-err').style.display = 'none';
  if (!login.trim() || !senha) return erroLogin('Informe login e senha.');
  await comBotao($('li-btn'), async () => {
    const r = await fetch('/api/auth-login.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, senha }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return erroLogin(r.status === 401 ? 'Login ou senha incorretos.' : 'Não foi possível entrar agora. Tente de novo.');
  // O AGAPE usa sua própria sessão assinada; o Supabase fica apenas como banco.
  // Não dependemos de Supabase Auth, access_token ou refresh_token no navegador.
  if (!data.token || !data.usuario?.id) {
    return erroLogin('O servidor não retornou uma sessão válida. Tente entrar novamente.');
  }
  sessionStorage.setItem('agape-session', data.token);
    sessionStorage.setItem('agape-user', JSON.stringify(data.usuario));
    S.me = data.usuario; S.session = { token: data.token, user: { id: data.usuario.id } };
    $('li-user').value = ''; $('li-pass').value = '';
    closeSheet('login-sheet');
    await aposLogin();
    toast(`Bem-vindo(a), ${primeiroNome(S.me.name)}!`);
  });
}

async function aposLogin() {
  if (isAdm()) await carregarAdmin().catch((e) => console.warn(e));
  renderTudo();
  sincronizarPush({ silencioso: true });
}

async function doLogout() {
  await removerDispositivoAtual().catch(() => {});
  await db.auth.signOut().catch(() => {});
  sessionStorage.removeItem('agape-session');
  sessionStorage.removeItem('agape-user');
  S.me = null; S.session = null; S.users = []; S.modelos = []; S.dispositivos = []; S.notifs = []; S.pushOk = false;
  closeSheet('conta-sheet');
  goPage('home');
  renderTudo();
  toast('Você saiu da conta.');
}

function atualizarAuth() {
  const nr = $('nav-right'), tb = $('tb-adm'), dla = $('dl-adm'), fab = $('fab-escala');
  if (S.me) {
    const adm = isAdm();
    nr.innerHTML = `
      <button class="user-chip" onclick="abrirConta()" aria-label="Minha conta">
        <div class="u-avatar">${esc(inicial(S.me.name))}</div>
        ${adm ? '<span class="adm-pip">ADM</span>' : ''}
      </button>
      <button class="btn btn-ghost" onclick="doLogout()">Sair</button>`;
    tb.style.display = adm ? '' : 'none';
    if (dla) dla.style.display = adm ? '' : 'none';
    $('compose-area').style.display = 'block';
    $('login-nudge').style.display = 'none';
    $('hac-icon').textContent = '👤';
    $('hac-title').textContent = 'Minha conta';
    $('hac-sub').textContent = 'Senha e notificações';
    $('home-auth-card').onclick = abrirConta;
  } else {
    nr.innerHTML = `<button class="btn btn-primary" onclick="openSheet('login-sheet')">Entrar</button>`;
    tb.style.display = 'none';
    if (dla) dla.style.display = 'none';
    fab.classList.remove('show');
    $('compose-area').style.display = 'none';
    $('login-nudge').style.display = 'block';
    $('hac-icon').textContent = '🔐';
    $('hac-title').textContent = 'Entrar';
    $('hac-sub').textContent = 'Acessar sua conta';
    $('home-auth-card').onclick = () => openSheet('login-sheet');
  }
  atualizarPills();
}

function abrirConta() {
  if (!S.me) return openSheet('login-sheet');
  $('conta-nome').textContent = S.me.name;
  $('conta-login').textContent = `${S.me.login} · ${isAdm() ? 'Administrador' : 'Membro'}`;
  ['conta-senha-atual', 'conta-senha-nova', 'conta-senha-conf'].forEach((i) => ($(i).value = ''));
  renderStatusNotif();
  openSheet('conta-sheet');
}

async function trocarSenha() {
  const atual = $('conta-senha-atual').value, nova = $('conta-senha-nova').value, conf = $('conta-senha-conf').value;
  if (!atual || !nova) return toast('Preencha a senha atual e a nova.', 'warn');
  if (nova.length < 6) return toast('A nova senha precisa ter pelo menos 6 caracteres.', 'warn');
  if (nova !== conf) return toast('A confirmação não confere com a nova senha.', 'warn');
  await comBotao($('conta-senha-btn'), async () => {
    try {
      await chamarApi('/api/admin-users.js', { acao: 'trocar_senha', senhaAtual: atual, senhaNova: nova });
    } catch (e) {
      return toast(/senha atual/i.test(e.message) ? 'Senha atual incorreta.' : msgErro(e, 'Não foi possível trocar a senha.'), 'err');
    }
    ['conta-senha-atual', 'conta-senha-nova', 'conta-senha-conf'].forEach((i) => ($(i).value = ''));
    toast('Senha alterada com sucesso ✅');
  });
}

// ═════════════���════════════════════════════
// CARGA DE DADOS
// ══════════════════════════════════════════
function montarSemanas(semanas, atribs) {
  const porSemana = {};
  atribs.forEach((a) => (porSemana[a.escala_id] ||= []).push(a));
  const porNome = (a, b) => a.user_name.localeCompare(b.user_name, 'pt-BR');
  S.semanas = semanas.map((s) => ({ ...s, atribuicoes: (porSemana[s.id] || []).sort(porNome) }));
}

async function carregarPublico() {
  const [p, s, a, f, palavra] = await Promise.all([
    db.from('posts').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('escala_semanas').select('*').order('date', { ascending: true }),
    db.from('escala_atribuicoes').select('id,escala_id,user_id,user_name,funcao_id,funcao_nome'),
    db.from('escala_funcoes').select('id,nome').order('nome'),
    db.from('palavra_celula').select('titulo,arquivo_path,nome_arquivo,paginas,atualizado_em').maybeSingle(),
  ]);
  for (const r of [p, s, a, f]) if (r.error) throw r.error;
  S.posts = p.data; S.funcoes = f.data;
  S.palavra = palavra.error ? null : palavra.data;
  renderPalavra();
  montarSemanas(s.data, a.data);
}

async function recarregarEscala() {
  const [s, a] = await Promise.all([
    db.from('escala_semanas').select('*').order('date', { ascending: true }),
    db.from('escala_atribuicoes').select('id,escala_id,user_id,user_name,funcao_id,funcao_nome'),
  ]);
  if (s.error || a.error) return;
  montarSemanas(s.data, a.data);
  renderEscalaTudo();
}

async function carregarAdmin() {
  const [u, m, c, d, uso] = await Promise.all([
  chamarApi('/api/admin-users.js', { acao: 'listar' }),
    db.from('escala_modelos').select('*, escala_modelo_itens(*)').order('semanas').order('nome'),
    db.from('config').select('chave,valor'),
    db.rpc('dispositivos_por_usuario'),
    db.rpc('uso_imagens'),
  ]);
  if (u.erro) throw new Error(u.erro);
  S.users = u.usuarios || [];
  S.modelos = (m.data || []).map((x) => ({ ...x, itens: x.escala_modelo_itens || [] }));
  S.config = Object.fromEntries((c.data || []).map((x) => [x.chave, x.valor]));
  S.dispositivos = d.data || [];
  S.uso = uso.data || null;
  try {
    const perfis = await chamarApi('/api/admin-perfis', { acao: 'listar' });
    S.perfis = perfis.perfis || []; S.permissoes = perfis.permissoes || [];
    S.users = (perfis.usuarios || S.users).map((user) => ({ ...user, perfil_id: user.perfil_id }));
  } catch (e) { console.warn('[v0] perfis:', e); }
  }

// ══════════════════════════════════════════
// INÍCIO
// ══════════════════════════════════════════
async function iniciar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('SW:', e));
    navigator.serviceWorker.addEventListener('message', (ev) => {
      if (ev.data?.type === 'push-resubscribe') sincronizarPush({ silencioso: true });
    });
  }
  try {
    await Promise.all([restaurarSessao(), carregarPublico()]);
    $('erro-conexao').style.display = 'none';
  } catch (e) {
    console.error('iniciar:', e);
    $('erro-conexao').style.display = 'flex';
  }
  if (isAdm()) await carregarAdmin().catch((e) => console.warn('admin:', e));
  renderTudo();
  ligarRealtime();
  sincronizarPush({ silencioso: true });
  const pagina = new URL(location.href).searchParams.get('page');
  if (pagina && $('page-' + pagina)) goPage(pagina);
}

async function tentarNovamente() {
  try {
    await Promise.all([restaurarSessao(), carregarPublico()]);
    $('erro-conexao').style.display = 'none';
    if (isAdm()) await carregarAdmin().catch(() => {});
    renderTudo();
  } catch (e) { toast('Ainda sem conexão com o servidor.', 'err'); }
}

function ligarRealtime() {
  db.channel('rt-posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (p) => {
      if (!S.posts.find((x) => x.id === p.new.id)) { S.posts.unshift(p.new); renderPosts(); renderAdmPosts(); }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'posts' }, (p) => {
      S.posts = S.posts.filter((x) => x.id !== p.old.id); renderPosts(); renderAdmPosts();
    })
    .subscribe();
  db.channel('rt-escala')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_semanas' }, () => recarregarEscala())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'escala_atribuicoes' }, () => recarregarEscala())
    .subscribe();
}

function renderTudo() {
  atualizarAuth();
  renderHome(); renderPosts(); renderEscalaTudo(); renderBannerNotif(); renderBannerInstall();
  if (isAdm()) { renderUsers(); renderAdmPosts(); renderModelos(); renderNotifAdm(); }
}
function renderEscalaTudo() { renderEscala(); renderAdmEscala(); renderHome(); }

// ══════════════════════════════════════════
// NAVEGAÇÃO
// ══════════════════════════════════════════
function goPage(id) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-' + id).classList.add('active');
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.page === id));
  document.querySelectorAll('#desktop-links button').forEach((b) =>
    b.classList.toggle('active', (b.getAttribute('onclick') || '').includes(`'${id}'`)));
  $('fab-escala').classList.toggle('show', id === 'escala' && isAdm());
  if (id === 'mural') renderPosts();
  if (id === 'escala') { renderEscala(); renderBannerNotif(); }
  if (id === 'adm') { renderUsers(); renderAdmPosts(); renderAdmEscala(); renderModelos(); renderPerfis(); }
  if (id === 'home') { renderHome(); renderBannerInstall(); renderBannerNotif(); }
  window.scrollTo({ top: 0 });
}

function admTab(id, btn) {
  document.querySelectorAll('.adm-panel').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.adm-tab').forEach((b) => b.classList.remove('active'));
  $('adm-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'notif') carregarNotifAdm();
  if (id === 'modelos') renderModelos();
  if (id === 'usuarios') atualizarDispositivos();
  if (id === 'perfis') renderPerfis();
  if (id === 'palavra') renderPalavra();
}

function renderPalavra() {
  const el = $('palavra-celula-view'); if (!el) return;
  if (!S.palavra) { el.innerHTML = '<div class="empty">A Palavra da Célula ainda não foi publicada.</div>'; return; }
  const url = db.storage.from('palavra-celula').getPublicUrl(S.palavra.arquivo_path).data.publicUrl;
  el.innerHTML = `<h3>${esc(S.palavra.titulo)}</h3><p>${esc(S.palavra.nome_arquivo)} · ${S.palavra.paginas} páginas</p><iframe title="${esc(S.palavra.titulo)}" src="${esc(url)}#page=1&view=FitH"></iframe><a class="btn btn-ghost btn-full" href="${esc(url)}" target="_blank" rel="noopener">Abrir PDF</a>`;
}
async function publicarPalavra(input) {
  if (!temPermissao('palavra')) return toast('Você não tem permissão para alterar a Palavra da Célula.', 'warn');
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  if (file.type !== 'application/pdf' || file.size > 15 * 1024 * 1024) return toast('Envie um PDF de até 15 MB.', 'warn');
  const paginas = Number(prompt('Quantas páginas o PDF possui? (2 a 4)', '2'));
  if (!Number.isInteger(paginas) || paginas < 2 || paginas > 4) return toast('A Palavra precisa ter de 2 a 4 páginas.', 'warn');
  const path = `${S.session.user.id}/palavra-semana.pdf`;
  const up = await db.storage.from('palavra-celula').upload(path, file, { contentType: 'application/pdf', upsert: true });
  if (up.error) return toast(msgErro(up.error, 'Não foi possível enviar o PDF.'), 'err');
  const row = { id: true, titulo: 'Palavra da Célula', arquivo_path: path, nome_arquivo: file.name, paginas, atualizado_por: S.me.id, atualizado_em: new Date().toISOString() };
  const saved = await db.from('palavra_celula').upsert(row).select().single();
  if (saved.error) return toast(msgErro(saved.error, 'Não foi possível salvar a Palavra.'), 'err');
  S.palavra = saved.data; renderPalavra(); toast('Palavra da Célula atualizada.');
}

// ══════════════════════════════════════════
// MURAL
// ══════════════════════════════════════════
function selType(btn) {
  if (btn.dataset.t === 'aviso' && !temPermissao('mural_publicar')) return toast('Você não tem permissão para publicar avisos.', 'warn');
  document.querySelectorAll('.type-pill').forEach((p) => p.classList.remove('sel'));
  btn.classList.add('sel'); S.postType = btn.dataset.t;
}
function atualizarPills() {
  const aviso = document.querySelector('.type-pill[data-t="aviso"]');
  if (aviso) aviso.style.display = isAdm() ? '' : 'none';
  if (S.postType === 'aviso' && !isAdm()) {
    S.postType = 'mensagem';
    document.querySelectorAll('.type-pill').forEach((p) => p.classList.remove('sel'));
    document.querySelector('.type-pill[data-t="mensagem"]')?.classList.add('sel');
  }
}

function urlImagem(path) { return db.storage.from('mural').getPublicUrl(path).data.publicUrl; }

function cardPost(p) {
  const podeExcluir = S.me && (temPermissao('mural_excluir') || S.me.id === p.author_id);
  const data = p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '';
  const tipo = BADGE[p.type] ? p.type : 'mensagem';
  const mediaUrl = p.image_path ? urlImagem(p.image_path) : '';
  const img = p.image_path
    ? (p.media_type === 'video'
      ? `<div class="post-media"><video class="post-img" controls playsinline preload="metadata" src="${esc(mediaUrl)}" aria-label="Vídeo publicado por ${esc(p.author_name)}"></video><button class="media-expand" onclick="abrirMidia('${esc(mediaUrl)}','video')" aria-label="Expandir vídeo">⤢</button></div>`
      : `<div class="post-media"><img class="post-img" loading="lazy" decoding="async" alt="Imagem publicada por ${esc(p.author_name)}" src="${esc(mediaUrl)}" data-full="${esc(mediaUrl)}" ${p.image_w && p.image_h ? `width="${Number(p.image_w)}" height="${Number(p.image_h)}"` : ''}><button class="media-expand" onclick="abrirMidia('${esc(mediaUrl)}','image')" aria-label="Expandir imagem">⤢</button></div>`)
    : '';
  return `<div class="post-card">
    <div class="post-top">
      <div class="post-avatar">${esc(inicial(p.author_name))}</div>
      <div class="post-meta-txt">
        <div class="post-author">${esc(p.author_name || 'Membro')}</div>
        <div class="post-date">${esc(data)}</div>
      </div>
      <span class="post-badge badge-${tipo}">${BADGE[tipo]}</span>
    </div>
    ${p.content ? `<div class="post-body${tipo === 'versiculo' ? ' is-versiculo' : ''}">${esc(p.content)}</div>` : ''}
    ${img}
    ${podeExcluir ? `<div class="post-actions"><button class="btn-del-post" onclick="deletarPost('${idSeguro(p.id)}')">🗑 Excluir</button></div>` : ''}
  </div>`;
}

function renderPosts() {
  $('posts-list').innerHTML = S.posts.length
    ? S.posts.map(cardPost).join('')
    : '<div class="empty"><span class="ico">📋</span>Nenhuma publicação ainda.</div>';
}
function renderAdmPosts() {
  const el = $('adm-posts-list'); if (!el) return;
  el.innerHTML = S.posts.length ? S.posts.map(cardPost).join('') : '<div class="empty"><span class="ico">📋</span>Nenhum post.</div>';
}

// ── imagens: compactação no aparelho antes de enviar ──
let _suportaWebp = null;
async function suportaWebp() {
  if (_suportaWebp !== null) return _suportaWebp;
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const b = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.5));
  return (_suportaWebp = b?.type === 'image/webp');
}
async function decodificarImagem(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* tenta o próximo */ }
    try { return await createImageBitmap(file); } catch (_) { /* cai no <img> */ }
  }
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não foi possível ler essa imagem.')); };
    img.src = url;
  });
}

async function comprimirImagem(file) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 25 MB).');
  const origem = await decodificarImagem(file);
  const w0 = origem.width || origem.naturalWidth, h0 = origem.height || origem.naturalHeight;
  const mime = (await suportaWebp()) ? 'image/webp' : 'image/jpeg';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let melhor = null;
  for (const passo of planoCompressao()) {
    const { w, h } = dimensoesAlvo(w0, h0, passo.maxDim);
    canvas.width = w; canvas.height = h;
    if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }   // JPEG não tem transparência
    ctx.drawImage(origem, 0, 0, w, h);
    const blob = await new Promise((ok) => canvas.toBlob(ok, mime, passo.q));
    if (!blob) continue;
    if (!melhor || blob.size < melhor.blob.size) melhor = { blob, w, h };
    if (blob.size <= ALVO_IMAGEM) break;
  }
  origem.close?.();
  if (!melhor) throw new Error('Não foi possível compactar essa imagem.');
  if (melhor.blob.size > LIMITE_IMAGEM) throw new Error('Mesmo compactada, a imagem passou de 300 KB. Escolha outra.');
  return { ...melhor, mime: melhor.blob.type || mime, ext: melhor.blob.type === 'image/webp' ? 'webp' : 'jpg' };
}

async function lerVideo(file) {
  if (!file.type.startsWith('video/')) throw new Error('Escolha uma imagem ou vídeo.');
  if (file.size > 100 * 1024 * 1024) throw new Error('Vídeo muito grande (máximo 100 MB).');
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error('Não foi possível ler esse vídeo.'));
      video.src = url;
    });
    if (!Number.isFinite(duration) || duration > 60.5) throw new Error('O vídeo precisa ter no máximo 1 minuto.');
    return { blob: file, mime: file.type, ext: file.type === 'video/webm' ? 'webm' : file.type === 'video/quicktime' ? 'mov' : 'mp4', mediaType: 'video', duration, previewUrl: url };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}

async function escolherImagem(input) {
  if (!temPermissao('uploads')) return toast('Você não tem permissão para enviar imagens ou vídeos.', 'warn');
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const button = $('img-btn');
  button.disabled = true; button.textContent = '⏳ Preparando…';
  try {
    const r = file.type.startsWith('video/') ? await lerVideo(file) : { ...(await comprimirImagem(file)), mediaType: 'image', duration: null, previewUrl: URL.createObjectURL(file) };
    removerImagemPendente();
    S.imgPendente = r;
    const preview = r.mediaType === 'video'
      ? `<video src="${esc(r.previewUrl)}" controls playsinline preload="metadata" aria-label="Pré-visualização do vídeo"></video>`
      : `<img src="${esc(r.previewUrl)}" alt="Pré-visualização da imagem">`;
    $('img-preview').innerHTML = `${preview}
      <span class="img-info">${r.mediaType === 'video' ? `${Math.ceil(r.duration)}s · ` : `${r.w}×${r.h} · `}${formatarBytes(r.blob.size)}</span>
      <button class="img-x" onclick="removerImagemPendente()" aria-label="Remover mídia">✕</button>`;
    $('img-preview').style.display = 'block';
  } catch (e) { toast(msgErro(e, 'Não foi possível usar essa mídia.'), 'err'); }
  finally { button.disabled = false; button.textContent = '📷 Foto ou vídeo'; }
}
function removerImagemPendente() {
  if (S.imgPendente?.previewUrl) URL.revokeObjectURL(S.imgPendente.previewUrl);
  S.imgPendente = null;
  $('img-preview').innerHTML = ''; $('img-preview').style.display = 'none';
}

const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);

async function addPost() {
  if (!S.me || S.publicando) return;
  const content = $('post-text').value.trim();
  if (!content && !S.imgPendente) return toast('Escreva algo ou escolha uma foto ou vídeo.', 'warn');
  if (S.postType === 'aviso' && !temPermissao('mural_publicar')) return toast('Você não tem permissão para publicar avisos.', 'warn');

  S.publicando = true; $('publish-btn').disabled = true; $('publish-btn').textContent = 'Publicando…';
  let caminho = null;
  try {
    const img = S.imgPendente;
    if (img) {
      // O Storage valida a primeira pasta contra auth.uid(), que é o auth_id do perfil,
      // não contra o id interno de public.users usado pela sessão própria do Ágape.
      const pastaUsuario = S.me.auth_id || S.session.user.id;
      caminho = `${pastaUsuario}/${novoId()}.${img.ext}`;
      const up = await db.storage.from('mural').upload(caminho, img.blob, { contentType: img.mime, cacheControl: '31536000', upsert: false });
      if (up.error) {
        if (/mime type.*not supported|not supported/i.test(up.error.message || '') && img.mediaType === 'video') {
          throw new Error('O Storage ainda não foi atualizado para vídeos. Execute a migração supabase/05_mural_palavra_limpeza.sql no Supabase e tente novamente.');
        }
        throw up.error;
      }
    }
    const postPayload = {
      type: S.postType, content, author_id: S.me.id, author_name: S.me.name,
      image_path: caminho, image_w: img?.w ?? null, image_h: img?.h ?? null, image_bytes: img?.blob.size ?? null,
      media_type: img?.mediaType ?? 'image', media_duration: img?.duration ?? null,
    };
    let result = await db.from('posts').insert(postPayload).select().single();
    // Permite publicar fotos em projetos que ainda não aplicaram a migração de vídeo.
    if (result.error && /media_duration|media_type|schema cache|column.*posts/i.test(result.error.message || '')) {
      const legacyPayload = { ...postPayload };
      delete legacyPayload.media_type;
      delete legacyPayload.media_duration;
      result = await db.from('posts').insert(legacyPayload).select().single();
    }
    if (result.error) { if (caminho) db.storage.from('mural').remove([caminho]); throw result.error; }
    const { data } = result;
    if (!S.posts.find((x) => x.id === data.id)) S.posts.unshift(data);
    $('post-text').value = ''; removerImagemPendente();
    renderPosts(); renderAdmPosts();
    toast(S.postType === 'aviso' ? 'Aviso publicado — os membros serão notificados 📢' : 'Publicado ✅');
  } catch (e) { toast(msgErro(e, 'Não foi possível publicar.'), 'err'); }
  finally { S.publicando = false; $('publish-btn').disabled = false; $('publish-btn').textContent = 'Publicar'; }
}

async function deletarPost(id) {
  const p = S.posts.find((x) => x.id === id);
  if (!p || !confirm('Excluir esta publicação?')) return;
  const { error } = await db.from('posts').delete().eq('id', id);
  if (error) return toast(msgErro(error, 'Não foi possível excluir.'), 'err');
  if (p.image_path) db.storage.from('mural').remove([p.image_path]).catch(() => {});
  S.posts = S.posts.filter((x) => x.id !== id);
  renderPosts(); renderAdmPosts();
  toast('Publicação excluída.');
}

function abrirImagem(url) { abrirMidia(url, 'image'); }
function abrirMidia(url, tipo = 'image') {
  const box = $('lightbox');
  $('lightbox-img').style.display = tipo === 'image' ? 'block' : 'none';
  $('lightbox-video').style.display = tipo === 'video' ? 'block' : 'none';
  if (tipo === 'image') $('lightbox-img').src = url;
  else { $('lightbox-video').src = url; $('lightbox-video').play().catch(() => {}); }
  box.classList.add('open');
}
function fecharImagem() { $('lightbox').classList.remove('open'); $('lightbox-img').src = ''; $('lightbox-video').pause(); $('lightbox-video').src = ''; }

// ══════════════════════════════════════════
// ESCALA — exibição
// ══════════════════════════════════════════
function chipsAtrib(atribs) {
  const mostrarFn = S.funcoes.length > 1;
  const porPessoa = new Map();
  atribs.forEach((a) => {
    const k = a.user_id || a.user_name;
    if (!porPessoa.has(k)) porPessoa.set(k, { nome: a.user_name, fns: [] });
    porPessoa.get(k).fns.push(a.funcao_nome);
  });
  if (!porPessoa.size) return '<span class="hint">Ninguém escalado ainda.</span>';
  return [...porPessoa.values()].map((p) => `
    <div class="member-chip">
      <div class="member-chip-av">${esc(inicial(p.nome))}</div>
      ${esc(primeiroNome(p.nome))}${mostrarFn ? `<span class="chip-fn">${esc(p.fns.join(' · '))}</span>` : ''}
    </div>`).join('');
}

function cardSemana(s, ctx, admin) {
  const eProx = s.id === ctx.proxId;
  const eHoje = s.date === ctx.hoje;
  const minha = !!S.me && s.atribuicoes.some((a) => a.user_id === S.me.id);
  const passada = s.date < ctx.hoje;
  const alarme = resumoAlarme(s, CFG.TZ);
  const badge = minha && !passada ? '<span class="esc-badge mine">É a sua vez</span>'
    : eHoje ? '<span class="esc-badge hoje">Hoje</span>'
    : eProx ? '<span class="esc-badge">Próxima</span>' : '';
  const id = idSeguro(s.id);
  return `<div class="escala-card${eProx ? ' current' : ''}${minha ? ' minha' : ''}${passada ? ' passada' : ''}">
    <div class="esc-header">
      <div class="esc-num">${s.numero}</div>
      <div class="esc-header-info">
        <div class="esc-date">${esc(dataLonga(s.date))}</div>
        <div class="esc-week-label">Semana ${s.numero} de ${s.total}</div>
      </div>
      ${badge}
    </div>
    <div class="esc-members">${chipsAtrib(s.atribuicoes)}</div>
    ${admin ? `<div class="esc-footer">
      <div class="alarm-indicator${alarme ? ' set' : ''}"><div class="alarm-dot"></div><span>${alarme ? '🔔 ' + esc(alarme) : 'Sem lembretes'}</span></div>
      <div class="esc-actions">
        <button class="btn-sm-icon" onclick="abrirSemana('${id}')" aria-label="Editar semana">✏️</button>
        <button class="btn-sm-icon" onclick="deletarSemana('${id}')" aria-label="Excluir semana">🗑</button>
      </div>
    </div>` : ''}
  </div>`;
}

function htmlEscalaLista(admin) {
  if (!S.semanas.length) {
    return `<div class="empty"><span class="ico">🧁</span>Nenhuma escala cadastrada ainda.${admin ? '<br>Crie um modelo e gere o mês.' : ''}</div>`;
  }
  const h = hoje();
  const prox = proximaSemana(S.semanas, h);
  const ctx = { hoje: h, proxId: prox?.id };
  const mesAtual = h.slice(0, 7);
  const grupos = agruparPorMes(S.semanas);
  const atuais = grupos.filter((g) => g.chave >= mesAtual);
  const passados = grupos.filter((g) => g.chave < mesAtual).reverse();
  const blocoMes = (g) => `
    <div class="mes-hdr"><h3>${esc(g.titulo)}</h3><span>${g.itens.length} célula${g.itens.length > 1 ? 's' : ''}</span></div>
    <div class="escala-list">${g.itens.map((s) => cardSemana(s, ctx, admin)).join('')}</div>`;
  return atuais.map(blocoMes).join('')
    + (passados.length ? `<details class="esc-past"><summary>Meses anteriores (${passados.length})</summary>${passados.map(blocoMes).join('')}</details>` : '');
}

function minhaProxima() {
  if (!S.me) return null;
  const h = hoje();
  return S.semanas.filter((s) => s.date >= h && s.atribuicoes.some((a) => a.user_id === S.me.id))
    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
}

function renderEscala() {
  const m = minhaProxima();
  const fns = m ? [...new Set(m.atribuicoes.filter((a) => a.user_id === S.me.id).map((a) => a.funcao_nome))].join(', ') : '';
  $('minha-vez').innerHTML = m
    ? `<div class="prox-banner"><div class="pb-icon">🙋</div><div>
         <div class="pb-label">Sua próxima vez</div><div class="pb-name">${esc(dataLonga(m.date))}</div>
         <div class="pb-date">${esc(fns)}</div></div></div>` : '';
  $('esc-toolbar').style.display = isAdm() ? 'flex' : 'none';
  $('escala-list').innerHTML = htmlEscalaLista(false);
}
function renderAdmEscala() {
  const el = $('adm-escala-list'); if (el) el.innerHTML = htmlEscalaLista(true);
}

function renderHome() {
  const el = $('prox-home');
  const p = proximaSemana(S.semanas, hoje());
  if (!p) { el.innerHTML = ''; return; }
  const nomes = [...new Set(p.atribuicoes.map((a) => primeiroNome(a.user_name)))].join(' & ') || '—';
  el.innerHTML = `<div class="prox-banner" onclick="goPage('escala')" style="cursor:pointer">
    <div class="pb-icon">🧁</div>
    <div><div class="pb-label">Próximo lanche</div><div class="pb-name">${esc(nomes)}</div>
    <div class="pb-date">${esc(dataLonga(p.date))}</div></div></div>`;
}

// ══════════════════════════════════════════
// ESCALA — edição de uma semana
// ══════════════════════════════════════════
const opcoesUsuarios = (sel) => '<option value="">Escolha a pessoa…</option>'
  + S.users.map((u) => `<option value="${idSeguro(u.id)}"${u.id === sel ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
const opcoesFuncoes = (sel) => S.funcoes.map((f, i) =>
  `<option value="${idSeguro(f.id)}"${(sel ? f.id === sel : i === 0) ? ' selected' : ''}>${esc(f.nome)}</option>`).join('');

function linhaAtribHtml(userId = '', funcaoId = '') {
  return `<div class="atrib-row">
    <select class="atrib-user" aria-label="Pessoa">${opcoesUsuarios(userId)}</select>
    <select class="atrib-fn" aria-label="Função"${S.funcoes.length > 1 ? '' : ' style="display:none"'}>${opcoesFuncoes(funcaoId)}</select>
    <button class="btn-sm-icon" type="button" onclick="this.closest('.atrib-row').remove()" aria-label="Remover">✕</button>
  </div>`;
}
function addLinhaAtrib(containerId) { $(containerId).insertAdjacentHTML('beforeend', linhaAtribHtml()); }
function preencherAtribs(containerId, linhas) {
  $(containerId).innerHTML = (linhas.length ? linhas : [{}]).map((l) => linhaAtribHtml(l.user_id, l.funcao_id)).join('');
}
function lerAtribs(containerId) {
  const vistos = new Set(), saida = [];
  $(containerId).querySelectorAll('.atrib-row').forEach((row) => {
    const user_id = row.querySelector('.atrib-user').value;
    const funcao_id = row.querySelector('.atrib-fn').value || null;
    const k = `${user_id}|${funcao_id}`;
    if (user_id && !vistos.has(k)) { vistos.add(k); saida.push({ user_id, funcao_id }); }
  });
  return saida;
}

function proximaDataCelula() {
  const dia = Number(S.config.celula_dia_semana ?? 5);
  const h = hoje(); const [a, m] = h.split('-').map(Number);
  const todas = [...datasDoMes(a, m, dia), ...datasDoMes(m === 12 ? a + 1 : a, m === 12 ? 1 : m + 1, dia)];
  return todas.find((d) => d >= h) || h;
}

function alternarAlarmeSemana() { $('sem-alarm-opcoes').style.display = $('sem-alarm-on').checked ? 'block' : 'none'; }

function abrirSemana(id) {
  if (!isAdm()) return;
  const s = id ? S.semanas.find((x) => x.id === id) : null;
  $('sem-titulo').textContent = s ? 'Editar semana' : 'Nova semana avulsa';
  $('sem-id').value = s?.id || '';
  $('sem-date').value = s?.date || proximaDataCelula();
  preencherAtribs('sem-atribs', (s?.atribuicoes || []).map((a) => ({ user_id: a.user_id, funcao_id: a.funcao_id })));
  const temAlarme = !!(s && (s.alarm_ts || s.alarm_semana));
  $('sem-alarm-on').checked = s ? temAlarme : true;
  $('sem-alarm-dt').value = s?.alarm_ts ? paraLocalInput(s.alarm_ts, CFG.TZ) : `${$('sem-date').value}T17:00`;
  $('sem-alarm-semana').checked = s ? !!s.alarm_semana : true;
  $('sem-alarm-1d').checked = s ? !!s.alarm_1d : true;
  $('sem-alarm-3h').checked = !!s?.alarm_3h;
  $('sem-alarm-30m').checked = !!s?.alarm_30m;
  alternarAlarmeSemana();
  openSheet('semana-sheet');
}

async function salvarSemana() {
  const date = $('sem-date').value;
  if (!date) return toast('Informe a data da célula.', 'warn');
  const on = $('sem-alarm-on').checked;
  const dt = $('sem-alarm-dt').value;
  const d1 = on && $('sem-alarm-1d').checked, h3 = on && $('sem-alarm-3h').checked, m30 = on && $('sem-alarm-30m').checked;
  if ((d1 || h3 || m30) && !dt) return toast('Informe a data e hora do lembrete principal.', 'warn');
  const atribuicoes = lerAtribs('sem-atribs');
  if (!atribuicoes.length && !confirm('Nenhuma pessoa foi escolhida — ninguém será notificado. Salvar assim mesmo?')) return;
  await comBotao($('sem-btn'), async () => {
    const { error } = await db.rpc('salvar_semana', { p: {
      id: $('sem-id').value || null, date,
      alarm_local: on && dt ? dt : null,
      alarm_semana: on && $('sem-alarm-semana').checked, alarm_1d: d1, alarm_3h: h3, alarm_30m: m30,
      atribuicoes,
    } });
    if (error) return toast(msgErro(error, 'Não foi possível salvar.'), 'err');
    closeSheet('semana-sheet');
    await recarregarEscala();
    toast('Semana salva ✅');
  });
}

async function deletarSemana(id) {
  if (!confirm('Excluir esta semana da escala? Os lembretes pendentes serão cancelados.')) return;
  const { error } = await db.from('escala_semanas').delete().eq('id', id);
  if (error) return toast(msgErro(error, 'Não foi possível excluir.'), 'err');
  await recarregarEscala();
  toast('Semana excluída.');
}

// ══════════════════════════════════════════
// ESCALA — modelos (templates 3/4/5 semanas)
// ══════════════════════════════════════════
function renderModelos() {
  const el = $('adm-modelos-lista'); if (!el) return;
  const dia = Number(S.config.celula_dia_semana ?? 5);
  $('cfg-dia').value = String(dia);
  $('cfg-hora').value = S.config.celula_hora || '19:30';
  $('cfg-hora-semana').value = S.config.hora_aviso_semana || '09:00';
  if (!S.modelos.length) {
    el.innerHTML = '<div class="empty"><span class="ico">🗂️</span>Nenhum modelo ainda.<br>Crie um modelo para cada tamanho de mês (3, 4 ou 5 células).</div>';
    return;
  }
  el.innerHTML = S.modelos.map((m) => {
    const semanas = Array.from({ length: m.semanas }, (_, i) => {
      const nomes = m.itens.filter((x) => x.semana === i + 1).map((x) => primeiroNome(x.user_name));
      return `<div class="mod-linha"><b>S${i + 1}</b> ${nomes.length ? esc([...new Set(nomes)].join(', ')) : '<span class="hint">—</span>'}</div>`;
    }).join('');
    const id = idSeguro(m.id);
    return `<div class="form-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="flex:1;min-width:0"><div class="user-name">${esc(m.nome)}</div>
        <div class="user-login">${m.semanas} semanas · lembrete ${esc(String(m.hora_alarme).slice(0, 5))}</div></div>
        <button class="btn-sm-icon" onclick="abrirModelo('${id}')" aria-label="Editar modelo">✏️</button>
        <button class="btn-sm-icon" onclick="deletarModelo('${id}')" aria-label="Excluir modelo">🗑</button>
      </div>
      ${semanas}
      <button class="btn btn-accent btn-full" style="height:42px;margin-top:10px" onclick="abrirGerarMes('${id}')">Usar em um mês</button>
    </div>`;
  }).join('');
}

async function salvarConfig() {
  const linhas = [
    { chave: 'celula_dia_semana', valor: $('cfg-dia').value },
    { chave: 'celula_hora', valor: $('cfg-hora').value || '19:30' },
    { chave: 'hora_aviso_semana', valor: $('cfg-hora-semana').value || '09:00' },
  ];
  const { error } = await db.from('config').upsert(linhas.map((l) => ({ ...l, atualizado_em: new Date().toISOString() })), { onConflict: 'chave' });
  if (error) return toast(msgErro(error), 'err');
  linhas.forEach((l) => (S.config[l.chave] = l.valor));
  toast('Configurações salvas ✅');
}

let _modSemanas = 4;
function lerModeloDoDom() {
  const itens = [];
  document.querySelectorAll('#mod-semanas-lista .mod-sem').forEach((bloco) => {
    const semana = Number(bloco.dataset.semana);
    lerAtribs(bloco.querySelector('.atrib-list').id).forEach((a) => itens.push({ semana, ...a }));
  });
  return itens;
}
function renderModeloSemanas(itens) {
  $('mod-semanas-lista').innerHTML = Array.from({ length: _modSemanas }, (_, i) => `
    <div class="mod-sem" data-semana="${i + 1}">
      <div class="mod-sem-hdr">Semana ${i + 1}</div>
      <div class="atrib-list" id="mod-atribs-${i + 1}"></div>
      <button class="btn-add" type="button" onclick="addLinhaAtrib('mod-atribs-${i + 1}')">＋ Responsável</button>
    </div>`).join('');
  for (let i = 1; i <= _modSemanas; i++) preencherAtribs(`mod-atribs-${i}`, itens.filter((x) => x.semana === i));
  document.querySelectorAll('#mod-seg button').forEach((b) => b.classList.toggle('sel', Number(b.dataset.n) === _modSemanas));
}
function escolherSemanasModelo(n) {
  const itens = lerModeloDoDom().filter((x) => x.semana <= n);
  _modSemanas = n;
  renderModeloSemanas(itens);
}

function abrirModelo(id, semanasPadrao) {
  if (!isAdm()) return;
  const m = id ? S.modelos.find((x) => x.id === id) : null;
  _modSemanas = m?.semanas || semanasPadrao || 4;
  $('mod-titulo').textContent = m ? 'Editar modelo' : 'Novo modelo de escala';
  $('mod-id').value = m?.id || '';
  $('mod-nome').value = m?.nome || `Mês de ${_modSemanas} semanas`;
  $('mod-hora').value = m ? String(m.hora_alarme).slice(0, 5) : '17:00';
  $('mod-semana').checked = m ? m.alarm_semana : true;
  $('mod-1d').checked = m ? m.alarm_1d : true;
  $('mod-3h').checked = m ? m.alarm_3h : false;
  $('mod-30m').checked = m ? m.alarm_30m : false;
  renderModeloSemanas((m?.itens || []).map((x) => ({ semana: x.semana, user_id: x.user_id, funcao_id: x.funcao_id })));
  closeSheet('mes-sheet');
  openSheet('modelo-sheet');
}

async function salvarModelo() {
  const nome = $('mod-nome').value.trim();
  if (!nome) return toast('Dê um nome ao modelo.', 'warn');
  const itens = lerModeloDoDom();
  const vazias = Array.from({ length: _modSemanas }, (_, i) => i + 1).filter((n) => !itens.some((x) => x.semana === n));
  if (vazias.length && !confirm(`A(s) semana(s) ${vazias.join(', ')} está(ão) sem responsável. Salvar assim mesmo?`)) return;
  await comBotao($('mod-btn'), async () => {
    const { error } = await db.rpc('salvar_modelo', { p: {
      id: $('mod-id').value || null, nome, semanas: _modSemanas, hora_alarme: $('mod-hora').value || '17:00',
      alarm_semana: $('mod-semana').checked, alarm_1d: $('mod-1d').checked, alarm_3h: $('mod-3h').checked, alarm_30m: $('mod-30m').checked,
      itens,
    } });
    if (error) return toast(msgErro(error, 'Não foi possível salvar o modelo.'), 'err');
    await carregarAdmin(); renderModelos();
    closeSheet('modelo-sheet');
    toast('Modelo salvo ✅');
  });
}

async function deletarModelo(id) {
  if (!confirm('Excluir este modelo? As escalas já geradas continuam como estão.')) return;
  const { error } = await db.from('escala_modelos').delete().eq('id', id);
  if (error) return toast(msgErro(error), 'err');
  await carregarAdmin(); renderModelos();
  toast('Modelo excluído.');
}

// ── gerar o mês a partir de um modelo ──
const _mes = { datas: [], rot: 0 };

function abrirGerarMes(modeloId) {
  if (!isAdm()) return;
  if (!S.modelos.length) { toast('Crie um modelo primeiro.', 'warn'); abrirModelo(null, 4); return; }
  const dia = Number(S.config.celula_dia_semana ?? 5);
  const h = hoje(); const [a, m] = h.split('-').map(Number);
  const restantes = datasDoMes(a, m, dia).some((d) => d >= h);
  const [aa, mm] = restantes ? [a, m] : (m === 12 ? [a + 1, 1] : [a, m + 1]);
  $('mes-input').value = `${aa}-${String(mm).padStart(2, '0')}`;
  $('mes-dia').value = String(dia);
  $('mes-subst').checked = false;
  _mes.rot = 0; _mes.modeloPref = modeloId || null;
  atualizarDatasMes(true);
  openSheet('mes-sheet');
}

function atualizarDatasMes(reset) {
  const [a, m] = ($('mes-input').value || '').split('-').map(Number);
  if (!a || !m) return;
  const dia = Number($('mes-dia').value);
  const marcadas = new Set(reset ? [] : [...document.querySelectorAll('#mes-datas input:checked')].map((i) => i.value));
  _mes.datas = datasDoMes(a, m, dia);
  const existentes = new Set(S.semanas.map((s) => s.date));
  $('mes-datas').innerHTML = _mes.datas.map((d) => `
    <label class="chk"><input type="checkbox" value="${d}" ${(reset || marcadas.has(d) || !marcadas.size) ? 'checked' : ''} onchange="atualizarPreviaMes()">
      ${esc(dataLonga(d))}${existentes.has(d) ? ' <span class="pill warn">já tem escala</span>' : ''}</label>`).join('');
  atualizarPreviaMes();
}

function girarRodizio(delta) { _mes.rot += delta; $('mes-rot').textContent = String(_mes.rot); atualizarPreviaMes(); }

function atualizarPreviaMes() {
  const datas = [...document.querySelectorAll('#mes-datas input:checked')].map((i) => i.value);
  const n = datas.length;
  const cand = modelosCom(S.modelos, n);
  const aviso = $('mes-aviso'), btn = $('mes-btn'), sel = $('mes-modelo');
  $('mes-rot').textContent = String(_mes.rot);
  $('mes-info').textContent = `${n} célula${n === 1 ? '' : 's'} neste mês`;
  const existentes = new Set(S.semanas.map((s) => s.date));
  const temConflito = datas.some((d) => existentes.has(d));
  $('mes-subst-wrap').style.display = temConflito ? 'block' : 'none';

  if (!n) { aviso.innerHTML = ''; sel.innerHTML = ''; $('mes-previa').innerHTML = ''; btn.disabled = true; return; }
  if (!cand.length) {
    sel.innerHTML = '';
    aviso.innerHTML = `<div class="aviso-box err">Não há modelo de <b>${n} semana${n > 1 ? 's' : ''}</b>. Crie um para este tamanho de mês.
      <br><button class="btn-add" style="margin-top:8px" onclick="abrirModelo(null, ${n})">＋ Criar modelo de ${n} semanas</button></div>`;
    $('mes-previa').innerHTML = ''; btn.disabled = true; return;
  }
  aviso.innerHTML = '';
  const atual = sel.value && cand.some((c) => c.id === sel.value) ? sel.value
    : (cand.find((c) => c.id === _mes.modeloPref)?.id || cand[0].id);
  sel.innerHTML = cand.map((c) => `<option value="${idSeguro(c.id)}"${c.id === atual ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  const modelo = cand.find((c) => c.id === atual);
  const dist = distribuirModelo(modelo.itens, datas, _mes.rot);
  $('mes-previa').innerHTML = dist.map((d) => `
    <div class="mes-prev-line"><span>${esc(dataLonga(d.data))}</span>
    <b>${d.itens.length ? esc([...new Set(d.itens.map((i) => primeiroNome(i.user_name)))].join(', ')) : '—'}</b></div>`).join('');
  btn.disabled = false;
}

async function gerarMes() {
  const datas = [...document.querySelectorAll('#mes-datas input:checked')].map((i) => i.value);
  const modeloId = $('mes-modelo').value;
  if (!datas.length || !modeloId) return;
  await comBotao($('mes-btn'), async () => {
    const dia = $('mes-dia').value;
    if (String(S.config.celula_dia_semana ?? '5') !== dia) {
      const { error: e0 } = await db.from('config').upsert({ chave: 'celula_dia_semana', valor: dia, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
      if (!e0) S.config.celula_dia_semana = dia;
    }
    const { data, error } = await db.rpc('aplicar_modelo', {
      p_modelo: modeloId, p_datas: datas, p_rotacao: _mes.rot, p_substituir: $('mes-subst').checked });
    if (error) return toast(msgErro(error, 'Não foi possível gerar a escala.'), 'err');
    closeSheet('mes-sheet');
    await recarregarEscala();
    const txt = [`${data.criadas} semana(s) criada(s)`];
    if (data.substituidas) txt.push(`${data.substituidas} substituída(s)`);
    if (data.ignoradas) txt.push(`${data.ignoradas} ignorada(s) por já existirem`);
    toast(txt.join(' · ') + ' ✅');
  });
}

// ══════════════════════════════════════════
// USUÁRIOS (ADM)
// ══════════════════════════════════════════
function renderUsers() {
  const el = $('user-list'); if (!el) return;
  const disp = Object.fromEntries(S.dispositivos.map((d) => [d.user_id, d.dispositivos]));
  el.innerHTML = S.users.map((u) => {
    const id = idSeguro(u.id), n = disp[u.id] ?? 0, eu = u.id === S.me?.id;
    return `<div class="user-row">
      <div class="user-av">${esc(inicial(u.name))}</div>
      <div class="user-info"><div class="user-name">${esc(u.name)}</div>
        <div class="user-login">${esc(u.login)} · ${n ? `🔔 ${n}` : '🔕 sem aparelho'}</div></div>
      <span class="role-tag role-${u.role === 'adm' ? 'adm' : 'membro'}">${u.role === 'adm' ? '⭐ ADM' : 'Membro'}</span>
      <button class="btn-sm-icon" onclick="abrirSenhaUsuario('${id}')" aria-label="Redefinir senha">🔑</button>
      ${eu ? '' : `<button class="btn-sm-icon" onclick="alternarPerfil('${id}')" aria-label="Alternar perfil">⭐</button>
      <button class="btn-sm-icon" onclick="deleteUser('${id}')" aria-label="Excluir usuário">🗑</button>`}
    </div>`;
  }).join('');
}

async function atualizarDispositivos() {
  const { data } = await db.rpc('dispositivos_por_usuario');
  if (data) { S.dispositivos = data; renderUsers(); }
}

async function addUser() {
  const nome = $('new-name').value.trim(), login = $('new-login').value.trim(), senha = $('new-pass').value, perfil = $('new-role').value;
  if (!nome || !login || !senha) return toast('Preencha nome, login e senha.', 'warn');
  await comBotao($('new-user-btn'), async () => {
    try {
      await chamarApi('/api/admin-users', { acao: 'criar', nome, login, senha, perfil });
      ['new-name', 'new-login', 'new-pass'].forEach((i) => ($(i).value = ''));
      await carregarAdmin(); renderUsers();
      toast('Usuário criado ✅');
    } catch (e) { toast(msgErro(e, 'Não foi possível criar o usuário.'), 'err'); }
  });
}
async function deleteUser(id) {
  const u = S.users.find((x) => x.id === id);
  if (!u || !confirm(`Excluir ${u.name}? Ele deixa de acessar o app e sai das escalas.`)) return;
  try {
    await chamarApi('/api/admin-users', { acao: 'excluir', id });
    await carregarAdmin(); await recarregarEscala(); renderUsers(); renderModelos();
    toast('Usuário excluído.');
  } catch (e) { toast(msgErro(e), 'err'); }
}
async function alternarPerfil(id) {
  const u = S.users.find((x) => x.id === id); if (!u) return;
  const novo = u.role === 'adm' ? 'membro' : 'adm';
  if (!confirm(`Tornar ${u.name} ${novo === 'adm' ? 'ADMINISTRADOR' : 'membro comum'}?`)) return;
  try {
    await chamarApi('/api/admin-users', { acao: 'alterar_perfil', id, perfil: novo });
    await carregarAdmin(); renderUsers();
    toast('Perfil atualizado ✅');
  } catch (e) { toast(msgErro(e), 'err'); }
}
function abrirSenhaUsuario(id) {
  const u = S.users.find((x) => x.id === id); if (!u) return;
  $('senha-user-id').value = id; $('senha-user-nome').textContent = u.name; $('senha-user-nova').value = '';
  openSheet('senha-sheet');
}
async function salvarSenhaUsuario() {
  const senha = $('senha-user-nova').value;
  if (senha.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.', 'warn');
  await comBotao($('senha-user-btn'), async () => {
    try {
      await chamarApi('/api/admin-users', { acao: 'redefinir_senha', id: $('senha-user-id').value, senha });
      closeSheet('senha-sheet'); toast('Senha redefinida ✅');
    } catch (e) { toast(msgErro(e), 'err'); }
  });
}

// ══════════════════════════════════════════
// NOTIFICAÇÕES PUSH (aparelho)
// ══════════════════════════════════════════
const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ehInstalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function vapidParaBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
function mesmaChave(a, b) {
  if (!a) return true;                      // navegador não informa: assume igual
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

function estadoNotif() {
  if (!S.me) return { tipo: 'login' };
  if (ehIOS() && !ehInstalado()) return { tipo: 'ios-instalar' };
  if (!suportaPush()) return { tipo: 'sem-suporte' };
  if (Notification.permission === 'denied') return { tipo: 'bloqueado' };
  if (Notification.permission === 'granted' && S.pushOk) return { tipo: 'ok' };
  return { tipo: 'ativar' };
}

async function sincronizarPush({ silencioso = true } = {}) {
  if (!S.me || !suportaPush() || Notification.permission !== 'granted') return { ok: false, motivo: 'sem-permissao' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const chave = vapidParaBytes(CFG.VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();
    // Inscrição feita com outra chave VAPID nunca receberia nada: refaz.
    if (sub && !mesmaChave(sub.options?.applicationServerKey, chave)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave });
    const { error } = await db.rpc('registrar_dispositivo', {
      p_endpoint: sub.endpoint, p_subscription: JSON.stringify(sub.toJSON()), p_user_agent: navigator.userAgent.slice(0, 200) });
    if (error) throw error;
    S.pushOk = true;
    renderBannerNotif(); renderStatusNotif();
    return { ok: true };
  } catch (e) {
    console.warn('sincronizarPush:', e);
    S.pushOk = false;
    if (!silencioso) toast('Não foi possível ativar as notificações neste aparelho.', 'err');
    return { ok: false, motivo: e?.message };
  }
}

async function ativarNotificacoes() {
  const est = estadoNotif();
  if (est.tipo === 'login') return openSheet('login-sheet');
  if (est.tipo === 'ios-instalar') return toast('No iPhone: toque em Compartilhar → "Adicionar à Tela de Início" e abra o app por lá.', 'warn');
  if (est.tipo === 'sem-suporte') return toast('Este navegador não suporta notificações.', 'warn');
  if (est.tipo === 'bloqueado') return toast('As notificações estão bloqueadas. Libere nas configurações do navegador/app.', 'warn');
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') { renderBannerNotif(); renderStatusNotif(); return toast('Sem permissão, não dá para avisar você.', 'warn'); }
  const r = await sincronizarPush({ silencioso: false });
  if (r.ok) toast('Notificações ativadas neste aparelho ✅');
  renderBannerNotif(); renderStatusNotif();
}

async function removerDispositivoAtual() {
  if (!suportaPush() || !S.me) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await db.rpc('remover_dispositivo', { p_endpoint: sub.endpoint });
}

async function testarNotificacao(userId) {
  try {
    const r = await chamarApi('/api/test-push', userId ? { userId } : {});
    if (r.total === 0) return toast(r.mensagem || 'Nenhum aparelho cadastrado.', 'warn');
    if (r.entregues > 0) return toast(`Teste enviado para ${r.entregues} de ${r.total} aparelho(s) 🔔`);
    toast(`Falhou: ${(r.falhas || []).join('; ') || 'sem detalhes'}`, 'err');
  } catch (e) { toast(msgErro(e, 'Não foi possível enviar o teste.'), 'err'); }
}

const TEXTOS_NOTIF = {
  ok: ['ok', '✅ Ativas neste aparelho', 'Você receberá os lembretes da escala e os avisos.'],
  ativar: ['warn', '🔔 Ainda não ativadas', 'Ative para ser avisado quando for a sua vez.'],
  bloqueado: ['err', '🚫 Bloqueadas', 'Libere as notificações nas configurações do navegador ou do app instalado.'],
  'ios-instalar': ['warn', '📲 Instale o app primeiro', 'No iPhone, toque em Compartilhar → “Adicionar à Tela de Início” e abra o app por lá.'],
  'sem-suporte': ['err', '⚠️ Sem suporte', 'Este navegador não suporta notificações. Tente o Chrome, Edge, Firefox ou o app instalado.'],
  login: ['neutro', '', ''],
};

function renderBannerNotif() {
  const est = estadoNotif();
  for (const id of ['notif-banner-escala', 'notif-banner-home']) {
    const el = $(id); if (!el) continue;
    if (est.tipo === 'ok' || est.tipo === 'login') { el.innerHTML = ''; continue; }
    const [, titulo, sub] = TEXTOS_NOTIF[est.tipo];
    const podeAtivar = est.tipo === 'ativar';
    el.innerHTML = `<div class="notif-banner">
      <span style="font-size:1.8rem;flex-shrink:0">🔔</span>
      <div class="nb-text"><div class="nb-title">${esc(titulo.replace(/^\S+\s/, ''))}</div><div class="nb-sub">${esc(sub)}</div></div>
      ${podeAtivar ? `<button class="btn btn-accent" style="height:36px;padding:0 14px;font-size:.8rem;flex-shrink:0" onclick="ativarNotificacoes()">Ativar</button>` : ''}
    </div>`;
  }
}

function renderStatusNotif() {
  const el = $('conta-notif'); if (!el) return;
  const est = estadoNotif();
  const [cls, titulo, sub] = TEXTOS_NOTIF[est.tipo] || TEXTOS_NOTIF.ativar;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span class="pill ${cls}">${esc(titulo)}</span></div>
    <div class="hint" style="margin:0 0 10px">${esc(sub)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${est.tipo === 'ativar' ? '<button class="btn btn-accent" onclick="ativarNotificacoes()">Ativar notificações</button>' : ''}
      ${est.tipo === 'ok' ? '<button class="btn btn-primary" onclick="testarNotificacao()">Enviar notificação de teste</button>' : ''}
    </div>`;
}

// ══════════════════════════════════════════
// PAINEL DE NOTIFICAÇÕES (ADM)
// ══════════════════════════════════════════
const KIND = { semana: 'início da semana', '1d': '1 dia antes', '3h': '3 h antes', '30m': '30 min antes', main: 'lembrete principal', aviso: 'aviso do mural' };
const STATUS = {
  pendente: ['neutro', 'aguardando'], enviando: ['neutro', 'enviando'], enviada: ['ok', 'enviada'],
  expirada: ['err', 'não entregue'], cancelada: ['neutro', 'cancelada'],
};

async function carregarNotifAdm() {
  if (!isAdm()) return;
  const [d, n, uso] = await Promise.all([
    db.rpc('dispositivos_por_usuario'),
    db.from('notificacoes').select('id,kind,tipo,fire_at,status,tentativas,dispositivos_ok,ultimo_erro,users(name)')
      .order('fire_at', { ascending: false }).limit(40),
    db.rpc('uso_imagens'),
  ]);
  if (d.data) S.dispositivos = d.data;
  if (n.data) S.notifs = n.data;
  if (uso.data) S.uso = uso.data;
  renderNotifAdm(); renderUsers();
}

function renderNotifAdm() {
  const el = $('adm-notif-conteudo'); if (!el) return;
  const disp = S.dispositivos.map((d) => `
    <div class="disp-row">
      <div class="user-av">${esc(inicial(d.name))}</div>
      <div style="flex:1;min-width:0"><div class="user-name">${esc(d.name)}</div></div>
      <span class="pill ${d.dispositivos ? 'ok' : 'warn'}">${d.dispositivos ? `${d.dispositivos} aparelho${d.dispositivos > 1 ? 's' : ''}` : 'sem aparelho'}</span>
      ${d.dispositivos ? `<button class="btn-sm-icon" onclick="testarNotificacao('${idSeguro(d.user_id)}')" aria-label="Enviar teste">🔔</button>` : ''}
    </div>`).join('') || '<div class="hint">Nenhum usuário.</div>';
  const fila = S.notifs.map((x) => {
    const [cls, rot] = STATUS[x.status] || ['neutro', x.status];
    const quando = new Date(x.fire_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: CFG.TZ });
    return `<div class="notif-linha">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
        <b>${esc(x.users?.name || '—')}</b><span class="pill ${cls}">${esc(rot)}${x.status === 'enviada' ? ` · ${x.dispositivos_ok}` : ''}</span></div>
      <div class="hint">${esc(quando)} · ${esc(KIND[x.kind] || x.kind)}${x.tentativas > 1 ? ` · ${x.tentativas} tentativas` : ''}</div>
      ${x.ultimo_erro && x.status !== 'enviada' ? `<div class="hint" style="color:var(--danger)">${esc(x.ultimo_erro)}</div>` : ''}
    </div>`;
  }).join('') || '<div class="hint">Nenhuma notificação registrada ainda.</div>';
  const uso = S.uso ? `${S.uso.arquivos} mídia(s) · ${formatarBytes(Number(S.uso.bytes))} usados no mural` : '';
  el.innerHTML = `
    <div class="form-card"><h3>Aparelhos que recebem avisos</h3>
      <div class="hint" style="margin:-8px 0 8px">Quem está “sem aparelho” não recebe nada — peça para abrir o app instalado e tocar em “Ativar notificações”.</div>
      ${disp}</div>
    <div class="form-card"><h3>Últimas notificações</h3>${fila}
      <button class="btn btn-ghost btn-full" style="height:42px;margin-top:10px" onclick="carregarNotifAdm()">↻ Atualizar</button></div>
    ${uso ? `<div class="hint" style="text-align:center;margin-top:8px">🖼️ ${esc(uso)}</div>` : ''}`;
}

// ══════════════════════════════════════════
// INSTALAÇÃO DO PWA
// ══════════════════════════════════════════
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.deferredInstall = e; renderBannerInstall(); });
window.addEventListener('appinstalled', () => {
  S.deferredInstall = null; $('install-banner-home').innerHTML = ''; toast('App instalado! 🎉');
});
function renderBannerInstall() {
  const el = $('install-banner-home');
  if (!el || !S.deferredInstall) return;
  el.innerHTML = `<div class="install-banner">
    <div class="ib-icon">📲</div>
    <div class="ib-text"><div class="ib-title">Instalar o App</div><div class="ib-sub">Necessário para receber notificações no iPhone</div></div>
    <button class="ib-btn" onclick="instalarPWA()">Instalar</button>
    <button class="ib-close" onclick="dispensarInstall()" aria-label="Fechar">✕</button>
  </div>`;
}
async function instalarPWA() {
  if (!S.deferredInstall) return;
  S.deferredInstall.prompt(); await S.deferredInstall.userChoice; S.deferredInstall = null;
  $('install-banner-home').innerHTML = '';
}
function dispensarInstall() { S.deferredInstall = null; $('install-banner-home').innerHTML = ''; }

// ═════════════════���════════════════════════
// EVENTOS GLOBAIS + PARTIDA
// ══════════════════════════════════════════
document.addEventListener('click', (e) => {
  const img = e.target.closest?.('.post-img');
  if (img?.dataset.full) abrirImagem(img.dataset.full);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharImagem(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.me) sincronizarPush({ silencioso: true });
});

window.S = S;
window.chamarApi = chamarApi;
window.carregarAdmin = carregarAdmin;
window.toast = toast;
window.msgErro = msgErro;

iniciar();
