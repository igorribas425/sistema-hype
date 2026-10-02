/* HYPE LOUNGE CLUB // PORTARIA V59
   Avaliação operacional da noite:
   - BOA / RUIM + descrição
   - salva o momento do fluxo (dentro / entraram / saída temporária)
   - aparece no Admin pelo staff_live_checkin_v34, que já atualiza ~1s
*/
(() => {
  'use strict';

  const DEVICE_KEY = 'hype_portaria_device_key_v18';
  let sentiment = 'BOA';
  let sb = null;

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

  function setSentiment(value) {
    sentiment = value === 'RUIM' ? 'RUIM' : 'BOA';
    const good = $('v59EvalGood');
    const bad = $('v59EvalBad');
    if (good) good.classList.toggle('active', sentiment === 'BOA');
    if (bad) bad.classList.toggle('active', sentiment === 'RUIM');
    const title = $('v59EvalType');
    if (title) title.textContent = sentiment === 'BOA' ? 'OBSERVAÇÃO BOA' : 'OBSERVAÇÃO RUIM';
    $('v59EvalDescription')?.focus();
  }

  function setStatus(message, kind = '') {
    const box = $('v59EvalStatus');
    if (!box) return;
    box.className = `v59-eval-status ${kind}`.trim();
    box.textContent = message;
  }

  async function submit() {
    const deviceKey = localStorage.getItem(DEVICE_KEY) || '';
    const eventId = Number($('eventSelect')?.value || 0);
    const description = String($('v59EvalDescription')?.value || '').trim();
    const button = $('v59EvalSubmit');

    if (!deviceKey) return setStatus('Este computador ainda não está autorizado na Portaria.', 'bad');
    if (!eventId) return setStatus('Selecione o evento primeiro.', 'bad');
    if (description.length < 3) return setStatus('Escreva uma descrição com pelo menos 3 caracteres.', 'bad');

    if (button) {
      button.disabled = true;
      button.textContent = 'SALVANDO...';
    }
    setStatus('Registrando avaliação no evento...', '');

    try {
      const {data, error} = await client().rpc('portaria_device_observation_v59', {
        p_device_key: deviceKey,
        p_event_id: eventId,
        p_sentiment: sentiment,
        p_description: description
      });
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      if ($('v59EvalDescription')) $('v59EvalDescription').value = '';
      const inside = Number(row?.inside_now || 0);
      const entered = Number(row?.entered_total || 0);
      const out = Number(row?.temporary_out || 0);
      setStatus(
        `${sentiment === 'BOA' ? '✅' : '⚠️'} Registrado • ${inside} dentro • ${entered} entraram • ${out} em saída temporária`,
        'ok'
      );
    } catch (err) {
      setStatus(err?.message || 'Não foi possível registrar a avaliação.', 'bad');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'REGISTRAR AVALIAÇÃO';
      }
    }
  }

  function init() {
    setSentiment('BOA');
    $('v59EvalGood')?.addEventListener('click', () => setSentiment('BOA'));
    $('v59EvalBad')?.addEventListener('click', () => setSentiment('RUIM'));
    $('v59EvalSubmit')?.addEventListener('click', submit);
  }

  window.HypeV59Evaluation = { setSentiment, submit };
  document.addEventListener('DOMContentLoaded', init);
})();