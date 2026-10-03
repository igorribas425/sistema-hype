/* HYPE LOUNGE CLUB // PORTARIA V67 - CADASTRO DE ENTRADA
   - Não vende ingresso
   - Não gera PIX
   - Não usa Stone
   - Salva nome + CPF + número / WhatsApp
   - Registra a entrada imediatamente e envia o registro ao Admin
*/
(() => {
  'use strict';

  const DEVICE_KEY = 'hype_portaria_device_key_v18';
  let sb = null;

  const $ = id => document.getElementById(id);
  const rows = data => Array.isArray(data) ? data : (data ? [data] : []);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const deviceKey = () => localStorage.getItem(DEVICE_KEY) || '';

  function client() {
    if (sb) return sb;
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) throw new Error('Supabase não configurado.');
    if (!window.supabase?.createClient) throw new Error('Biblioteca do Supabase não carregou.');
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {auth:{persistSession:false}});
    return sb;
  }

  async function rpc(name, params = {}) {
    const {data,error} = await client().rpc(name, params);
    if (error) throw new Error(error.message || 'Falha ao cadastrar.');
    return data;
  }

  function cpfDigits(value) {
    return String(value || '').replace(/\D/g,'').slice(0,11);
  }

  function validCpf(value) {
    const cpf = cpfDigits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let sum = 0;
    for (let i=0;i<9;i++) sum += Number(cpf[i]) * (10-i);
    let d1 = (sum * 10) % 11; if (d1 === 10) d1 = 0;
    if (d1 !== Number(cpf[9])) return false;
    sum = 0;
    for (let i=0;i<10;i++) sum += Number(cpf[i]) * (11-i);
    let d2 = (sum * 10) % 11; if (d2 === 10) d2 = 0;
    return d2 === Number(cpf[10]);
  }

  function currentEventId() {
    return Number($('eventSelect')?.value || 0);
  }

  function setStatus(text, ok = true) {
    const el = $('v67RegStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `v19-notice ${ok ? 'ok' : 'bad'}`;
  }

  function resetForm() {
    ['v67RegName','v67RegCpf','v67RegPhone'].forEach(id => {
      const el = $(id); if (el) el.value = '';
    });
    setTimeout(() => $('v67RegName')?.focus(), 80);
  }

  async function submit() {
    if (navigator.onLine === false) return setStatus('O cadastro de entrada precisa de internet para salvar no sistema.', false);

    const eventId = currentEventId();
    const name = String($('v67RegName')?.value || '').trim().replace(/\s+/g,' ');
    const cpf = cpfDigits($('v67RegCpf')?.value || '');
    const phone = String($('v67RegPhone')?.value || '').replace(/\D/g,'').slice(0,13);

    if (!eventId) return setStatus('Selecione o evento no topo da Portaria.', false);
    if (name.length < 2) return setStatus('Informe o nome completo.', false);
    if (!validCpf(cpf)) return setStatus('Informe um CPF válido.', false);
    if (phone.length < 10) return setStatus('Informe o número / WhatsApp com DDD.', false);

    const btn = $('v67RegSubmit');
    if (btn) { btn.disabled = true; btn.textContent = 'SALVANDO CADASTRO...'; }

    try {
      const item = rows(await rpc('portaria_device_register_entry_v84', {
        p_device_key: deviceKey(),
        p_event_id: eventId,
        p_name: name,
        p_cpf: cpf,
        p_phone: phone
      }))[0];

      if (!item?.list_id) throw new Error('O cadastro não foi salvo.');
      setStatus('✅ Pessoa salva automaticamente na lista e entrada registrada. Pronto para a próxima.', true);
      const resultBox = $('v67RegResult');
      if (resultBox) {
        resultBox.classList.remove('show');
        resultBox.innerHTML = '';
      }
      resetForm();

      try { await window.HypePortaria?.refresh?.(false); } catch (_) {}
      try {
        const search = $('searchInput');
        if (search) search.value = '';
        const results = $('results');
        if (results) results.innerHTML = '<div class="empty">✅ Cadastro salvo na lista e entrada registrada. Pronto para a próxima pessoa.</div>';
        const listResults = $('v406ListResult');
        if (listResults) listResults.innerHTML = '<div class="empty">Os cadastros ficam salvos automaticamente na lista do evento.</div>';
      } catch (_) {}
    } catch (err) {
      setStatus(err?.message || 'Não foi possível cadastrar a pessoa.', false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ CADASTRAR E REGISTRAR ENTRADA'; }
    }
  }

  window.HypeV67Register = { submit, resetForm };
})();
