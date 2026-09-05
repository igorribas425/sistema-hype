/* HYPE V38 — Chat interno Admin <-> Portaria
   - Separado por evento
   - Histórico no Supabase
   - Atualização quase em tempo real
   - Respostas rápidas para operação da noite
*/
(() => {
  'use strict';

  const isAdmin = () =>
    /admin\.html(?:$|[?#])/i.test(location.pathname + location.search + location.hash) ||
    !!document.getElementById('adminDashboard') ||
    !!document.getElementById('adminTableBody');

  const isPortaria = () =>
    /portaria\.html(?:$|[?#])/i.test(location.pathname + location.search + location.hash) ||
    !!document.querySelector('[data-portaria-root],#portariaApp,#deviceGate,#eventSelect');

  if (!isAdmin() && !isPortaria()) return;

  const role = isAdmin() ? 'admin' : 'portaria';
  let sb = null;
  let open = false;
  let busy = false;
  let timer = null;
  let lastId = 0;
  let currentEvent = 0;
  let unread = 0;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);

  const quickAdmin = [
    '✅ Liberado',
    '💳 Pagamento confirmado',
    '⚠️ Verificar cliente',
    '🎟️ Gerar cortesia',
    '🛡️ Chamar segurança'
  ];
  const quickPortaria = [
    '🚪 Cliente aguardando',
    '🔎 Problema no QR',
    '💳 Cliente diz que pagou',
    '🎟️ Preciso liberar cortesia',
    '🛡️ Preciso do Admin'
  ];

  function client() {
    if (sb) return sb;
    try {
      if (typeof window.hypeClient === 'function') return (sb = window.hypeClient());
    } catch (_) {}
    const cfg = window.HYPE_SUPABASE_CONFIG || {};
    const lib = window.supabase;
    if (!lib?.createClient || !cfg.url || !cfg.anonKey) return null;
    sb = lib.createClient(cfg.url, cfg.anonKey, {auth:{persistSession:false}});
    return sb;
  }

  async function rpc(name, params) {
    const c = client();
    if (!c) throw new Error('Supabase não configurado.');
    const {data, error} = await c.rpc(name, params);
    if (error) throw new Error(error.message || 'Erro no chat.');
    return data;
  }

  function eventId() {
    if (role === 'portaria') {
      return Number(localStorage.getItem('hype_portaria_event_v18') || 0) || 0;
    }
    try {
      const h = window.HYPE || {};
      const id = Number(h.selectedEventId || 0);
      if (id) return id;
    } catch (_) {}
    const v34 = Number(document.getElementById('v34EventSelect')?.value || 0);
    if (v34) return v34;
    const v16 = Number(document.getElementById('v16DashboardEvent')?.value || 0);
    return v16 || 0;
  }

  function eventLabel(eid) {
    if (!eid) return 'Selecione um evento';
    try {
      const all = window.HYPE?.adminEvents || window.HYPE?.events || [];
      const found = all.find(e => Number(e.id) === Number(eid));
      if (found?.name) return String(found.name);
    } catch (_) {}
    if (role === 'portaria') {
      const sel = document.getElementById('eventSelect');
      if (Number(sel?.value || 0) === Number(eid) && sel?.selectedOptions?.[0]?.textContent) {
        return sel.selectedOptions[0].textContent.trim();
      }
    }
    return `Evento #${eid}`;
  }

  function authParams() {
    if (role === 'portaria') {
      return { p_device_key: localStorage.getItem('hype_portaria_device_key_v18') || '' };
    }
    const h = window.HYPE || {};
    return { p_username: h.user || '', p_password: h.pass || '' };
  }

  function setUnread(n) {
    unread = Math.max(0, Number(n || 0));
    const fab = document.getElementById('hypeChatV38Fab');
    const badge = document.getElementById('hypeChatV38Unread');
    if (badge) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.hidden = unread <= 0;
    }
    fab?.classList.toggle('has-new', unread > 0);
  }

  function mount() {
    if (document.getElementById('hypeChatV38')) return;
    const quick = role === 'admin' ? quickAdmin : quickPortaria;
    document.body.insertAdjacentHTML('beforeend', `
      <button id="hypeChatV38Fab" class="hype-chat-v38-fab" type="button">
        💬 ${role === 'admin' ? 'Chat Portaria' : 'Falar com Admin'}
        <span id="hypeChatV38Unread" class="hype-chat-v38-unread" hidden>0</span>
      </button>
      <aside id="hypeChatV38" class="hype-chat-v38" aria-label="Chat interno HYPE">
        <div class="hype-chat-v38-head">
          <div style="min-width:0;flex:1">
            <strong>💬 ${role === 'admin' ? 'Admin ↔ Portaria' : 'Portaria ↔ Admin'}</strong>
            <small id="hypeChatV38Event">Selecione um evento</small>
          </div>
          <button class="hype-chat-v38-close" id="hypeChatV38Close" type="button" aria-label="Fechar chat">×</button>
        </div>

        <div class="hype-chat-v38-quick" id="hypeChatV38Quick">
          ${quick.map(q => `<button type="button" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}
        </div>

        <div class="hype-chat-v38-messages" id="hypeChatV38Messages">
          <div class="hype-chat-v38-empty">Abra um evento para conversar.</div>
        </div>

        <div class="hype-chat-v38-compose">
          <textarea id="hypeChatV38Input" maxlength="1200" placeholder="Digite uma mensagem..."></textarea>
          <button id="hypeChatV38Send" class="hype-chat-v38-send" type="button">ENVIAR</button>
        </div>
      </aside>`);

    document.getElementById('hypeChatV38Fab').onclick = toggle;
    document.getElementById('hypeChatV38Close').onclick = () => setOpen(false);
    document.getElementById('hypeChatV38Send').onclick = send;
    document.getElementById('hypeChatV38Input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    document.querySelectorAll('#hypeChatV38Quick [data-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = document.getElementById('hypeChatV38Input');
        if (!input) return;
        input.value = btn.getAttribute('data-quick') || '';
        input.focus();
      });
    });
  }

  function setOpen(v) {
    open = Boolean(v);
    document.getElementById('hypeChatV38')?.classList.toggle('open', open);
    if (open) {
      setUnread(0);
      load(true).catch(() => {});
      setTimeout(() => document.getElementById('hypeChatV38Input')?.focus(), 80);
    }
  }

  function toggle() {
    setOpen(!open);
  }

  function render(rows, reset = false) {
    const box = document.getElementById('hypeChatV38Messages');
    if (!box) return;
    if (reset) box.innerHTML = '';
    if (!rows.length && reset) {
      box.innerHTML = '<div class="hype-chat-v38-empty">Ainda não há mensagens neste evento.</div>';
      return;
    }
    if (rows.length && box.querySelector('.hype-chat-v38-empty')) box.innerHTML = '';

    rows.forEach(r => {
      if (document.getElementById(`hype-chat-msg-${r.message_id}`)) return;
      const mine = String(r.sender_role || '') === role;
      const dt = new Date(r.created_at);
      const when = Number.isNaN(dt.getTime())
        ? ''
        : dt.toLocaleString('pt-BR', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
      box.insertAdjacentHTML('beforeend', `
        <div id="hype-chat-msg-${Number(r.message_id)}" class="hype-chat-v38-msg ${mine ? 'mine' : 'other'}">
          <b>${esc(r.sender_name || (mine ? 'Você' : r.sender_role))}</b>
          <p>${esc(r.message_text)}</p>
          <time>${esc(when)}</time>
        </div>`);
      lastId = Math.max(lastId, Number(r.message_id) || 0);
    });
    if (rows.length) box.scrollTop = box.scrollHeight;
  }

  async function load(force = false) {
    if (busy) return;
    const eid = eventId();
    const label = document.getElementById('hypeChatV38Event');
    if (label) label.textContent = eventLabel(eid);

    if (!eid) {
      if (open) render([], true);
      return;
    }

    if (eid !== currentEvent) {
      currentEvent = eid;
      lastId = 0;
      force = true;
      setUnread(0);
    }

    const auth = authParams();
    if (role === 'portaria' && !auth.p_device_key) return;
    if (role === 'admin' && (!auth.p_username || !auth.p_password)) return;

    busy = true;
    const before = lastId;
    try {
      const name = role === 'admin' ? 'staff_chat_list_v38' : 'portaria_chat_list_v38';
      const params = {...auth, p_event_id:eid, p_after_id: force ? 0 : lastId};
      const rows = arr(await rpc(name, params));
      const others = rows.filter(r =>
        String(r.sender_role || '') !== role &&
        Number(r.message_id || 0) > before
      ).length;
      render(rows, force);
      if (others && !open) setUnread(unread + others);
    } catch (err) {
      if (open) {
        const box = document.getElementById('hypeChatV38Messages');
        if (box) box.innerHTML = `<div class="hype-chat-v38-empty">${esc(err.message || 'Chat indisponível.')}</div>`;
      }
    } finally {
      busy = false;
    }
  }

  async function send() {
    const input = document.getElementById('hypeChatV38Input');
    const text = String(input?.value || '').trim();
    if (!text) return;

    const eid = eventId();
    if (!eid) return alert('Selecione um evento primeiro.');

    const auth = authParams();
    if (role === 'portaria' && !auth.p_device_key) return alert('Computador da Portaria ainda não autorizado.');
    if (role === 'admin' && (!auth.p_username || !auth.p_password)) return alert('Entre novamente no Admin.');

    const btn = document.getElementById('hypeChatV38Send');
    if (btn) btn.disabled = true;

    try {
      const name = role === 'admin' ? 'staff_chat_send_v38' : 'portaria_chat_send_v38';
      await rpc(name, {...auth, p_event_id:eid, p_message:text});
      input.value = '';
      await load(false);
    } catch (err) {
      alert(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      if (btn) btn.disabled = false;
      input?.focus();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    mount();
    setTimeout(() => load(true).catch(() => {}), 1000);
    timer = setInterval(() => {
      if (!document.hidden) load(false).catch(() => {});
    }, 1800);
  });
})();
