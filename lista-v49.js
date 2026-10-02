(() => {
  'use strict';
  const config = window.HYPE_SUPABASE_CONFIG || {};
  const client = window.supabase?.createClient(config.url, config.anonKey);
  const $ = id => document.getElementById(id);
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const digits = value => String(value || '').replace(/\D/g, '');
  const edgeUrl = `${config.url || ''}/functions/v1/guest-list-registration`;
  let events = [];
  let selectedEventId = 0;
  const status = (message, kind) => {
    const box = $('guestStatus');
    if (!box) return;
    box.className = `status show ${kind || ''}`;
    box.textContent = message;
  };
  const formatCpf = input => {
    const value = digits(input.value).slice(0, 11);
    input.value = value.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };
  const formatPhone = input => {
    const value = digits(input.value).slice(0, 11);
    input.value = value.length > 10
      ? value.replace(/(\d{2})(\d{5})(\d{1,4})/, '($1) $2-$3')
      : value.replace(/(\d{2})(\d{4})(\d{1,4})/, '($1) $2-$3');
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const eventLabel = row => `${row.event_name || 'Evento HYPE'}${row.event_date ? ` • ${row.event_date}` : ''}`;
  function renderSelectedEvent() {
    const row = events.find(item => Number(item.event_id) === Number(selectedEventId));
    const event = $('guestEvent');
    const hidden = $('guestEventId');
    if (!row) {
      if (event) event.innerHTML = '<strong>Cadastro fechado</strong>Nenhuma festa está recebendo cadastros no momento.';
      if (hidden) hidden.value = '';
      return;
    }
    if (hidden) hidden.value = String(row.event_id);
    if (event) event.innerHTML = `<strong>Festa selecionada</strong>${esc(eventLabel(row))}${row.venue ? ` • ${esc(row.venue)}` : ''}`;
    document.querySelectorAll('.event-choice').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.eventId) === Number(selectedEventId));
      button.setAttribute('aria-checked', Number(button.dataset.eventId) === Number(selectedEventId) ? 'true' : 'false');
    });
  }
  function renderEvents() {
    const list = $('guestEvents');
    const submit = $('guestSubmit');
    if (!list) return;
    if (!events.length) {
      list.innerHTML = '';
      if (submit) submit.disabled = true;
      renderSelectedEvent();
      return;
    }
    if (!selectedEventId || !events.some(item => Number(item.event_id) === Number(selectedEventId))) selectedEventId = Number(events[0].event_id);
    list.innerHTML = events.map(row => `<button class="event-choice" type="button" role="radio" aria-checked="false" data-event-id="${Number(row.event_id)}"><strong>${esc(row.event_name || 'Evento HYPE')}</strong><span>${row.event_date ? esc(row.event_date) : 'Data a confirmar'}${row.venue ? ` • ${esc(row.venue)}` : ''}</span></button>`).join('');
    list.querySelectorAll('.event-choice').forEach(button => button.addEventListener('click', () => {
      selectedEventId = Number(button.dataset.eventId || 0);
      renderSelectedEvent();
    }));
    if (submit) submit.disabled = false;
    renderSelectedEvent();
  }
  async function loadContext() {
    if (!client) return status('Não foi possível conectar ao cadastro HYPE.', 'error');
    try {
      const {data, error} = await client.rpc('public_guest_registration_events_v50');
      if (error) throw error;
      events = rows(data);
      renderEvents();
    } catch (error) {
      status(error?.message || 'Não foi possível consultar a lista.', 'error');
      if ($('guestSubmit')) $('guestSubmit').disabled = true;
    }
  }
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = $('guestSubmit');
    if (!form.reportValidity() || !client) return;
    submitButton.disabled = true;
    submitButton.textContent = 'ENVIANDO...';
    try {
      const payload = new FormData(form);
      payload.set('event_id', String(selectedEventId || ''));
      payload.set('photo_consent', $('guestPhotoConsent')?.checked ? 'true' : 'false');
      const response = await fetch(edgeUrl, {method: 'POST', body: payload});
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true) throw new Error(body.error || body.message || 'Não foi possível concluir o cadastro.');
      status('Cadastro enviado e está em análise. O Gmail só será enviado se o Admin aprovar.', 'ok');
      form.reset();
      renderSelectedEvent();
    } catch (error) {
      status(error?.message || 'Não foi possível concluir o cadastro.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'ENTRAR NA LISTA';
    }
  }
  $('guestCpf')?.addEventListener('input', event => formatCpf(event.currentTarget));
  $('guestPhone')?.addEventListener('input', event => formatPhone(event.currentTarget));
  $('guestForm')?.addEventListener('submit', submit);
  loadContext();
})();
