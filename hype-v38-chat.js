/* HYPE V42.1 — Chat único Admin <-> Portaria com Push real corrigido
   - Uma conversa única da HYPE, sem separar por evento
   - Funciona no Admin mesmo antes de digitar senha
   - Atualiza sozinho sem recarregar a página
   - Som + notificação do navegador
   - Push real via Service Worker + Edge Function: pode chegar com Chrome fechado no Android
   - V42.1: envio sempre passa pela Edge para notificar o outro aparelho, mesmo se o aparelho remetente nao ativou push
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
  let lastId = 0;
  let unread = 0;
  let firstLoadDone = false;
  let lastClearStamp = '';
  let pushReady = false;
  let pushWorking = false;
  let audioTested = false;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);

  function adminCreds() {
    if (role !== 'admin') return null;
    let h = null;
    try { if (typeof HYPE !== 'undefined') h = HYPE; } catch (_) {}
    try { if (!h && window.HYPE) h = window.HYPE; } catch (_) {}
    const user = String(h?.user || '').trim();
    const pass = String(h?.pass || '').trim();
    const r = String(h?.role || '').toLowerCase();
    if (!user || !pass || r !== 'admin') return null;
    return {p_username:user, p_password:pass};
  }

  const quickAdmin = [
    '✅ Liberado',
    '💳 Pagamento confirmado',
    '⚠️ Verificar cliente',
    '🚪 Como está a fila?',
    '🛡️ Chamar segurança'
  ];
  const quickPortaria = [
    '🚪 Cliente aguardando',
    '🔎 Problema no QR',
    '💳 Cliente diz que pagou',
    '⚠️ Preciso do Admin',
    '🛡️ Chamar segurança'
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

  function cfg() {
    return window.HYPE_SUPABASE_CONFIG || {};
  }

  function pushFunctionUrl() {
    return String(window.HYPE_CHAT_PUSH_FUNCTION_URL || 'https://axkbfrljohpkjnbotqnf.supabase.co/functions/v1/hype-chat-push').replace(/\/$/, '');
  }

  function edgeHeaders() {
    const anon = String(cfg().anonKey || '');
    const h = {'Content-Type':'application/json'};
    if (anon) {
      h.apikey = anon;
      h.Authorization = `Bearer ${anon}`;
    }
    return h;
  }

  // Som curto de notificação. No celular, o navegador só libera áudio
  // depois de um toque real do usuário; por isso agora existe botão 🔊.
  let audioCtx = null;
  let audioUnlocked = false;
  function updateSoundButton(ok) {
    const btn = document.getElementById('hypeChatV421Sound');
    if (!btn) return;
    btn.textContent = ok ? '🔊 ON' : '🔊';
    btn.classList.toggle('on', Boolean(ok));
    btn.title = ok ? 'Som do chat ativo neste aparelho' : 'Ativar som do chat neste aparelho';
  }
  async function unlockAudio(test = false) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audioUnlocked = audioCtx.state === 'running';
      updateSoundButton(audioUnlocked);
      if (test && audioUnlocked) {
        audioTested = true;
        notifySound(true);
        try { navigator.vibrate?.([80, 40, 80]); } catch (_) {}
      }
      return audioUnlocked;
    } catch (_) {
      updateSoundButton(false);
      return false;
    }
  }
  ['pointerdown','keydown','touchstart','click'].forEach(evt =>
    window.addEventListener(evt, () => unlockAudio(false), {once:true, passive:true})
  );

  function notifySound(force = false) {
    try { navigator.vibrate?.([90, 50, 90]); } catch (_) {}
    if ((!audioUnlocked && !force) || !audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.26, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
      gain.connect(audioCtx.destination);
      [820, 1080, 920].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i*0.11);
        osc.connect(gain);
        osc.start(now + i*0.11);
        osc.stop(now + i*0.11 + 0.16);
      });
    } catch (_) {}
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  function updatePushButton(text, ok) {
    const btn = document.getElementById('hypeChatV42Push');
    if (!btn) return;
    btn.textContent = text || (ok ? '🔔 ON' : '🔔');
    btn.classList.toggle('on', Boolean(ok));
    btn.title = ok ? 'Notificação push ativa neste aparelho' : 'Ativar notificação push neste aparelho';
  }

  async function ensurePushSubscription(interactive = false) {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (interactive) alert('Este navegador não suporta push real. No Android use Chrome atualizado.');
        updatePushButton('🔕', false);
        return false;
      }

      if (Notification.permission === 'default' && interactive) {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          updatePushButton('🔕', false);
          alert('Notificação não foi permitida.');
          return false;
        }
      }
      if (Notification.permission !== 'granted') {
        updatePushButton('🔔', false);
        return false;
      }

      const publicKey = String(window.HYPE_PUSH_PUBLIC_KEY || '').trim();
      if (!publicKey) {
        if (interactive) alert('Chave pública do push não encontrada no hype-push-config.js.');
        updatePushButton('🔕', false);
        return false;
      }

      const reg = await navigator.serviceWorker.register('./service-worker.js?v=421', {scope:'./'});
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
      }

      const json = sub.toJSON();
      const res = await fetch(pushFunctionUrl() + '/subscribe', {
        method:'POST',
        headers: edgeHeaders(),
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys || {},
          role,
          userAgent: navigator.userAgent || ''
        })
      });
      if (!res.ok) throw new Error((await res.text()) || 'Falha ao registrar push.');
      localStorage.setItem('hypePushEndpointV42', json.endpoint || '');
      pushReady = true;
      pushWorking = true;
      updatePushButton('🔔 ON', true);
      if (interactive) alert('Notificação do chat ativada neste aparelho.');
      return true;
    } catch (err) {
      console.warn('[HYPE V42.1 push]', err);
      pushReady = false;
      updatePushButton('🔔', false);
      if (interactive) alert((err && err.message) ? err.message : 'Não foi possível ativar a notificação push.');
      return false;
    }
  }

  function askNotificationPermission() {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'granted') ensurePushSubscription(false).catch(() => {});
    } catch (_) {}
  }

  function browserNotify(text) {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      if (!document.hidden && open) return;
      const n = new Notification('Chat HYPE', {
        body: text || 'Nova mensagem recebida',
        tag: 'hype-chat-v42-local',
        silent: false
      });
      n.onclick = () => {
        try { window.focus(); setOpen(true); } catch (_) {}
        try { n.close(); } catch (_) {}
      };
      setTimeout(() => { try { n.close(); } catch (_) {} }, 6000);
    } catch (_) {}
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
        💬 ${role === 'admin' ? 'Chat HYPE' : 'Falar com Admin'}
        <span id="hypeChatV38Unread" class="hype-chat-v38-unread" hidden>0</span>
      </button>
      <aside id="hypeChatV38" class="hype-chat-v38" aria-label="Chat interno HYPE">
        <div class="hype-chat-v38-head">
          <div style="min-width:0;flex:1">
            <strong>💬 Chat único HYPE</strong>
            <small id="hypeChatV38Event">Admin ↔ Portaria • conversa geral</small>
          </div>
          <div class="hype-chat-v41-head-actions">
            <button class="hype-chat-v421-sound" id="hypeChatV421Sound" type="button" title="Ativar som do chat neste aparelho">🔊</button>
            <button class="hype-chat-v42-push" id="hypeChatV42Push" type="button" title="Ativar notificação push neste aparelho">🔔</button>
            ${role === 'admin' ? '<button class="hype-chat-v41-clear" id="hypeChatV41Clear" type="button" title="Apagar toda a conversa">🗑️</button>' : ''}
            <button class="hype-chat-v38-close" id="hypeChatV38Close" type="button" aria-label="Fechar chat">×</button>
          </div>
        </div>

        <div class="hype-chat-v38-quick" id="hypeChatV38Quick">
          ${quick.map(q => `<button type="button" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}
        </div>

        <div class="hype-chat-v38-messages" id="hypeChatV38Messages">
          <div class="hype-chat-v38-empty">Carregando conversa da equipe...</div>
        </div>

        <div class="hype-chat-v38-compose">
          <textarea id="hypeChatV38Input" maxlength="1200" placeholder="Digite uma mensagem..."></textarea>
          <button id="hypeChatV38Send" class="hype-chat-v38-send" type="button">ENVIAR</button>
        </div>
      </aside>`);

    document.getElementById('hypeChatV38Fab').onclick = () => { askNotificationPermission(); toggle(); };
    document.getElementById('hypeChatV38Close').onclick = () => setOpen(false);
    const soundBtn = document.getElementById('hypeChatV421Sound');
    if (soundBtn) soundBtn.onclick = () => unlockAudio(true).catch(() => {});
    const pushBtn = document.getElementById('hypeChatV42Push');
    if (pushBtn) pushBtn.onclick = () => ensurePushSubscription(true).catch(() => {});
    const clearBtn = document.getElementById('hypeChatV41Clear');
    if (clearBtn) clearBtn.onclick = clearChat;
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
    updateSoundButton(audioUnlocked);
    setTimeout(() => ensurePushSubscription(false).catch(() => {}), 900);
  }

  function setOpen(v) {
    open = Boolean(v);
    document.getElementById('hypeChatV38')?.classList.toggle('open', open);
    if (open) {
      setUnread(0);
      askNotificationPermission();
      load(true).catch(() => {});
      setTimeout(() => document.getElementById('hypeChatV38Input')?.focus(), 80);
    }
  }

  function toggle() { setOpen(!open); }

  function render(rows, reset = false) {
    const box = document.getElementById('hypeChatV38Messages');
    if (!box) return;
    if (reset) box.innerHTML = '';
    if (!rows.length && reset) {
      box.innerHTML = '<div class="hype-chat-v38-empty">Ainda não há mensagens na conversa da equipe.</div>';
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

  function resetConversationView() {
    lastId = 0;
    setUnread(0);
    render([], true);
  }

  async function checkClearState() {
    const row = arr(await rpc('hype_chat_state_v41', {}))[0];
    const stamp = String(row?.last_cleared_at || '');
    if (lastClearStamp && stamp && stamp !== lastClearStamp) resetConversationView();
    if (stamp) lastClearStamp = stamp;
  }

  async function clearChat() {
    const creds = adminCreds();
    if (!creds) {
      alert('Para apagar a conversa, entre no Admin com seu usuário principal. O chat continua funcionando sem senha, mas apagar fica protegido.');
      return;
    }
    if (!confirm('Apagar TODAS as mensagens do chat HYPE? Isso apaga mensagens do Admin e da Portaria.')) return;

    const btn = document.getElementById('hypeChatV41Clear');
    if (btn) btn.disabled = true;
    try {
      const res = arr(await rpc('hype_chat_clear_v41', creds))[0];
      lastClearStamp = String(res?.cleared_at || new Date().toISOString());
      resetConversationView();
      alert('Conversa apagada.');
    } catch (err) {
      alert(err.message || 'Não foi possível apagar a conversa.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function load(force = false) {
    if (busy) return;
    busy = true;
    const before = lastId;
    try {
      try { await checkClearState(); } catch (_) {}
      const rows = arr(await rpc('hype_chat_list_v41', {p_after_id: force ? 0 : lastId}));
      const others = rows.filter(r => String(r.sender_role || '') !== role && Number(r.message_id || 0) > before);
      render(rows, force);
      if (firstLoadDone && others.length) {
        notifySound();
        browserNotify(others[others.length - 1]?.message_text || 'Nova mensagem recebida');
        if (!open) setUnread(unread + others.length);
      }
      firstLoadDone = true;
    } catch (err) {
      if (open) {
        const box = document.getElementById('hypeChatV38Messages');
        if (box) box.innerHTML = `<div class="hype-chat-v38-empty">${esc(err.message || 'Chat indisponível.')}</div>`;
      }
    } finally {
      busy = false;
    }
  }

  async function sendViaPushEdge(text) {
    const endpoint = String(localStorage.getItem('hypePushEndpointV42') || '');
    const res = await fetch(pushFunctionUrl() + '/send', {
      method:'POST',
      headers: edgeHeaders(),
      body: JSON.stringify({
        senderRole: role,
        senderName: role === 'admin' ? 'Admin' : 'Portaria',
        message: text,
        endpoint
      })
    });
    if (!res.ok) throw new Error((await res.text()) || 'Falha no push.');
    const json = await res.json().catch(() => ({}));
    if (json && json.ok === false) throw new Error(json.error || 'Falha no push.');
    pushWorking = true;
    return true;
  }

  async function send() {
    const input = document.getElementById('hypeChatV38Input');
    const text = String(input?.value || '').trim();
    if (!text) return;

    const btn = document.getElementById('hypeChatV38Send');
    if (btn) btn.disabled = true;

    try {
      // V42.1: sempre tenta mandar pela Edge primeiro.
      // Assim o computador consegue notificar o celular mesmo se o computador
      // nunca apertou 🔔. Se a Edge falhar, envia pelo chat normal sem push real.
      let sent = false;
      try { sent = await sendViaPushEdge(text); }
      catch (err) { console.warn('[HYPE V42.1 push send fallback]', err); sent = false; }
      if (!sent) {
        await rpc('hype_chat_send_v41', {
          p_sender_role: role,
          p_sender_name: role === 'admin' ? 'Admin' : 'Portaria',
          p_message: text
        });
      }
      input.value = '';
      await load(false);
    } catch (err) {
      alert(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      if (btn) btn.disabled = false;
      input?.focus();
    }
  }

  window.addEventListener('message', e => {
    if (e?.data?.type === 'HYPE_OPEN_CHAT') setOpen(true);
  });
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', e => {
      if (e?.data?.type === 'HYPE_OPEN_CHAT') setOpen(true);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    mount();
    setTimeout(() => load(true).catch(() => {}), 700);
    setInterval(() => load(false).catch(() => {}), 1500);
  });
})();
