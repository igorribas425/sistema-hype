(() => {
  'use strict';
  const config = window.HYPE_SUPABASE_CONFIG || {};
  const client = window.supabase?.createClient(config.url, config.anonKey);
  const $ = id => document.getElementById(id);
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const digits = value => String(value || '').replace(/\D/g, '');
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
  async function loadContext() {
    if (!client) return status('Não foi possível conectar ao cadastro HYPE.', 'error');
    try {
      const {data, error} = await client.rpc('public_guest_registration_context_v49');
      if (error) throw error;
      const row = rows(data)[0] || {};
      const event = $('guestEvent');
      const submit = $('guestSubmit');
      if (row.registration_open) {
        event.innerHTML = `<strong>Cadastro liberado</strong>${row.event_name || 'Evento HYPE'}${row.event_date ? ` • ${row.event_date}` : ''}`;
        submit.disabled = false;
      } else {
        event.innerHTML = '<strong>Cadastro fechado</strong>O Admin ainda não liberou a lista para novos nomes.';
        submit.disabled = true;
      }
    } catch (error) {
      status(error?.message || 'Não foi possível consultar a lista.', 'error');
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
      const {data, error} = await client.rpc('public_guest_registration_submit_v49', {
        p_name: $('guestName').value.trim(),
        p_cpf: digits($('guestCpf').value),
        p_phone: digits($('guestPhone').value),
        p_gender: $('guestGender').value,
        p_website: $('guestWebsite').value
      });
      if (error) throw error;
      const row = rows(data)[0] || {};
      status(row.message || 'Cadastro processado.', row.ok ? 'ok' : 'error');
      if (row.ok) form.reset();
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
