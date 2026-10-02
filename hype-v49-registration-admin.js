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
  let settingsRequested = false;
  let listSettings = [];
  let settingsLoadPromise = null;

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
    const configured = listSettings.length ? listSettings : events();
    const list = configured.filter(event => event && event.active !== false);
    const idOf = event => Number(event.event_id || event.id || 0);
    const selected = Number(selectedId || state()?.selectedEventId || list[0] && idOf(list[0]) || 0);
    select.innerHTML = list.length
      ? list.map(event => `<option value="${idOf(event)}" ${idOf(event) === selected ? 'selected' : ''}>${esc(event.event_name || event.name || 'Evento')} ${event.event_date ? `• ${esc(event.event_date)}` : ''}</option>`).join('')
      : '<option value="">Nenhum evento ativo</option>';
  }

  function syncManualListEvent(eventId) {
    const select = $('v408ListEvent');
    const id = Number(eventId || 0);
    if (!select || !id) return;
    const apply = () => {
      const option = Array.from(select.options || []).find(item => Number(item.value) === id);
      if (!option) return false;
      const changed = select.value !== String(id);
      select.value = String(id);
      if (changed && window.HypeListaAdmin?.load) window.HypeListaAdmin.load();
      return true;
    };
    if (apply()) return;
    setTimeout(() => { if (!apply()) setTimeout(apply, 900); }, 250);
  }

  function renderListStatus(settings = listSettings) {
    const status = $('v49ListStatus');
    const toggle = $('v49ListToggle');
    if (!status || !toggle) return;
    const rows = Array.isArray(settings) ? settings : [];
    const open = rows.some(row => Boolean(row?.registration_open));
    status.className = `v49-link-status ${open ? 'open' : 'closed'}`;
    status.textContent = open
      ? `ABERTO • ${rows.filter(row => row.registration_open).length} festa(s) aparecem no link.`
      : 'BLOQUEADO • o link continua válido, mas não aceita novos cadastros.';
    toggle.textContent = open ? 'BLOQUEAR LINK' : 'ATIVAR LINK';
    toggle.classList.toggle('btn-action', open);
    const limit = $('v50MaleLimit');
    if (limit && rows[0]?.male_limit !== undefined) limit.value = String(rows[0].male_limit);
    const quota = $('v50ListQuota');
    if (quota) quota.textContent = `Limite masculino: ${rows.map(row => Number(row.male_limit ?? 10)).join(' / ') || '10'} por festa.`;
  }

  function renderReviewRows(data) {
    const target = $('v50GuestReviewList');
    if (!target) return;
    const reviewRows = rows(data);
    if (!reviewRows.length) {
      target.innerHTML = '<div class="v18-empty">Nenhum cadastro enviado para as festas abertas ainda.</div>';
      const quota = $('v50ListQuota');
      if (quota) quota.textContent = `Limite masculino: ${listSettings.map(row => Number(row.male_limit ?? 10)).join(' / ') || '10'} por festa.`;
      return;
    }
    const quota = $('v50ListQuota');
    if (quota) quota.textContent = listSettings.map(setting => {
      const eventRows = reviewRows.filter(row => Number(row.event_id) === Number(setting.event_id));
      const approvedMen = eventRows.filter(row => row.gender === 'Masculino' && ['Liberado','Entrou'].includes(row.status)).length;
      return `${esc(setting.event_name || 'festa')}: ${approvedMen}/${Number(setting.male_limit ?? 10)} homens`;
    }).join(' • ');
    target.innerHTML = reviewRows.map(row => {
      const pending = row.status === 'Pendente';
      const emailState = row.email_sent_at ? `Gmail enviado em ${fmt(row.email_sent_at)}` : (row.email_error ? `Falha no Gmail: ${esc(row.email_error)}` : (pending ? 'Gmail aguardando aprovação' : 'Gmail ainda não enviado'));
      return `<div class="v50-review-row ${pending ? 'pending' : ''}"><div><strong>${esc(row.name || 'Sem nome')} <span class="v408-pill ${pending ? 'bad' : 'ok'}">${esc(row.status || '')}</span></strong><small>EVENTO: ${esc(row.event_name || 'HYPE')} • ${esc(row.gender || 'N/I')}</small><small>CPF ${esc(row.cpf || '—')} • WhatsApp ${esc(row.phone || '—')}</small><small>📧 ${esc(row.email || '—')} • Instagram ${esc(row.instagram || '—')}</small><small>${emailState}${row.created_at ? ` • cadastro ${fmt(row.created_at)}` : ''}</small></div><div class="v50-review-actions">${row.photo_path ? `<button class="btn-action" type="button" onclick="HypeV49Registration.openPhoto(${Number(row.list_id)})">📷 FOTO</button>` : ''}${pending ? `<button class="btn-action btn-confirm" type="button" onclick="HypeV49Registration.reviewGuest(${Number(row.list_id)},'aprovar')">✓ APROVAR</button><button class="btn-action btn-del" type="button" onclick="HypeV49Registration.reviewGuest(${Number(row.list_id)},'recusar')">RECUSAR</button>` : ''}${!pending && row.email ? `<button class="btn-action" type="button" onclick="HypeV49Registration.sendApprovedGuestEmail(${Number(row.list_id)},true)">📧 ${row.email_sent_at ? 'REENVIAR' : 'ENVIAR GMAIL'}</button>` : ''}</div></div>`;
    }).join('');
  }

  async function loadReview() {
    const target = $('v50GuestReviewList');
    const hype = state();
    if (!target || !hype?.user || !hype.pass || !listSettings.length) return;
    target.innerHTML = '<div class="v18-empty">Carregando cadastros para análise...</div>';
    try {
      const data = await Promise.all(listSettings.map(setting => sbRpc('staff_guest_registration_list_v50', {p_username:hype.user,p_password:hype.pass,p_event_id:Number(setting.event_id),p_status:null})));
      renderReviewRows(data.flatMap(rows));
    } catch (error) {
      target.innerHTML = `<div class="v18-empty error">Não foi possível carregar os cadastros: ${esc(error?.message || 'erro de conexão')}</div>`;
    }
  }

  async function loadListSettings() {
    if (settingsLoadPromise) return settingsLoadPromise;
    const status = $('v49ListStatus');
    const hype = state();
    if (!status || !hype?.user || !hype.pass) return;
    settingsLoadPromise = (async () => {
      try {
        listSettings = rows(await sbRpc('staff_guest_registration_settings_v50', {
          p_username: hype.user,
          p_password: hype.pass
        }));
        renderListStatus(listSettings);
        await loadReview();
      } catch (error) {
        status.className = 'v49-link-status closed';
        status.textContent = `Não foi possível carregar o status: ${error?.message || 'erro de conexão'}`;
      } finally {
        settingsLoadPromise = null;
      }
    })();
    return settingsLoadPromise;
  }

  async function toggleGuestList() {
    const button = $('v49ListToggle');
    const currentOpen = listSettings.some(row => Boolean(row.registration_open));
    if (!listSettings.length) return alert('Nenhuma festa ativa encontrada.');
    if (button) { button.disabled = true; button.textContent = 'SALVANDO...'; }
    try {
      const hype = state();
      const open = !currentOpen;
      const limit = Number($('v50MaleLimit')?.value || 10);
      await Promise.all(listSettings.map(setting => sbRpc('staff_set_guest_registration_v50', {
        p_username: hype.user,
        p_password: hype.pass,
        p_event_id: Number(setting.event_id),
        p_registration_open: open,
        p_male_limit: Number.isInteger(limit) && limit >= 0 ? limit : Number(setting.male_limit || 10)
      })));
      await loadListSettings();
      if (typeof hypeNotify === 'function') hypeNotify(open ? 'Link da lista ativado para todas as festas.' : 'Link da lista bloqueado.');
    } catch (error) {
      alert(error?.message || 'Não foi possível atualizar o cadastro público.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function saveGuestListSettings() {
    const hype = state();
    if (!hype?.user || !hype.pass || !listSettings.length) return alert('Nenhuma festa ativa encontrada.');
    const limit = Number($('v50MaleLimit')?.value || 10);
    if (!Number.isInteger(limit) || limit < 0) return alert('Informe um limite masculino válido.');
    const button = $('v50ListSave');
    if (button) { button.disabled = true; button.textContent = 'SALVANDO...'; }
    try {
      await Promise.all(listSettings.map(setting => sbRpc('staff_set_guest_registration_v50', {p_username:hype.user,p_password:hype.pass,p_event_id:Number(setting.event_id),p_registration_open:Boolean(setting.registration_open),p_male_limit:limit})));
      await loadListSettings();
      if (typeof hypeNotify === 'function') hypeNotify('Limite masculino salvo para este evento.');
    } catch (error) { alert(error?.message || 'Não foi possível salvar o limite.'); }
    finally { if (button) { button.disabled = false; button.textContent = 'SALVAR LIMITE'; } }
  }

  async function sendApprovedGuestEmail(listId, force = false) {
    const hype = state();
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!hype?.user || !hype.pass || !cfg.url) throw new Error('Entre no Admin primeiro.');
    const response = await fetch(`${cfg.url}/functions/v1/send-ticket-email`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({action:'guest_list_approved',username:hype.user,password:hype.pass,list_id:Number(listId),force:Boolean(force)})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      await loadReview();
      throw new Error(body.error || 'Não foi possível enviar o Gmail.');
    }
    await loadReview();
    if (typeof hypeNotify === 'function') hypeNotify(body.already_sent ? 'Este Gmail já foi enviado.' : 'Gmail da aprovação enviado.');
    return body;
  }

  async function reviewGuest(listId, decision) {
    const hype = state();
    if (!hype?.user || !hype.pass) return alert('Entre no Admin primeiro.');
    const label = decision === 'aprovar' ? 'aprovar este cadastro' : 'recusar este cadastro';
    if (!confirm(`Deseja ${label}?`)) return;
    try {
      const row = rows(await sbRpc('staff_guest_registration_review_v50', {p_username:hype.user,p_password:hype.pass,p_list_id:Number(listId),p_decision:decision}))[0] || {};
      await loadReview();
      if (row.status === 'Liberado' && row.email) await sendApprovedGuestEmail(Number(listId), false);
    } catch (error) { alert(error?.message || 'Não foi possível revisar o cadastro.'); }
  }

  async function openPhoto(listId) {
    const hype = state();
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!hype?.user || !hype.pass || !cfg.url) return alert('Entre no Admin primeiro.');
    try {
      const response = await fetch(`${cfg.url}/functions/v1/guest-list-admin-photo`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:hype.user,password:hype.pass,list_id:Number(listId)})});
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true || !body.signed_url) throw new Error(body.error || 'Foto indisponível.');
      const image = $('v50PhotoImage');
      const modal = $('v50PhotoPreview');
      if (image) image.src = body.signed_url;
      if (modal) modal.hidden = false;
    } catch (error) { alert(error?.message || 'Não foi possível abrir a foto.'); }
  }

  function closePhoto() {
    const modal = $('v50PhotoPreview');
    const image = $('v50PhotoImage');
    if (modal) modal.hidden = true;
    if (image) image.removeAttribute('src');
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
    const review = $('v50GuestReviewPanel');
    if (review) review.hidden = !isLink;
    if (isLink) loadListSettings();
  }

  function init() {
    if (!$('v49PromoterLinkPanel') && !$('v49ListLinkPanel')) return false;
    $('v49PromoterPublicUrl')?.setAttribute('value', promoterUrl);
    $('v49ListPublicUrl')?.setAttribute('value', listUrl);
    setQr('v49PromoterPublicQr', promoterUrl);
    setQr('v49ListPublicQr', listUrl);
    fillEvents();
    const hype = state();
    if (hype?.user && hype.pass && !settingsRequested) {
      settingsRequested = true;
      loadListSettings();
    }
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
    loadListSettings,
    saveGuestListSettings,
    reviewGuest,
    openPhoto,
    closePhoto,
    sendApprovedGuestEmail
  };

  document.addEventListener('DOMContentLoaded', () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (init() || attempts >= 12) clearInterval(timer);
    }, 500);
  });
})();
