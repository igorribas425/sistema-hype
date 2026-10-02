/* HYPE LOUNGE CLUB // PORTARIA V60
   Saída definitiva + feedback do cliente na hora.
   O cliente pode deixar comentário bom e ruim no mesmo atendimento.
*/
(() => {
  'use strict';

  const DEVICE_KEY = 'hype_portaria_device_key_v18';
  let sb = null;
  let currentTicketId = 0;

  const $ = id => document.getElementById(id);

  function client() {
    if (sb) return sb;
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || !window.supabase?.createClient) {
      throw new Error('Supabase não configurado.');
    }
    sb = window.supabase.createClient(cfg.url, cfg.anonKey, {auth:{persistSession:false}});
    return sb;
  }

  function setStatus(message, kind = '') {
    const box = $('v60ExitStatus');
    if (!box) return;
    box.className = `v60-exit-status ${kind}`.trim();
    box.textContent = message;
  }

  function open(ticketId) {
    const item = window.HypePortaria?.getItem?.(Number(ticketId));
    if (!item) return;
    if (item.final_exit_at) {
      setStatus('A saída desta pessoa já foi confirmada.', 'bad');
      return;
    }
    if (item.temporary_exit) {
      setStatus('A pessoa está em saída temporária. Confirme a reentrada antes da saída definitiva.', 'bad');
      return;
    }
    currentTicketId = Number(ticketId);
    if ($('v60ExitPerson')) $('v60ExitPerson').textContent = item.customer_name || 'Cliente';
    if ($('v60GoodComment')) $('v60GoodComment').value = '';
    if ($('v60BadComment')) $('v60BadComment').value = '';
    setStatus('Os dois comentários são opcionais e podem ser preenchidos juntos.');
    $('v60ExitFeedbackModal')?.classList.add('show');
    setTimeout(()=>$('v60GoodComment')?.focus(), 80);
  }

  function close() {
    $('v60ExitFeedbackModal')?.classList.remove('show');
    currentTicketId = 0;
  }

  async function confirmExit() {
    const item = window.HypePortaria?.getItem?.(currentTicketId);
    if (!item) return setStatus('Pessoa não encontrada na tela. Busque novamente.', 'bad');

    const deviceKey = localStorage.getItem(DEVICE_KEY) || '';
    if (!deviceKey) return setStatus('Este computador ainda não está autorizado na Portaria.', 'bad');
    if (navigator.onLine === false) return setStatus('Conecte à internet para confirmar a saída e salvar o feedback.', 'bad');

    const good = String($('v60GoodComment')?.value || '').trim();
    const bad = String($('v60BadComment')?.value || '').trim();
    const button = $('v60ExitConfirm');

    if (button) {
      button.disabled = true;
      button.textContent = 'CONFIRMANDO...';
    }
    setStatus('Salvando saída e feedback...', '');

    try {
      const {data, error} = await client().rpc('portaria_device_final_exit_v60', {
        p_device_key: deviceKey,
        p_ticket_id: Number(currentTicketId),
        p_good_comment: good,
        p_bad_comment: bad
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      setStatus(`✅ Saída confirmada • ${Number(row?.inside_after || 0)} pessoa(s) dentro agora.`, 'ok');

      const code = item.ticket_code;
      setTimeout(async () => {
        close();
        try {
          await window.HypePortaria?.refresh?.(false);
          if (code) await window.HypePortaria?.processCode?.(code, false);
        } catch (_) {}
      }, 650);
    } catch (err) {
      setStatus(err?.message || 'Não foi possível confirmar a saída.', 'bad');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'CONFIRMAR SAÍDA';
      }
    }
  }

  window.HypeV60Exit = {open, close, confirm:confirmExit};
})();