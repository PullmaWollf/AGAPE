/* ÁGAPE — gestão das chamadas no Painel ADM.
 * Camada adicional: mantém intactos a Chamada MATCH e os Relatórios.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state = { tipo: 'todas', chamadas: [], total: 0, pagina: 0, carregando: false, cancelando: false, pedido: 0 };
  const autorizado = () => {
    const me = window.S?.me;
    return !!me && ['adm','admin','administrador'].includes(String(me.role || '').toLowerCase())
      && me.permissoes?.chamada_registrar === true;
  };
  const dataBR = iso => /^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))
    ? iso.slice(8,10) + '/' + iso.slice(5,7) + '/' + iso.slice(0,4) : 'Data indisponível';
  const horarioBR = iso => {
    if (!iso) return 'Não informado';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? 'Não informado' :
      new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
      }).format(d);
  };
  function status(mensagem, erro = false) {
    const el = $('adm-chamadas-status');
    if (!el) return;
    el.textContent = mensagem;
    el.classList.toggle('error', erro);
  }
  function atualizarAcesso() {
    const tab = $('adm-tab-chamadas');
    if (tab) tab.hidden = !autorizado();
    if (!autorizado() && $('adm-chamadas')?.classList.contains('active')) {
      window.goPage('home');
    }
  }
  const nomeTipo = tipo => tipo === 'culto' ? 'Culto' : 'Célula';
  function renderizar() {
    const lista = $('adm-chamadas-lista');
    const total = $('adm-chamadas-total');
    const mais = $('adm-chamadas-mais');
    if (!lista || !total || !mais) return;
    total.textContent = state.total === 1 ? '1 chamada registrada' : state.total + ' chamadas registradas';
    if (!state.chamadas.length) {
      lista.innerHTML = '<div class="adm-chamadas-vazio">📅 Nenhuma chamada salva ainda. Quando uma reunião for registrada na Chamada MATCH, ela aparecerá aqui automaticamente.</div>';
    } else {
      lista.innerHTML = state.chamadas.map(c => `<article class="adm-chamada-item">
        <div class="adm-chamada-topo">
          <div class="adm-chamada-data"><span class="adm-chamada-calendario" aria-hidden="true">📅</span>
            <div><strong>${esc(dataBR(c.data_celula))}</strong><small>${esc(nomeTipo(c.tipo))} · Reunião registrada</small></div>
          </div>
          <span class="adm-chamada-situacao">${c.tipo==='culto'?'⛪ Culto':'❤️ Célula'}</span>
        </div>
        <div class="adm-chamada-numeros">
          <span class="adm-chamada-presente"><strong>${Number(c.presentes) || 0}</strong> presentes</span>
          <span class="adm-chamada-ausente"><strong>${Number(c.ausentes) || 0}</strong> faltas</span>
          <span><strong>${(Number(c.presentes) || 0) + (Number(c.ausentes) || 0)}</strong> participantes</span>
        </div>
        <p class="adm-chamada-meta">Registrada por: <strong>${esc(c.registrado_por_nome || 'Não informado')}</strong> · ${esc(horarioBR(c.criado_em))}</p>
        <div class="adm-chamada-acoes">
          <button type="button" class="btn btn-ghost" data-adm-ver="${esc(c.data_celula)}" data-tipo="${esc(c.tipo||'celula')}">👁 Ver / corrigir</button>
          <button type="button" class="btn adm-chamada-cancelar" data-adm-cancelar="${esc(c.id)}" data-data="${esc(c.data_celula)}" data-tipo="${esc(c.tipo||'celula')}">🗑️ Cancelar chamada</button>
        </div>
      </article>`).join('');
    }
    mais.hidden = state.chamadas.length >= state.total;
    mais.disabled = state.carregando || state.cancelando;
    mais.textContent = 'Carregar mais chamadas';
  }
  async function carregar({ mais = false } = {}) {
    if (!autorizado() || state.carregando || state.cancelando) return;
    const pedido = ++state.pedido;
    state.tipo = $('adm-chamadas-tipo')?.value || 'todas';
    state.carregando = true;
    const proximaPagina = mais ? state.pagina + 1 : 1;
    status(mais ? 'Carregando mais chamadas…' : 'Consultando chamadas registradas…');
    const btnMais = $('adm-chamadas-mais');
    const btnAtualizar = $('adm-chamadas-atualizar');
    if (btnMais) btnMais.disabled = true;
    if (btnAtualizar) btnAtualizar.disabled = true;
    try {
      const resposta = await window.chamarApi('/api/admin-chamadas', {
        acao: 'listar', pagina: proximaPagina, tipo: state.tipo
      });
      if (pedido !== state.pedido) return;
      state.chamadas = mais ? [...state.chamadas, ...(resposta.chamadas || [])] : (resposta.chamadas || []);
      state.total = resposta.total || 0;
      state.pagina = proximaPagina;
      renderizar();
      status(state.total ? 'Escolha uma reunião para conferir ou cancelar.' :
        'Nenhuma chamada salva. Registre uma chamada para começar.');
    } catch (erro) {
      status(erro.message || 'Não foi possível consultar as chamadas. Tente novamente.', true);
    } finally {
      state.carregando = false;
      if (btnMais) btnMais.disabled = false;
      if (btnAtualizar) btnAtualizar.disabled = false;
    }
  }
  async function cancelar(id, data, tipo) {
    if (!autorizado() || state.cancelando || state.carregando) return;
    const chamada = state.chamadas.find(c => c.id === id && c.data_celula === data && c.tipo === tipo);
    if (!chamada) return status('Esta chamada não está mais na lista. Atualize.', true);
    const aviso = 'Cancelar DEFINITIVAMENTE a chamada de ' + nomeTipo(tipo) + ' de ' + dataBR(data) +
      '?\n\nSerão excluídas ' + ((Number(chamada.presentes) || 0) + (Number(chamada.ausentes) || 0)) +
      ' marcações de presença/falta e a reunião deixará de aparecer nos relatórios.\n\nEsta ação não pode ser desfeita.';
    if (!window.confirm(aviso)) return;
    state.cancelando = true;
    status('Cancelando a chamada de ' + nomeTipo(tipo) + ' de ' + dataBR(data) + '…');
    $('adm-chamadas-lista')?.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
    const mais = $('adm-chamadas-mais'), atualizar = $('adm-chamadas-atualizar');
    if (mais) mais.disabled = true;
    if (atualizar) atualizar.disabled = true;
    try {
      await window.chamarApi('/api/admin-chamadas', { acao: 'cancelar', id, data, tipo });
      window.agapeFrequencia?.invalidar?.();
      window.toast('Chamada de ' + dataBR(data) + ' cancelada.');
      state.cancelando = false;
      await carregar();
    } catch (erro) {
      status(erro.message || 'Não foi possível cancelar a chamada.', true);
      state.cancelando = false;
      renderizar();
    } finally {
      if (mais) mais.disabled = false;
      if (atualizar) atualizar.disabled = false;
    }
  }
  async function abrir() {
    atualizarAcesso();
    if (!autorizado()) return;
    await carregar();
  }
  $('adm-chamadas-lista')?.addEventListener('click', event => {
    const ver = event.target.closest('[data-adm-ver]');
    if (ver) {
      if (!autorizado() || state.cancelando) return;
      window.agapeChamada?.abrir(ver.dataset.admVer,ver.dataset.tipo);
      return;
    }
    const excluir = event.target.closest('[data-adm-cancelar]');
    if (excluir) cancelar(excluir.dataset.admCancelar, excluir.dataset.data, excluir.dataset.tipo);
  });
  $('adm-chamadas-tipo')?.addEventListener('change', () => carregar());
  $('adm-chamadas-atualizar')?.addEventListener('click', () => carregar());
  $('adm-chamadas-mais')?.addEventListener('click', () => carregar({ mais: true }));
  window.agapeAdminChamadas = { abrir, carregar, atualizarAcesso };
  atualizarAcesso();
})();
