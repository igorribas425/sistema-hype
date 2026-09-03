/* HYPE V22 // Admin simplificado: sorteio + acesso de dispositivos
   - Qualquer perfil que já pode entrar no Admin (admin/gerente/caixa) usa sorteios.
   - Uma única área mostra computador da Portaria + celulares leitores.
   - Sem código manual de autorização no painel.
*/
(() => {
  'use strict';

  const esc = v => typeof hypeEscape === 'function'
    ? hypeEscape(v)
    : String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const rows = d => Array.isArray(d) ? d : (d ? [d] : []);
  const fmt = v => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
  };

  let raffleEventId = 0;
  let accessTimer = null;

  function adminReady() {
    return Boolean(
      window.HYPE?.user && HYPE.pass &&
      ['admin','gerente','caixa'].includes(String(HYPE.role || '').toLowerCase())
    );
  }

  function eventRows() {
    const admin = Array.isArray(HYPE.adminEvents) ? HYPE.adminEvents : [];
    const pub = Array.isArray(HYPE.events) ? HYPE.events : [];
    const merged = [...admin, ...pub];
    const seen = new Set();
    return merged.filter(e => {
      const id = Number(e?.id || 0);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  async function fetchRaffleEventsV22() {
    const collected = [];
    const pushRows = data => {
      for (const e of rows(data)) {
        const id = Number(e?.id || 0);
        if (!id || collected.some(x => Number(x.id) === id)) continue;
        collected.push(e);
      }
    };

    // 1) Primeiro tenta a lista administrativa, que inclui todos os shows cadastrados.
    try {
      pushRows(await sbRpc('staff_list_events_v13', {
        p_username: HYPE.user,
        p_password: HYPE.pass
      }));
    } catch (_) {
      try {
        pushRows(await sbRpc('staff_list_events', {
          p_username: HYPE.user,
          p_password: HYPE.pass
        }));
      } catch (_) {}
    }

    // 2) Fallback público: garante que o seletor nunca dependa de outro painel do Admin.
    try { pushRows(await sbRpc('public_events_v13')); } catch (_) {
      try { pushRows(await sbRpc('public_events')); } catch (_) {}
    }

    // 3) Último fallback: dados que o app.js já conseguiu carregar.
    pushRows(eventRows());

    if (collected.length) {
      HYPE.adminEvents = collected;
      return collected;
    }
    return [];
  }

  function eventLabel(e) {
    let date = '';
    if (e?.event_date) {
      const d = new Date(`${String(e.event_date).slice(0,10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) date = ` • ${d.toLocaleDateString('pt-BR')}`;
    }
    return `${e?.name || e?.artist_name || 'Evento HYPE'}${date}`;
  }

  async function refreshRaffleEventsV19(preferredId = null) {
    const select = document.getElementById('v18RaffleEvent');
    if (!select || !adminReady()) return 0;

    const before = Number(preferredId || raffleEventId || select.value || HYPE.selectedEventId || 0);
    select.disabled = true;
    select.innerHTML = '<option value="">Carregando eventos...</option>';

    let list = [];
    try {
      list = await fetchRaffleEventsV22();
    } catch (err) {
      console.warn('[HYPE V22][raffle events]', err);
      list = eventRows();
    }

    list = (list || []).slice().sort((a,b) => {
      const da = String(a?.event_date || '9999-12-31');
      const db = String(b?.event_date || '9999-12-31');
      return da.localeCompare(db) || Number(a?.id || 0) - Number(b?.id || 0);
    });

    select.innerHTML = list.length
      ? list.map(e => `<option value="${Number(e.id)}">${esc(eventLabel(e))}</option>`).join('')
      : '<option value="">Nenhum evento encontrado</option>';
    select.disabled = false;

    let chosen = before;
    if (!list.some(e => Number(e.id) === chosen)) chosen = Number(HYPE.selectedEventId || list[0]?.id || 0);
    if (!list.some(e => Number(e.id) === chosen)) chosen = Number(list[0]?.id || 0);
    if (chosen) select.value = String(chosen);
    raffleEventId = chosen;

    const label = document.getElementById('v19RaffleSelectedLabel');
    if (label) {
      label.textContent = chosen
        ? (select.selectedOptions?.[0]?.textContent || 'Evento selecionado')
        : 'Nenhum evento foi encontrado. Use ↻ EVENTOS para tentar novamente.';
    }
    return chosen;
  }

  async function onRaffleEventChangeV19() {
    raffleEventId = Number(document.getElementById('v18RaffleEvent')?.value || 0);
    const list = document.getElementById('v18RaffleParticipants');
    if (list) { list.dataset.open = '0'; list.innerHTML = ''; }
    const result = document.getElementById('v18RaffleWinner');
    if (result) { result.classList.remove('show'); result.innerHTML = ''; }
    await loadRaffleV18(false);
  }

  async function loadRaffleV18(ensureEvents = true) {
    if (!adminReady()) return;
    const select = document.getElementById('v18RaffleEvent');
    if (!select) return;
    if (ensureEvents && (!select.options.length || !Number(select.value || 0))) {
      await refreshRaffleEventsV19();
    }
    const id = Number(select.value || raffleEventId || 0);
    if (!id) return;
    raffleEventId = id;

    const box = document.getElementById('v18RaffleState');
    try {
      const data = rows(await sbRpc('staff_raffle_status_v18', {
        p_username: HYPE.user,
        p_password: HYPE.pass,
        p_event_id: id
      }))[0];
      if (!data) throw new Error('Evento não encontrado.');

      const enabled = document.getElementById('v18RaffleEnabled');
      const prize = document.getElementById('v18RafflePrize');
      if (enabled) enabled.checked = Boolean(data.enabled);
      if (prize) prize.value = data.prize || '';
      const count = document.getElementById('v18RaffleCount');
      if (count) count.textContent = String(data.participant_count || 0);
      const last = document.getElementById('v18RaffleLastWinner');
      if (last) last.innerHTML = data.last_winner_name
        ? `Último vencedor: <b>${esc(data.last_winner_name)}</b> • ${esc(data.last_winner_code || '')} • ${esc(fmt(data.last_draw_at))}`
        : 'Nenhum sorteio realizado neste evento.';
      if (box) {
        box.textContent = data.enabled
          ? 'SORTEIO ATIVO • toda compra PAGA deste evento participa automaticamente'
          : 'SORTEIO DESATIVADO';
        box.className = `v18-state ${data.enabled ? 'on' : ''}`;
      }
      const selectedLabel = document.getElementById('v19RaffleSelectedLabel');
      if (selectedLabel) selectedLabel.textContent = select.selectedOptions?.[0]?.textContent || '';
    } catch (err) {
      if (box) {
        box.textContent = err.message || 'Erro ao carregar sorteio.';
        box.className = 'v18-state error';
      }
    }
  }

  async function saveRaffleV18() {
    if (!adminReady()) return alert('Sua sessão do Admin expirou. Entre novamente.');
    const id = Number(document.getElementById('v18RaffleEvent')?.value || 0);
    const enabled = Boolean(document.getElementById('v18RaffleEnabled')?.checked);
    const prize = document.getElementById('v18RafflePrize')?.value.trim() || '';
    if (!id) return alert('Selecione um evento para o sorteio.');
    if (enabled && !prize) return alert('Informe o prêmio do sorteio.');

    try {
      await sbRpc('staff_save_raffle_v18', {
        p_username: HYPE.user,
        p_password: HYPE.pass,
        p_event_id: id,
        p_enabled: enabled,
        p_prize: prize
      });
      hypeNotify(enabled ? 'Sorteio ativado neste evento.' : 'Sorteio desativado neste evento.');
      await loadRaffleV18(false);
    } catch (err) {
      alert(err.message || 'Erro ao salvar sorteio.');
    }
  }

  async function drawRaffleV18() {
    if (!adminReady()) return alert('Sua sessão do Admin expirou. Entre novamente.');
    const select = document.getElementById('v18RaffleEvent');
    const id = Number(select?.value || 0);
    if (!id) return alert('Selecione um evento.');
    const prize = document.getElementById('v18RafflePrize')?.value.trim() || 'o prêmio';
    const eventName = select?.selectedOptions?.[0]?.textContent || 'evento selecionado';
    if (!confirm(`Confirmar o sorteio?\n\n${eventName}\nPrêmio: ${prize}\n\nSomente ingressos PAGOS participam.`)) return;

    const btn = document.getElementById('v18DrawBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'SORTEANDO...'; }
    try {
      const winner = rows(await sbRpc('staff_draw_raffle_v18', {
        p_username: HYPE.user,
        p_password: HYPE.pass,
        p_event_id: id
      }))[0];
      if (!winner) throw new Error('O sorteio não retornou um vencedor.');
      const result = document.getElementById('v18RaffleWinner');
      if (result) {
        result.classList.add('show');
        result.innerHTML = `<small>🎉 VENCEDOR DO SORTEIO</small><strong>${esc(winner.customer_name)}</strong><span>${esc(winner.ticket_code)}${winner.promoter_code ? ` • Promoter ${esc(winner.promoter_code)}` : ''}</span><b>🎁 ${esc(winner.prize || prize)}</b><em>${winner.phone ? `WhatsApp: ${esc(winner.phone)}` : ''}</em>`;
      }
      hypeNotify('Sorteio realizado e registrado.');
      await loadRaffleV18(false);
      await loadRaffleParticipantsV18(true);
    } catch (err) {
      alert(err.message || 'Não foi possível realizar o sorteio.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🎲 REALIZAR SORTEIO AGORA'; }
    }
  }

  async function loadRaffleParticipantsV18(forceShow = false) {
    if (!adminReady()) return;
    const id = Number(document.getElementById('v18RaffleEvent')?.value || 0);
    if (!id) return;
    const list = document.getElementById('v18RaffleParticipants');
    if (!list) return;
    if (!forceShow && list.dataset.open === '1') {
      list.dataset.open = '0';
      list.innerHTML = '';
      return;
    }
    list.dataset.open = '1';
    list.innerHTML = '<div class="v18-empty">Carregando participantes pagos...</div>';
    try {
      const data = rows(await sbRpc('staff_raffle_participants_v18', {
        p_username: HYPE.user,
        p_password: HYPE.pass,
        p_event_id: id
      }));
      list.innerHTML = data.length
        ? `<div class="v18-participants-head">${data.length} participante(s) PAGO(s) • HYPE + promoter + Portaria • 1 ingresso = 1 chance</div>${data.map((p,i)=>`<div class="v18-participant"><b>${i+1}. ${esc(p.customer_name)}</b><span>${esc(p.ticket_code)}${p.promoter_code ? ` • promoter ${esc(p.promoter_code)}` : ''}</span></div>`).join('')}`
        : '<div class="v18-empty">Nenhum pagamento confirmado neste evento ainda.</div>';
    } catch (err) {
      list.innerHTML = `<div class="v18-empty error">${esc(err.message || 'Erro ao carregar participantes.')}</div>`;
    }
  }

  async function loadDevicesV21() {
    if (!adminReady()) return;
    const box = document.getElementById('v21AccessList');
    if (!box) return;
    box.innerHTML = '<div class="v18-empty">Atualizando dispositivos...</div>';

    try {
      const [deviceData, readerData] = await Promise.all([
        sbRpc('staff_list_portaria_devices_v18', {p_username:HYPE.user,p_password:HYPE.pass}),
        sbRpc('staff_list_portaria_readers_v20', {p_username:HYPE.user,p_password:HYPE.pass})
      ]);
      const devices = rows(deviceData);
      const readers = rows(readerData);

      let html = '<div class="v18-participants-head" style="margin-top:10px">💻 COMPUTADOR DA PORTARIA</div>';
      if (!devices.length) {
        html += '<div class="v18-empty">Abra portaria.html no computador fixo. O primeiro computador será preparado automaticamente.</div>';
      } else {
        html += devices.map(d => {
          const active = Boolean(d.active) && !d.revoked_at;
          return `<div class="v18-device ${active ? 'active' : 'pending'}"><div><strong>${esc(d.label || 'Portaria Principal')}</strong><small>${active ? 'ATIVO' : 'DESCONECTADO'}${d.last_seen ? ` • último acesso ${esc(fmt(d.last_seen))}` : ''}</small></div><div class="v18-device-actions">${active ? `<button class="btn-action btn-del" onclick="revokeDeviceV21('${esc(d.device_id)}')">DESCONECTAR</button>` : `<button class="btn-action btn-confirm" onclick="reactivateDeviceV21('${esc(d.request_code)}')">REATIVAR</button>`}</div></div>`;
        }).join('');
      }

      html += '<div class="v18-participants-head" style="margin-top:16px">📱 CELULARES LEITORES</div>';
      const visibleReaders = readers.filter(r => r.active || r.connected_at);
      if (!visibleReaders.length) {
        html += '<div class="v18-empty">Nenhum celular leitor registrado.</div>';
      } else {
        html += visibleReaders.map(r => `<div class="v18-device ${r.active ? 'active' : 'pending'}"><div><strong>${esc(r.reader_label || 'Celular leitor')}</strong><small>${r.active ? 'ATIVO' : 'ENCERRADO'}${r.last_scan_at ? ` • última leitura ${esc(fmt(r.last_scan_at))}` : ''}</small></div><div class="v18-device-actions">${r.active ? `<button class="btn-action btn-del" onclick="revokeReaderV21('${esc(r.reader_id)}')">DESCONECTAR</button>` : ''}</div></div>`).join('');
      }
      box.innerHTML = html;
    } catch (err) {
      box.innerHTML = `<div class="v18-empty error">${esc(err.message || 'Erro ao carregar dispositivos.')}</div>`;
    }
  }

  async function revokeDeviceV21(id) {
    if (!adminReady()) return;
    if (!confirm('Desconectar o computador da Portaria? Os celulares ligados a ele também serão encerrados.')) return;
    try {
      await sbRpc('staff_revoke_portaria_device_v18', {
        p_username:HYPE.user,p_password:HYPE.pass,p_device_id:id
      });
      hypeNotify('Computador da Portaria desconectado.');
      await loadDevicesV21();
    } catch (err) { alert(err.message || 'Não foi possível desconectar.'); }
  }

  async function reactivateDeviceV21(requestCode) {
    if (!adminReady()) return;
    if (!confirm('Reativar este computador da Portaria?')) return;
    try {
      await sbRpc('staff_approve_portaria_device_v18', {
        p_username:HYPE.user,p_password:HYPE.pass,p_request_code:requestCode,p_label:null
      });
      hypeNotify('Computador da Portaria reativado.');
      await loadDevicesV21();
    } catch (err) { alert(err.message || 'Não foi possível reativar.'); }
  }

  async function revokeReaderV21(id) {
    if (!adminReady()) return;
    if (!confirm('Desconectar este celular leitor?')) return;
    try {
      await sbRpc('staff_revoke_portaria_reader_v20', {
        p_username:HYPE.user,p_password:HYPE.pass,p_reader_id:id
      });
      hypeNotify('Celular leitor desconectado.');
      await loadDevicesV21();
    } catch (err) { alert(err.message || 'Não foi possível desconectar o leitor.'); }
  }

  async function hypeV21AdminInit() {
    if (!adminReady()) return;
    const id = await refreshRaffleEventsV19(raffleEventId || HYPE.selectedEventId);
    if (id) await loadRaffleV18(false);
    await loadDevicesV21();
    clearInterval(accessTimer);
    accessTimer = setInterval(() => {
      if (!document.hidden && adminReady()) loadDevicesV21().catch(()=>{});
    }, 9000);
  }

  window.refreshRaffleEventsV19 = refreshRaffleEventsV19;
  window.onRaffleEventChangeV19 = onRaffleEventChangeV19;
  window.loadRaffleV18 = loadRaffleV18;
  window.saveRaffleV18 = saveRaffleV18;
  window.drawRaffleV18 = drawRaffleV18;
  window.loadRaffleParticipantsV18 = loadRaffleParticipantsV18;
  window.loadDevicesV21 = loadDevicesV21;
  window.revokeDeviceV21 = revokeDeviceV21;
  window.reactivateDeviceV21 = reactivateDeviceV21;
  window.revokeReaderV21 = revokeReaderV21;
  // compatibilidade com o initAdmin existente em app.js
  window.hypeV18AdminInit = hypeV21AdminInit;

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if (adminReady()) hypeV21AdminInit(); }, 1100);
  });
})();
