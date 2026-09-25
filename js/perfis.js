/* Perfis de permissão do AGAPE — carregado como script clássico. */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.renderPerfis = function renderPerfis() {
    if (!window.S?.permissoes) return;
    $('perm-checks').innerHTML = window.S.permissoes.map(([key, label]) => `<label class="perm-item"><input type="checkbox" data-perm="${esc(key)}"><span>${esc(label)}</span></label>`).join('');
    $('perm-profile-list').innerHTML = window.S.perfis.map((p) => `<div class="user-row"><div class="user-info"><div class="user-name">${esc(p.nome)}</div><div class="user-login">${esc(p.descricao || 'Sem descrição')}</div></div><span class="role-tag">${Object.values(p.permissoes || {}).filter(Boolean).length} permissões</span><button class="btn-sm-icon" onclick="editarPerfilPermissao('${esc(p.id)}')" aria-label="Editar perfil">✎</button><button class="btn-sm-icon" onclick="excluirPerfilPermissao('${esc(p.id)}')" aria-label="Excluir perfil">🗑</button></div>`).join('') || '<div class="empty">Nenhum perfil cadastrado.</div>';
    $('perm-user-list').innerHTML = window.S.users.map((u) => `<div class="user-row"><div class="user-info"><div class="user-name">${esc(u.name)}</div><div class="user-login">${esc(u.login)}</div></div><select aria-label="Perfil de ${esc(u.name)}" onchange="vincularPerfilPermissao('${esc(u.id)}',this.value)"><option value="">Sem perfil</option>${window.S.perfis.map((p) => `<option value="${esc(p.id)}"${p.id === u.perfil_id ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>`).join('') || '<div class="empty">Nenhum usuário cadastrado.</div>';
  };
  window.novoPerfilPermissao = function () {
    $('perm-profile-id').value = ''; $('perm-profile-name').value = ''; $('perm-profile-description').value = '';
    document.querySelectorAll('[data-perm]').forEach((input) => { input.checked = false; });
  };
  window.editarPerfilPermissao = function (id) {
    const p = window.S.perfis.find((item) => item.id === id); if (!p) return;
    $('perm-profile-id').value = p.id; $('perm-profile-name').value = p.nome; $('perm-profile-description').value = p.descricao || '';
    document.querySelectorAll('[data-perm]').forEach((input) => { input.checked = p.permissoes?.[input.dataset.perm] === true; });
  };
  window.salvarPerfilPermissao = async function () {
    const nome = $('perm-profile-name').value.trim(); if (!nome) return window.toast('Informe o nome do perfil.', 'warn');
    const permissoes = Object.fromEntries([...document.querySelectorAll('[data-perm]')].map((input) => [input.dataset.perm, input.checked]));
    try { await window.chamarApi('/api/admin-perfis', { acao: 'salvar', id: $('perm-profile-id').value || undefined, nome, descricao: $('perm-profile-description').value, permissoes });
      $('perm-profile-id').value = ''; $('perm-profile-name').value = ''; $('perm-profile-description').value = '';
      document.querySelectorAll('[data-perm]').forEach((input) => { input.checked = false; });
      await window.carregarAdmin(); renderPerfis(); window.toast('Perfil criado.'); }
    catch (e) { window.toast(window.msgErro(e, 'Não foi possível salvar o perfil.'), 'err'); }
  };
  window.excluirPerfilPermissao = async function (id) {
    if (!confirm('Excluir este perfil?')) return;
    try { await window.chamarApi('/api/admin-perfis', { acao: 'excluir', id }); await window.carregarAdmin(); renderPerfis(); window.toast('Perfil excluído.'); }
    catch (e) { window.toast(window.msgErro(e), 'err'); }
  };
  window.vincularPerfilPermissao = async function (userId, id) {
    try { await window.chamarApi('/api/admin-perfis', { acao: 'vincular', id, userId }); await window.carregarAdmin(); renderPerfis(); window.toast('Perfil vinculado.'); }
    catch (e) { window.toast(window.msgErro(e), 'err'); }
  };
})();
