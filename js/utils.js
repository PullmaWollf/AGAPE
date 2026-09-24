/* Funções puras do app (sem DOM, sem rede) — testadas em tests/utils.test.js.
   Carregado como script clássico (window.AgapeUtils) e também importável no Node. */
(function (raiz) {
  'use strict';

  const TZ_PADRAO = 'America/Sao_Paulo';
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const pad = (n) => String(n).padStart(2, '0');

  /** Escapa texto para inserir em innerHTML (conteúdo e atributos). */
  function esc(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
  }

  /** IDs vêm do banco (uuid), mas nunca vão para um onclick sem checagem. */
  function idSeguro(id) {
    return /^[0-9a-fA-F-]{8,40}$/.test(String(id)) ? String(id) : '';
  }

  // ── Login → e-mail interno (igual a api/_lib/login.js; há teste de paridade) ──
  function normalizarLogin(login) {
    return String(login ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  function loginParaEmail(login, dominio) {
    return `${normalizarLogin(login)}@${dominio || 'celulaagape.app'}`;
  }

  const primeiroNome = (n) => String(n ?? '').trim().split(/\s+/)[0] || '';
  const inicial = (n) => (String(n ?? '').trim()[0] || '?').toUpperCase();

  // ── Datas (sempre strings 'YYYY-MM-DD', sem depender do fuso do aparelho) ──
  function hojeISO(tz = TZ_PADRAO, agora = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
    return p; // en-CA → YYYY-MM-DD
  }

  function diaDaSemana(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  }

  /** Todas as datas do mês (mes = 1..12) que caem no dia da semana informado (0=domingo … 6=sábado). */
  function datasDoMes(ano, mes, diaSemana) {
    const saida = [];
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    for (let d = 1; d <= ultimo; d++) {
      if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === Number(diaSemana)) saida.push(`${ano}-${pad(mes)}-${pad(d)}`);
    }
    return saida;
  }

  const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const dataLonga = (iso) => `${DIAS[diaDaSemana(iso)]}, ${dataCurta(iso)}`;
  function tituloMes(chave) {            // '2026-09' → 'Setembro de 2026'
    const [a, m] = chave.split('-').map(Number);
    const nome = MESES[m - 1];
    return `${nome[0].toUpperCase()}${nome.slice(1)} de ${a}`;
  }

  /** Agrupa semanas por mês e numera dentro do mês ("Semana 2 de 4"). */
  function agruparPorMes(semanas) {
    const ordenadas = [...semanas].sort((a, b) => a.date.localeCompare(b.date));
    const mapa = new Map();
    for (const s of ordenadas) {
      const chave = s.date.slice(0, 7);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(s);
    }
    return [...mapa.entries()].map(([chave, itens]) => ({
      chave, titulo: tituloMes(chave),
      itens: itens.map((s, i) => ({ ...s, numero: i + 1, total: itens.length })),
    }));
  }

  const proximaSemana = (semanas, hoje) =>
    [...semanas].sort((a, b) => a.date.localeCompare(b.date)).find((s) => s.date >= hoje) || null;

  // ── Modelos ──
  const modelosCom = (modelos, n) => modelos.filter((m) => m.semanas === n);

  /**
   * Reproduz a regra de public.aplicar_modelo: a i-ésima data (ordenada) recebe os itens
   * da semana ((i-1+rotacao) mod N)+1 do modelo.
   */
  function distribuirModelo(itens, datas, rotacao = 0) {
    const ordenadas = [...new Set(datas)].sort();
    const n = ordenadas.length;
    return ordenadas.map((data, i) => {
      const sem = ((((i + rotacao) % n) + n) % n) + 1;
      return { data, semanaModelo: sem, itens: itens.filter((x) => x.semana === sem) };
    });
  }

  /** ISO (UTC) → 'YYYY-MM-DDTHH:MM' no fuso da igreja (valor de <input type="datetime-local">). */
  function paraLocalInput(iso, tz = TZ_PADRAO) {
    if (!iso) return '';
    const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
    return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
  }

  function resumoAlarme(s, tz = TZ_PADRAO) {
    const extras = [s.alarm_semana && 'início da semana', s.alarm_1d && '1 dia antes', s.alarm_3h && '3 h antes', s.alarm_30m && '30 min antes'].filter(Boolean);
    if (!s.alarm_ts && !s.alarm_semana) return '';
    const hora = s.alarm_ts ? paraLocalInput(s.alarm_ts, tz).slice(11) : '';
    const base = s.alarm_ts ? `às ${hora}` : '';
    return [base, extras.length ? `+ ${extras.join(', ')}` : ''].filter(Boolean).join(' ');
  }

  // ── Imagens do mural ──
  const LIMITE_IMAGEM = 300 * 1024;   // igual ao limite do bucket e do trigger
  const ALVO_IMAGEM = 150 * 1024;     // o app tenta chegar nisto

  function dimensoesAlvo(w, h, maxDim) {
    const maior = Math.max(w, h);
    if (maior <= maxDim) return { w, h };
    const f = maxDim / maior;
    return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
  }

  /** Tentativas em ordem, da melhor qualidade para a mais leve. */
  function planoCompressao() {
    return [
      { maxDim: 1280, q: 0.78 }, { maxDim: 1280, q: 0.66 }, { maxDim: 1280, q: 0.55 },
      { maxDim: 1024, q: 0.6 }, { maxDim: 1024, q: 0.5 },
      { maxDim: 800, q: 0.55 }, { maxDim: 800, q: 0.45 }, { maxDim: 640, q: 0.4 },
    ];
  }

  function formatarBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  const api = {
    TZ_PADRAO, DIAS, MESES, LIMITE_IMAGEM, ALVO_IMAGEM,
    esc, idSeguro, normalizarLogin, loginParaEmail, primeiroNome, inicial,
    hojeISO, diaDaSemana, datasDoMes, dataCurta, dataLonga, tituloMes,
    agruparPorMes, proximaSemana, modelosCom, distribuirModelo, paraLocalInput, resumoAlarme,
    dimensoesAlvo, planoCompressao, formatarBytes,
  };
  raiz.AgapeUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
