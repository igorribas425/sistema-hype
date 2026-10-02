/* HYPE V49 — links públicos gerenciados somente no Admin. */
(() => {
  'use strict';

  const DOMAIN = 'https://hypeloungeclub.com.br';
  const promoterUrl = `${DOMAIN}/promoter.html`;
  const listUrl = `${DOMAIN}/lista.html`;
  const $ = id => document.getElementById(id);
  const esc = value => typeof hypeEscape === 'function'
    ? hypeEscape(value)
    : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const state = () => { try { return HYPE; } catch (_) { return null; } };

  function copyText(text) {
    const value = String(text || '');
    return navigator.clipboard?.writeText(value).catch(() => {
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    });
  }

  async function share(title, url) {
    if (navigator.share) {
      try { await navigator.share({title, url, text: `Acesse ${url}`}); return; } catch (_) {}
    }
    await copyText(url);
    if (typeof hypeNotify === 'function') hypeNotify('Link copiado.');
  }

  function setQr(id, url) {
    const image = $(id);
    if (!image || !window.HypeQRCode?.toDataUrl) return;
    image.src = window.HypeQRCode.toDataUrl(url, 300);
  }

  function events() {
    const hype = state();
    return (Array.isArray(hype?.adminEvents) && hype.adminEvents.length)
      ? hype.adminEvents
      : (Array.isArray(hype?.events) ? hype.events : []);
  }

  function fillEvents(selectedId) {
    const select = $('v49ListEvent');
    if (!select) return;
    const list = events().filter(event => event && event.active !== false);
    const selected = Number(selectedId || state()?.selectedEventId || list[0]?.id || 0);
    select.innerHTML = list.length
      ? list.map(event => `<option value="${Number(event.id)}" ${Number(event.id) === selected ? 'selected' : ''}>${esc(event.name || 'Evento')} ${event.event_date ? `• ${esc(event.event_date)}` : ''}</option>`).join('')
      : '<option value="">Nenhum evento ativo</option>';
  }

  function renderListStatus(row) {
    const status = $('v49ListStatus');
    const toggle = $('v49ListToggle');
    if (!status || !toggle) return;
    const open = Boolean(row?.registration_open);
    status.className = `v49-link-status ${open ? 'open' : 'closed'}`;
    status.textContent = open
      ? `ABERTO • ${row?.event_name || 'evento selecionado'} recebe novos nomes.`
      : 'BLOQUEADO • o link continua válido, mas não aceita novos cadastros.';
    toggle.textContent = open ? 'BLOQUEAR CADASTRO' : 'LIBERAR CADASTRO';
    toggle.classList.toggle('btn-action', open);
  }

  async function loadListSettings() {
    const status = $('v49ListStatus');
    const hype = state();
    if (!status || !hype?.user || !hype.pass) return;
    try {
      const row = rows(await sbRpc('staff_guest_registration_settings_v49', {
        p_username: hype.user,
        p_password: hype.pass
      }))[0] || {};
      fillEvents(row.event_id);
      renderListStatus(row);
    } catch (error) {
      status.className = 'v49-link-status closed';
      status.textContent = `Não foi possível carregar o status: ${error?.message || 'erro de conexão'}`;
    }
  }

  async function toggleGuestList() {
    const select = $('v49ListEvent');
    const button = $('v49ListToggle');
    const currentOpen = $('v49ListStatus')?.classList.contains('open');
    const eventId = Number(select?.value || 0);
    if (!eventId && !currentOpen) return alert('Selecione um evento ativo antes de liberar a lista.');
    if (button) { button.disabled = true; button.textContent = 'SALVANDO...'; }
    try {
      const hype = state();
      const row = rows(await sbRpc('staff_set_guest_registration_v49', {
        p_username: hype.user,
        p_password: hype.pass,
        p_event_id: eventId || null,
        p_registration_open: !currentOpen
      }))[0] || {};
      fillEvents(row.event_id);
      renderListStatus(row);
      if (typeof hypeNotify === 'function') hypeNotify(row.registration_open ? 'Cadastro público da lista liberado.' : 'Cadastro público da lista bloqueado.');
    } catch (error) {
      alert(error?.message || 'Não foi possível atualizar o cadastro público.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function showPromoterTab(tab) {
    const manage = $('v49PromoterManagePanel');
    const link = $('v49PromoterLinkPanel');
    const manageTab = $('v49PromoterTabManage');
    const linkTab = $('v49PromoterTabLink');
    const isLink = tab === 'link';
    if (manage) manage.hidden = isLink;
    if (link) link.hidden = !isLink;
    manageTab?.classList.toggle('active', !isLink);
    linkTab?.classList.toggle('active', isLink);
  }

  function showListTab(tab) {
    const manual = $('v49ListManualPanel');
    const link = $('v49ListLinkPanel');
    const manualTab = $('v49ListTabManual');
    const linkTab = $('v49ListTabLink');
    const isLink = tab === 'link';
    if (manual) manual.hidden = isLink;
    if (link) link.hidden = !isLink;
    manualTab?.classList.toggle('active', !isLink);
    linkTab?.classList.toggle('active', isLink);
    if (isLink) loadListSettings();
  }

  function init() {
    if (!$('v49PromoterLinkPanel') && !$('v49ListLinkPanel')) return false;
    $('v49PromoterPublicUrl')?.setAttribute('value', promoterUrl);
    $('v49ListPublicUrl')?.setAttribute('value', listUrl);
    setQr('v49PromoterPublicQr', promoterUrl);
    setQr('v49ListPublicQr', listUrl);
    fillEvents();
    return true;
  }

  window.HypeV49Registration = {
    showPromoterTab,
    showListTab,
    toggleGuestList,
    copyPromoterRegistrationLink: () => copyText(promoterUrl).then(() => hypeNotify?.('Link do promoter copiado.')),
    copyListRegistrationLink: () => copyText(listUrl).then(() => hypeNotify?.('Link da lista copiado.')),
    sharePromoterRegistrationLink: () => share('Cadastro de promoter HYPE', promoterUrl),
    shareListRegistrationLink: () => share('Lista HYPE', listUrl),
    loadListSettings
  };

  document.addEventListener('DOMContentLoaded', () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (init() || attempts >= 12) clearInterval(timer);
    }, 500);
  });
})();
