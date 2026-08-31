/* HYPE // APP.JS + SUPABASE
   Banco: Supabase/PostgreSQL
   O SQL correspondente está em supabase_schema.sql.
*/

const HYPE = {
  sb: null,
  user: null,
  pass: null,
  role: null,
  lots: [],
  tickets: [],
  pixKey: "",
  events: [],
  adminEvents: [],
  event: null,
  selectedEventId: null,
  adminEditingEventId: null,
  adminEventImageData: "",
  ticketLoadSource: "",
  currentEntryCode: null,
  eventImageData: null,
  refreshTimer: null,
  scannerStream: null,
  scannerTimer: null,
  currentEntryId: null
};

function hypeCfg() {
  const cfg = window.HYPE_SUPABASE_CONFIG || {};
  if (!cfg.url || cfg.url.includes("COLE_AQUI") || !cfg.anonKey || cfg.anonKey.includes("COLE_AQUI")) {
    throw new Error("Configure supabase-config.js com a URL e a chave pública do seu projeto.");
  }
  return cfg;
}

function hypeClient() {
  if (!HYPE.sb) {
    if (!window.supabase?.createClient) throw new Error("Biblioteca do Supabase não carregada.");
    const cfg = hypeCfg();
    HYPE.sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false } });
  }
  return HYPE.sb;
}

function hypeEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[char]));
}

function hypeNotify(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function hypeFormatMoney(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
}

function hypePad(n) { return String(n).padStart(2, "0"); }

function hypeFormatDateTime(value) {
  if (!value) return "Sem horário definido";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Data inválida";
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function hypeStatus(ticket, now = new Date()) {
  const nowMs = now.getTime();
  const startMs = ticket.starts_at ? new Date(ticket.starts_at).getTime() : null;
  const endMs = ticket.ends_at ? new Date(ticket.ends_at).getTime() : null;
  if (startMs !== null && !Number.isFinite(startMs)) return {code:"invalid",label:"CONFIGURAÇÃO INVÁLIDA",canBuy:false};
  if (endMs !== null && !Number.isFinite(endMs)) return {code:"invalid",label:"CONFIGURAÇÃO INVÁLIDA",canBuy:false};
  if (startMs !== null && endMs !== null && endMs <= startMs) return {code:"invalid",label:"HORÁRIO INVÁLIDO",canBuy:false};
  if (!ticket.active) return {code:"expired",label:"ENCERRADO",canBuy:false,at:endMs};
  if (ticket.quantity_total > 0 && Number(ticket.quantity_available || 0) <= 0) return {code:"soldout",label:"ESGOTADO",canBuy:false};
  if (startMs !== null && nowMs < startMs) return {code:"upcoming",label:"EM BREVE",canBuy:false,at:startMs};
  if (endMs !== null && nowMs >= endMs) return {code:"expired",label:"ENCERRADO",canBuy:false,at:endMs};
  return {code:"active",label:"ABERTO",canBuy:true,at:endMs};
}

function hypeCountdownText(ticket) {
  const state = hypeStatus(ticket);
  if (state.code === "soldout") return "Lote esgotado";
  if (state.code === "upcoming" && state.at) {
    const diff = Math.max(0, state.at - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `Começa em ${days}d ${hypePad(hours)}h ${hypePad(mins)}m ${hypePad(secs)}s`;
  }
  if (state.code === "active" && state.at) {
    const diff = Math.max(0, state.at - Date.now());
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `Encerra em ${days}d ${hypePad(hours)}h ${hypePad(mins)}m ${hypePad(secs)}s`;
  }
  if (state.code === "expired") return "Prazo encerrado";
  if (state.code === "invalid") return "Corrija a data/hora no painel";
  return "Sem horário de expiração";
}

function sessionSave(user, pass, role) {
  HYPE.user = user; HYPE.pass = pass; HYPE.role = role;
  sessionStorage.setItem("hype_staff", JSON.stringify({ user, pass, role }));
}

function sessionLoad() {
  try {
    const data = JSON.parse(sessionStorage.getItem("hype_staff") || "null");
    if (data?.user && data?.pass) {
      HYPE.user = data.user; HYPE.pass = data.pass; HYPE.role = data.role || null;
      return true;
    }
  } catch (_) {}
  return false;
}

function sessionClear() {
  HYPE.user = HYPE.pass = HYPE.role = null;
  sessionStorage.removeItem("hype_staff");
}

async function sbRpc(name, params = {}) {
  try {
    const { data, error } = await hypeClient().rpc(name, params);
    if (error) throw new Error(error.message || "Erro do Supabase");
    return data;
  } catch (err) {
    console.error(`[HYPE][${name}]`, err);
    throw err;
  }
}

async function loadPublicState() {
  const [events, pix] = await Promise.all([
    sbRpc("public_events"),
    sbRpc("public_pix_key")
  ]);

  HYPE.events = Array.isArray(events) ? events : [];
  HYPE.pixKey = typeof pix === "string" ? pix : "";

  if (!HYPE.selectedEventId || !HYPE.events.some(e => Number(e.id) === Number(HYPE.selectedEventId))) {
    HYPE.selectedEventId = HYPE.events[0]?.id || null;
  }

  HYPE.event = HYPE.events.find(e => Number(e.id) === Number(HYPE.selectedEventId)) || null;

  if (HYPE.selectedEventId) {
    const lots = await sbRpc("public_lots_by_event", {
      p_event_id: Number(HYPE.selectedEventId)
    });
    HYPE.lots = Array.isArray(lots) ? lots : [];
  } else {
    HYPE.lots = [];
  }

  return HYPE.lots;
}

function hypeEventDate(event) {
  if (!event?.event_date) return "Data a confirmar";
  const d = new Date(`${event.event_date}T12:00:00`);
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  }).replace(".", "");
}

function renderEventCarousel() {
  const target = document.getElementById("eventCarousel");
  const dots = document.getElementById("eventDots");
  if (!target) return;

  const events = HYPE.events || [];
  if (!events.length) {
    target.innerHTML = `<div class="event-empty">Nenhum evento disponível no momento.</div>`;
    if (dots) dots.innerHTML = "";
    return;
  }

  target.innerHTML = events.map((e, index) => {
    const selected = Number(e.id) === Number(HYPE.selectedEventId);
    const meta = [
      hypeEventDate(e),
      e.opening_time ? `Abertura ${String(e.opening_time).slice(0,5)}` : "",
      e.venue || ""
    ].filter(Boolean).join(" • ");

    const image = e.cover_image
      ? `<img src="${hypeEscape(e.cover_image)}" alt="Capa do evento ${hypeEscape(e.name || "")}">`
      : `<div class="event-card-placeholder">HYPE</div>`;

    return `
      <article class="event-card ${selected ? "selected" : ""}" data-event-id="${Number(e.id)}">
        <div class="event-card-image">
          ${image}
          <div class="event-card-overlay"></div>
          <span class="event-card-day">${hypeEscape(hypeEventDate(e))}</span>
        </div>
        <div class="event-card-body">
          <small>${selected ? "EVENTO SELECIONADO" : "PRÓXIMO EVENTO"}</small>
          <h2>${hypeEscape(e.artist_name || e.name || "HYPE")}</h2>
          <h3>${hypeEscape(e.name || "Evento HYPE")}</h3>
          <div class="event-card-meta">${hypeEscape(meta)}</div>
          <p>${hypeEscape(e.description || "")}</p>
          <button type="button" class="event-select-btn" onclick="selectEvent(${Number(e.id)})">
            ${selected ? "✓ SELECIONADO" : "ESCOLHER ESTE EVENTO"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  if (dots) {
    dots.innerHTML = events.map(e =>
      `<button type="button" class="event-dot ${Number(e.id) === Number(HYPE.selectedEventId) ? "active" : ""}" onclick="selectEvent(${Number(e.id)})" aria-label="Selecionar evento"></button>`
    ).join("");
  }

  requestAnimationFrame(() => {
    target.querySelector(`[data-event-id="${Number(HYPE.selectedEventId)}"]`)?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest"
    });
  });
}

async function selectEvent(eventId) {
  HYPE.selectedEventId = Number(eventId);
  HYPE.event = HYPE.events.find(e => Number(e.id) === Number(eventId)) || null;

  try {
    const lots = await sbRpc("public_lots_by_event", {
      p_event_id: Number(eventId)
    });
    HYPE.lots = Array.isArray(lots) ? lots : [];
    renderEventCarousel();
    renderClientTickets();
    updateClientTicketState();
    document.getElementById("ticketBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    alert(err.message || "Não foi possível carregar os ingressos deste evento.");
  }
}

/* Compatibilidade com páginas antigas */
function renderPublicEvent() {
  renderEventCarousel();
}

async function loadStaffTickets(search = "") {
  if (!HYPE.user || !HYPE.pass) throw new Error("Usuário não autenticado.");

  const params = {
    p_username: HYPE.user,
    p_password: HYPE.pass,
    p_search: search
  };

  // Carrega as duas versões da listagem. A versão manual traz e-mail/método
  // e a versão antiga funciona como segurança para nenhum pedido sumir do Admin.
  const [manualResult, legacyResult] = await Promise.allSettled([
    sbRpc("staff_list_tickets_manual", params),
    sbRpc("staff_list_tickets", params)
  ]);

  const manual = manualResult.status === "fulfilled" && Array.isArray(manualResult.value)
    ? manualResult.value : [];
  const legacy = legacyResult.status === "fulfilled" && Array.isArray(legacyResult.value)
    ? legacyResult.value : [];

  if (manualResult.status === "rejected" && legacyResult.status === "rejected") {
    const msg = manualResult.reason?.message || legacyResult.reason?.message || "Não foi possível carregar os pedidos.";
    throw new Error(msg);
  }

  const byId = new Map();
  legacy.forEach(row => byId.set(Number(row.id), { ...row }));
  manual.forEach(row => {
    const old = byId.get(Number(row.id)) || {};
    byId.set(Number(row.id), { ...old, ...row });
  });

  HYPE.tickets = [...byId.values()].sort((a, b) => {
    const ad = new Date(a.purchased_at || 0).getTime();
    const bd = new Date(b.purchased_at || 0).getTime();
    return bd - ad;
  });

  HYPE.ticketLoadSource = manual.length ? "manual+compatibilidade" : "compatibilidade";
  const status = document.getElementById("adminOrdersStatus");
  if (status) {
    status.textContent = `${HYPE.tickets.length} pedido(s) carregado(s) • atualizado ${new Date().toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    status.className = "admin-sync-status ok";
  }

  return HYPE.tickets;
}

async function refreshAdminOrders(showToast = true) {
  try {
    await loadStaffTickets(document.getElementById("searchInput")?.value || "");
    renderClientsTable();
    if (showToast) hypeNotify("Pedidos atualizados.");
  } catch (err) {
    const status = document.getElementById("adminOrdersStatus");
    if (status) {
      status.textContent = `Erro ao carregar pedidos: ${err.message}`;
      status.className = "admin-sync-status error";
    }
    if (showToast) alert(err.message || "Erro ao atualizar pedidos.");
  }
}

async function verifyStaff(username, password) {
  const rows = await sbRpc("verify_staff", { p_username: username, p_password: password });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function requireLogin(kind) {
  if (sessionLoad()) {
    try {
      const found = await verifyStaff(HYPE.user, HYPE.pass);
      if (found) {
        HYPE.role = found.role;
        return true;
      }
    } catch (_) {}
    sessionClear();
  }
  return false;
}

function hideLogin() {
  const el = document.getElementById("loginScreen");
  if (el) el.style.display = "none";
}

function showLogin() {
  const el = document.getElementById("loginScreen");
  if (el) el.style.display = "grid";
}

async function checkLogin() {
  const username = document.getElementById("adminUser")?.value.trim() || "";
  const password = document.getElementById("adminPass")?.value || "";
  if (!username || !password) return alert("Informe usuário e senha.");
  try {
    const found = await verifyStaff(username, password);
    if (!found) return alert("Usuário ou senha incorretos.");
    if (!['admin','gerente','caixa'].includes(found.role)) return alert("Esta conta não possui acesso ao Admin.");
    sessionSave(found.username, password, found.role);
    hideLogin();
    await initAdmin(true);
  } catch (err) { alert(err.message); }
}

async function checkPortariaLogin() {
  const username = document.getElementById("portariaUser")?.value.trim() || "";
  const password = document.getElementById("portariaPass")?.value || "";
  if (!username || !password) return alert("Informe usuário e senha.");
  try {
    const found = await verifyStaff(username, password);
    if (!found) return alert("Usuário ou senha incorretos.");
    if (!['admin','gerente','portaria'].includes(found.role)) return alert("Esta conta não possui acesso à portaria.");
    sessionSave(found.username, password, found.role);
    hideLogin();
    document.getElementById("portariaSearch")?.focus();
  } catch (err) { alert(err.message); }
}

function logoutStaff() {
  sessionClear();
  location.reload();
}

/* ========================= CLIENTE ========================= */

let clientTicker = null;

async function initClient() {
  try {
    await loadPublicState();
    renderEventCarousel();
    renderClientTickets();
    updateClientTicketState();

    clearInterval(clientTicker);
    clientTicker = setInterval(async () => {
      try {
        const selectedLot = document.getElementById("ticketType")?.value;
        await loadPublicState();
        renderEventCarousel();
        renderClientTickets(selectedLot);
        updateClientTicketState();
        await refreshCurrentOrderStatus(false);
      } catch (_) {
        /* mantém a última tela */
      }
    }, 8000);
  } catch (err) {
    alert(err.message);
  }
}

function renderClientTickets(keepId = null) {
  const select = document.getElementById("ticketType");
  if (!select) return;
  const lots = HYPE.lots || [];
  select.innerHTML = lots.map(t => {
    const state = hypeStatus(t);
    const unavailable = !state.canBuy;
    const suffix = state.code === "upcoming" ? " — EM BREVE" : state.code === "expired" ? " — ENCERRADO" : state.code === "soldout" ? " — ESGOTADO" : state.code === "invalid" ? " — CONFIGURAÇÃO INVÁLIDA" : "";
    const stock = t.quantity_total > 0 ? ` • ${Math.max(0, Number(t.quantity_available || 0))} restantes` : "";
    return `<option value="${t.id}" data-price="${Number(t.price || 0)}" ${unavailable ? "disabled" : ""}>${hypeEscape(t.name)} - ${hypeFormatMoney(t.price)}${stock}${suffix}</option>`;
  }).join("");
  const available = lots.filter(t => hypeStatus(t).canBuy);
  if (keepId && available.some(t => String(t.id) === String(keepId))) select.value = keepId;
  else if (available.length) select.value = String(available[0].id);
  updatePrice();
}

function updatePrice() {
  const select = document.getElementById("ticketType");
  const opt = select?.options[select.selectedIndex];
  const display = document.getElementById("ticketPriceDisplay");
  if (!opt) { if (display) display.value = "NENHUM LOTE DISPONÍVEL"; updateClientTicketState(); return; }
  if (display) display.value = hypeFormatMoney(opt.dataset.price);
  updateClientTicketState();
}

function updateClientTicketState() {
  const select = document.getElementById("ticketType");
  const button = document.querySelector('#ticketForm button[type="submit"]');
  const info = document.getElementById("ticketScheduleInfo");
  const ticket = (HYPE.lots || []).find(t => String(t.id) === String(select?.value));
  if (!ticket) {
    if (button) button.disabled = true;
    if (info) info.innerHTML = `<strong>Nenhum lote disponível.</strong>`;
    return;
  }
  const state = hypeStatus(ticket);
  if (button) button.disabled = !state.canBuy;
  if (info) {
    const cls = state.code === "active" ? "active" : state.code === "upcoming" ? "upcoming" : "expired";
    info.className = `ticket-schedule ${cls}`;
    info.innerHTML = `<div><b>🕒 ${hypeEscape(state.label)}</b></div><div>${hypeEscape(hypeCountdownText(ticket))}</div><small>Setor: ${hypeEscape(ticket.sector || "Pista")} • Vendidos: ${Number(ticket.quantity_sold || 0)}${ticket.quantity_total ? ` / ${Number(ticket.quantity_total)}` : ""}<br>Início: ${ticket.starts_at ? hypeFormatDateTime(ticket.starts_at) : "imediato"} • Fim: ${ticket.ends_at ? hypeFormatDateTime(ticket.ends_at) : "sem limite"}</small>`;
  }
}

const HYPE_WHATSAPP = "555496776514";

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function currentSelectedLot() {
  const select = document.getElementById("ticketType");
  return (HYPE.lots || []).find(t => String(t.id) === String(select?.value)) || null;
}

function buildWhatsAppMessage(entry) {
  const event = HYPE.events.find(e => Number(e.id) === Number(entry.event_id)) || HYPE.event || {};
  const lines = [
    "🎟️ *PEDIDO DE INGRESSO — HYPE LOUNGE CLUB*",
    "",
    `🎤 Evento: ${event.name || "HYPE"}`,
    event.artist_name ? `🎧 Artista: ${event.artist_name}` : "",
    event.event_date ? `📅 Data: ${new Date(`${event.event_date}T12:00:00`).toLocaleDateString("pt-BR")}` : "",
    "",
    `👤 Nome: ${entry.customer_name}`,
    `🎫 Ingresso: ${entry.lot_name || ""}`,
    `📍 Setor: ${entry.sector || ""}`,
    `🚻 Gênero: ${entry.gender || "Não informado"}`,
    `💰 Valor: ${hypeFormatMoney(entry.price)}`,
    `🔖 Pedido: ${entry.ticket_code}`,
    `📧 E-mail: ${entry.email || ""}`,
    "",
    "Quero finalizar o pagamento deste ingresso.",
    "Após o pagamento, enviarei o comprovante por aqui."
  ].filter(Boolean);

  return lines.join("\n");
}

function openOrderWhatsApp(entry) {
  const message = buildWhatsAppMessage(entry);
  const url = `https://wa.me/${HYPE_WHATSAPP}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function createManualOrder(e) {
  e.preventDefault();

  const lot = currentSelectedLot();
  if (!lot) return alert("Escolha um ingresso disponível.");

  const state = hypeStatus(lot);
  if (!state.canBuy) return alert(`Este lote está ${state.label.toLowerCase()}.`);

  const name = document.getElementById("clientName")?.value.trim() || "";
  const phone = document.getElementById("clientPhone")?.value.trim() || "";
  const email = document.getElementById("clientEmail")?.value.trim() || "";
  const cpf = document.getElementById("clientCpf")?.value.trim() || "";
  const gender = document.getElementById("clientGender")?.value || "";

  if (!name) return alert("Informe seu nome completo.");
  if (normalizePhone(phone).length < 10) return alert("Informe um WhatsApp válido.");
  if (!validEmail(email)) return alert("Informe um e-mail válido.");

  const submit = document.querySelector('#ticketForm button[type="submit"]');
  const oldText = submit?.textContent || "FINALIZAR PELO WHATSAPP";
  if (submit) {
    submit.disabled = true;
    submit.textContent = "CRIANDO PEDIDO...";
  }

  try {
    const rows = await sbRpc("create_manual_order", {
      p_name: name,
      p_phone: phone,
      p_email: email,
      p_cpf: cpf,
      p_gender: gender,
      p_lot_id: Number(lot.id)
    });

    const entry = Array.isArray(rows) ? rows[0] : rows;
    if (!entry?.id) throw new Error("Não foi possível criar o pedido.");

    HYPE.currentEntryId = entry.id;
    HYPE.currentEntryCode = entry.ticket_code;

    const form = document.getElementById("ticketForm");
    const area = document.getElementById("manualArea");
    if (form) form.style.display = "none";
    if (area) area.style.display = "block";

    const code = document.getElementById("manualOrderCode");
    const summary = document.getElementById("manualOrderSummary");
    if (code) code.textContent = entry.ticket_code || "";
    if (summary) {
      summary.innerHTML = `
        <strong>${hypeEscape(entry.customer_name)}</strong><br>
        ${hypeEscape(entry.lot_name || "")} • ${hypeEscape(entry.sector || "")}<br>
        ${hypeFormatMoney(entry.price)}<br>
        <span style="color:#ffcc00">AGUARDANDO CONFIRMAÇÃO DO PAGAMENTO</span>
      `;
    }

    window.__hypeCurrentManualEntry = entry;
    hypeNotify(`Pedido ${entry.ticket_code} criado.`);
    openOrderWhatsApp(entry);
  } catch (err) {
    await loadPublicState().catch(() => {});
    renderEventCarousel();
    renderClientTickets();
    alert(err.message || "Erro ao criar pedido.");
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = oldText;
    }
  }
}

/* Mantém compatibilidade caso alguma página antiga ainda chame generatePix */
async function generatePix(e) {
  return createManualOrder(e);
}

function reopenOrderWhatsApp() {
  const entry = window.__hypeCurrentManualEntry;
  if (!entry) return alert("Pedido não encontrado nesta tela.");
  openOrderWhatsApp(entry);
}

async function refreshCurrentOrderStatus(showMessage = true) {
  const code = HYPE.currentEntryCode;
  if (!code) return;

  try {
    const rows = await sbRpc("public_get_ticket", { p_code: code });
    const entry = Array.isArray(rows) ? rows[0] : rows;
    if (!entry) return;

    const statusEl = document.getElementById("manualPaymentStatus");
    if (statusEl) {
      statusEl.textContent = entry.payment_status === "Pago"
        ? "PAGAMENTO CONFIRMADO ✅"
        : entry.payment_status === "Cancelado"
          ? "PEDIDO CANCELADO"
          : "AGUARDANDO CONFIRMAÇÃO";
    }

    if (entry.payment_status === "Pago") {
      fillTicketCard(entry);
      const area = document.getElementById("manualArea");
      const card = document.getElementById("ticketCard");
      if (area) area.style.display = "none";
      if (card) card.style.display = "block";
      if (showMessage) hypeNotify("Pagamento confirmado. Ingresso liberado!");
    } else if (showMessage) {
      hypeNotify("Pagamento ainda não foi confirmado pelo Admin.");
    }
  } catch (err) {
    if (showMessage) alert(err.message || "Não foi possível consultar o pedido.");
  }
}

function fillTicketCard(entry) {
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value ?? ""; };
  set("tClientName", entry.customer_name);
  set("tClientPhone", entry.phone || "Não informado");
  set("tClientEmail", entry.email || "");
  set("tClientGender", entry.gender || "Não especificado");
  set("tTicketName", entry.lot_name || "");
  set("tTicketPrice", hypeFormatMoney(entry.price));
  set("tTicketStatus", entry.payment_status === "Pago" ? "CONFIRMADO (PAGO ✅)" : entry.payment_status === "Cancelado" ? "CANCELADO ❌" : "Pendente de Confirmação ADM");
  set("tTicketId", entry.ticket_code || `#${entry.id}`);
  const qr = document.getElementById("ticketQrImg");
  if (qr) qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(entry.qr_token || entry.ticket_code)}`;
}

async function showTicketCard() {
  if (!HYPE.currentEntryId) return;
  try {
    const codeEl = document.getElementById("tTicketId");
    const currentCode = codeEl?.innerText || "";
    let entry;
    if (currentCode) {
      const rows = await sbRpc("public_get_ticket", { p_code: currentCode });
      entry = Array.isArray(rows) ? rows[0] : rows;
    }
    if (entry) fillTicketCard({ ...entry, lot_name: entry.lot_name });
    document.getElementById("pixArea").style.display = "none";
    document.getElementById("ticketCard").style.display = "block";
  } catch (err) {
    alert(err.message);
  }
}

/* ========================= ADMIN ========================= */

async function loadAdminEvents() {
  if (!HYPE.user || !HYPE.pass || !["admin","gerente"].includes(HYPE.role)) {
    HYPE.adminEvents = HYPE.events || [];
    return HYPE.adminEvents;
  }

  try {
    const rows = await sbRpc("staff_list_events", {
      p_username: HYPE.user,
      p_password: HYPE.pass
    });
    HYPE.adminEvents = Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.warn("[HYPE][staff_list_events]", err);
    HYPE.adminEvents = HYPE.events || [];
  }

  if (!HYPE.selectedEventId || !HYPE.adminEvents.some(e => Number(e.id) === Number(HYPE.selectedEventId))) {
    const firstActive = HYPE.adminEvents.find(e => e.active !== false) || HYPE.adminEvents[0];
    HYPE.selectedEventId = firstActive?.id || null;
  }

  return HYPE.adminEvents;
}

async function loadAdminLots(eventId = HYPE.selectedEventId) {
  if (!eventId) {
    HYPE.lots = [];
    return HYPE.lots;
  }
  const rows = await sbRpc("public_lots_by_event", { p_event_id: Number(eventId) });
  HYPE.lots = Array.isArray(rows) ? rows : [];
  return HYPE.lots;
}

function adminEventDateLabel(e) {
  if (!e?.event_date) return "Data a definir";
  const d = new Date(`${e.event_date}T12:00:00`);
  return d.toLocaleDateString("pt-BR", {weekday:"short",day:"2-digit",month:"2-digit",year:"numeric"}).replace(".", "");
}

function renderAdminEvents() {
  const listEl = document.getElementById("adminEventsList");
  if (!listEl) return;

  if (!["admin","gerente"].includes(HYPE.role)) {
    listEl.innerHTML = `<div class="admin-event-empty">Seu perfil não pode criar ou editar eventos.</div>`;
    return;
  }

  const events = HYPE.adminEvents || [];
  if (!events.length) {
    listEl.innerHTML = `<div class="admin-event-empty">Nenhum evento cadastrado. Clique em <b>+ NOVO EVENTO</b>.</div>`;
  } else {
    listEl.innerHTML = events.map(e => {
      const selected = Number(e.id) === Number(HYPE.selectedEventId);
      const active = e.active !== false;
      return `
        <div class="admin-event-card ${selected ? "selected" : ""}">
          <div class="admin-event-card-main">
            <div>
              <span class="admin-event-state ${active ? "on" : "off"}">${active ? "ATIVO" : "INATIVO"}</span>
              <strong>${hypeEscape(e.artist_name || e.name || "Evento HYPE")}</strong>
              <small>${hypeEscape(e.name || "Evento HYPE")} • ${hypeEscape(adminEventDateLabel(e))}${e.venue ? ` • ${hypeEscape(e.venue)}` : ""}</small>
            </div>
          </div>
          <div class="admin-event-actions">
            <button class="btn-action" onclick="selectAdminEvent(${Number(e.id)})">${selected ? "✓ LOTES DESTE EVENTO" : "VER LOTES"}</button>
            <button class="btn-action" onclick="openAdminEventEditor(${Number(e.id)})">EDITAR</button>
          </div>
        </div>`;
    }).join("");
  }

  const selected = events.find(e => Number(e.id) === Number(HYPE.selectedEventId));
  const selectedName = document.getElementById("adminSelectedEventName");
  if (selectedName) selectedName.textContent = selected ? `${selected.name || "Evento"}${selected.event_date ? ` • ${adminEventDateLabel(selected)}` : ""}` : "Nenhum evento selecionado";
}

async function selectAdminEvent(eventId) {
  HYPE.selectedEventId = Number(eventId);
  HYPE.event = (HYPE.adminEvents || []).find(e => Number(e.id) === Number(eventId)) || null;
  try {
    await loadAdminLots(eventId);
    renderAdminEvents();
    renderConfigTickets();
    document.getElementById("lotsAdminPanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  } catch (err) {
    alert(err.message || "Erro ao carregar os lotes deste evento.");
  }
}

function resetAdminEventImagePreview(src = "") {
  HYPE.adminEventImageData = src || "";
  const img = document.getElementById("adminEventPreviewImg");
  if (!img) return;
  if (src) {
    img.src = src;
    img.style.display = "block";
  } else {
    img.removeAttribute("src");
    img.style.display = "none";
  }
}

function openAdminEventEditor(eventId = null) {
  if (!["admin","gerente"].includes(HYPE.role)) return alert("Sem permissão.");
  const editor = document.getElementById("adminEventEditor");
  if (!editor) return;
  const e = eventId ? (HYPE.adminEvents || []).find(x => Number(x.id) === Number(eventId)) : null;

  HYPE.adminEditingEventId = e?.id || null;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value ?? ""; };
  set("adminEventName", e?.name || "");
  set("adminEventArtist", e?.artist_name || "");
  set("adminEventDate", e?.event_date || "");
  set("adminEventOpening", e?.opening_time ? String(e.opening_time).slice(0,5) : "");
  set("adminEventClosing", e?.closing_time ? String(e.closing_time).slice(0,5) : "");
  set("adminEventVenue", e?.venue || "");
  set("adminEventDescription", e?.description || "");
  set("adminEventSort", e?.sort_order ?? (HYPE.adminEvents?.length || 0) + 1);
  const active = document.getElementById("adminEventActive");
  if (active) active.checked = e ? e.active !== false : true;
  const title = document.getElementById("adminEventEditorTitle");
  if (title) title.textContent = e ? "EDITAR EVENTO" : "NOVO EVENTO";
  const file = document.getElementById("adminEventImageFile");
  if (file) file.value = "";
  resetAdminEventImagePreview(e?.cover_image || "");
  editor.style.display = "block";
  editor.scrollIntoView({behavior:"smooth",block:"center"});
}

function closeAdminEventEditor() {
  const editor = document.getElementById("adminEventEditor");
  if (editor) editor.style.display = "none";
  HYPE.adminEditingEventId = null;
  HYPE.adminEventImageData = "";
}

function previewAdminEventImage(input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Escolha uma imagem válida.");
  if (file.size > 8 * 1024 * 1024) return alert("A imagem deve ter no máximo 8 MB.");

  const reader = new FileReader();
  reader.onload = () => {
    const original = new Image();
    original.onload = () => {
      const maxW = 1400, maxH = 1400;
      const scale = Math.min(1, maxW / original.width, maxH / original.height);
      const w = Math.max(1, Math.round(original.width * scale));
      const h = Math.max(1, Math.round(original.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(original, 0, 0, w, h);
      const data = canvas.toDataURL("image/jpeg", 0.80);
      resetAdminEventImagePreview(data);
    };
    original.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function saveAdminEvent() {
  if (!["admin","gerente"].includes(HYPE.role)) return alert("Sem permissão.");
  const val = id => document.getElementById(id)?.value?.trim?.() || document.getElementById(id)?.value || "";
  const name = val("adminEventName");
  if (!name) return alert("Informe o nome do evento.");

  const btn = document.getElementById("saveAdminEventBtn");
  if (btn) { btn.disabled = true; btn.textContent = "SALVANDO..."; }
  try {
    const saved = await sbRpc("staff_save_event_v2", {
      p_username: HYPE.user,
      p_password: HYPE.pass,
      p_event_id: HYPE.adminEditingEventId ? Number(HYPE.adminEditingEventId) : null,
      p_name: name,
      p_artist_name: val("adminEventArtist"),
      p_event_date: val("adminEventDate") || null,
      p_opening_time: val("adminEventOpening") || null,
      p_closing_time: val("adminEventClosing") || null,
      p_venue: val("adminEventVenue"),
      p_description: val("adminEventDescription"),
      p_cover_image: HYPE.adminEventImageData || "",
      p_active: document.getElementById("adminEventActive")?.checked !== false,
      p_sort_order: Number(val("adminEventSort") || 0)
    });

    const eventSaved = Array.isArray(saved) ? saved[0] : saved;
    if (eventSaved?.id) HYPE.selectedEventId = Number(eventSaved.id);
    await loadPublicState();
    await loadAdminEvents();
    if (HYPE.selectedEventId) await loadAdminLots(HYPE.selectedEventId);
    renderAdminEvents();
    renderConfigTickets();
    closeAdminEventEditor();
    hypeNotify("Evento salvo e publicado.");
  } catch (err) {
    alert(err.message || "Erro ao salvar evento.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "SALVAR EVENTO"; }
  }
}

async function initAdmin(fromLogin = false) {
  if (!fromLogin && !(await requireLogin("admin"))) { showLogin(); return; }
  hideLogin();
  if (!["admin","gerente","caixa"].includes(HYPE.role)) return alert("Sem permissão.");
  try {
    await loadPublicState();
    await loadStaffTickets("");
    if (["admin","gerente"].includes(HYPE.role)) {
      await loadAdminEvents();
      if (HYPE.selectedEventId) await loadAdminLots(HYPE.selectedEventId);
    }
    await loadUsersIfAllowed();

    renderAdminEvents();
    renderConfigTickets();
    renderClientsTable();
    renderUsers();
    const pix = document.getElementById("pixKeyInput");
    if (pix) pix.value = HYPE.pixKey || "";
    startAdminTicker();

    clearInterval(HYPE.refreshTimer);
    HYPE.refreshTimer = setInterval(async () => {
      try {
        await loadStaffTickets(document.getElementById("searchInput")?.value || "");
        renderClientsTable();
      } catch (_) {}
    }, 5000);
  } catch (err) {
    const status = document.getElementById("adminOrdersStatus");
    if (status) {
      status.textContent = err.message || "Erro ao inicializar o Admin.";
      status.className = "admin-sync-status error";
    }
    alert(err.message);
  }
}

function renderConfigTickets() {
  const target = document.getElementById("ticketConfigList");
  if (!target) return;
  if (!["admin","gerente"].includes(HYPE.role)) {
    target.innerHTML = `<div class="info-note">Seu perfil não pode alterar lotes.</div>`;
    return;
  }

  const selected = (HYPE.adminEvents || HYPE.events || []).find(e => Number(e.id) === Number(HYPE.selectedEventId));
  const selectedName = document.getElementById("adminSelectedEventName");
  if (selectedName) selectedName.textContent = selected ? `${selected.name || "Evento"}${selected.event_date ? ` • ${adminEventDateLabel(selected)}` : ""}` : "Nenhum evento selecionado";

  if (!HYPE.selectedEventId) {
    target.innerHTML = `<div class="empty-lots">Crie ou selecione um evento primeiro.</div>`;
    return;
  }

  if (!(HYPE.lots || []).length) {
    target.innerHTML = `<div class="empty-lots">Este evento ainda não tem lotes. Use o formulário acima para adicionar o primeiro ingresso.</div>`;
    return;
  }

  target.innerHTML = (HYPE.lots || []).map((t, i) => `
    <div class="ticket-admin-card">
      <div class="ticket-admin-head"><strong>${hypeEscape(t.name)}</strong><span class="schedule-badge ${hypeStatus(t).code === "active" ? "active" : hypeStatus(t).code === "upcoming" ? "upcoming" : "expired"}">${hypeEscape(hypeStatus(t).label)}</span></div>
      <div class="ticket-admin-grid ticket-admin-grid-wide">
        <div class="form-group"><label>Nome</label><input id="tName_${i}" value="${hypeEscape(t.name)}"></div>
        <div class="form-group"><label>Setor</label><input id="tSector_${i}" value="${hypeEscape(t.sector || "")}"></div>
        <div class="form-group"><label>Preço</label><input id="tPrice_${i}" type="number" step="0.01" min="0" value="${Number(t.price || 0)}"></div>
        <div class="form-group"><label>Quantidade</label><input id="tQty_${i}" type="number" min="0" value="${Number(t.quantity_total || 0)}"></div>
        <div class="form-group"><label>Início</label><input id="tStart_${i}" type="datetime-local" value="${toDateTimeLocal(t.starts_at)}"></div>
        <div class="form-group"><label>Expiração</label><input id="tEnd_${i}" type="datetime-local" value="${toDateTimeLocal(t.ends_at)}"></div>
      </div>
      <div class="ticket-admin-preview"><span>Vendidos: <b>${Number(t.quantity_sold || 0)}</b></span><span>Disponíveis: <b>${t.quantity_total ? Math.max(0, Number(t.quantity_available || 0)) : "∞"}</b></span><span>Setor: <b>${hypeEscape(t.sector || "Pista")}</b></span><span>${hypeEscape(hypeCountdownText(t))}</span></div>
      <div class="ticket-admin-actions"><button class="btn-action" onclick="updateTicket(${i})">SALVAR LOTE</button><button class="btn-action" onclick="clearTicketSchedule(${i})">REMOVER HORÁRIOS</button></div>
    </div>`).join("");
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromDateTimeLocal(value) { return value ? new Date(value).toISOString() : null; }

async function createAdminLot() {
  if (!HYPE.selectedEventId) return alert("Selecione um evento primeiro.");
  const name = document.getElementById("newLotName")?.value.trim() || "";
  const sector = document.getElementById("newLotSector")?.value.trim() || "Pista";
  const price = Number(document.getElementById("newLotPrice")?.value || 0);
  const qty = Number(document.getElementById("newLotQty")?.value || 0);
  const startAt = fromDateTimeLocal(document.getElementById("newLotStart")?.value || "");
  const endAt = fromDateTimeLocal(document.getElementById("newLotEnd")?.value || "");
  if (!name) return alert("Informe o nome do lote.");

  try {
    await sbRpc("staff_upsert_lot_v2", {
      p_username: HYPE.user,
      p_password: HYPE.pass,
      p_event_id: Number(HYPE.selectedEventId),
      p_id: 0,
      p_name: name,
      p_sector: sector,
      p_price: price,
      p_quantity_total: qty,
      p_starts_at: startAt,
      p_ends_at: endAt,
      p_active: true,
      p_sort_order: (HYPE.lots?.length || 0) + 1
    });
    ["newLotName","newLotSector","newLotPrice","newLotQty","newLotStart","newLotEnd"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    await loadAdminLots(HYPE.selectedEventId);
    renderConfigTickets();
    hypeNotify("Lote criado para o evento selecionado.");
  } catch (err) {
    alert(err.message || "Erro ao criar lote.");
  }
}

async function updateTicket(index) {
  const t = HYPE.lots[index];
  if (!t || !HYPE.selectedEventId) return;
  try {
    const name = document.getElementById(`tName_${index}`).value.trim();
    const sector = document.getElementById(`tSector_${index}`).value.trim();
    const price = Number(document.getElementById(`tPrice_${index}`).value);
    const qty = Number(document.getElementById(`tQty_${index}`).value);
    const startAt = fromDateTimeLocal(document.getElementById(`tStart_${index}`).value);
    const endAt = fromDateTimeLocal(document.getElementById(`tEnd_${index}`).value);
    await sbRpc("staff_upsert_lot_v2", {
      p_username:HYPE.user,p_password:HYPE.pass,p_event_id:Number(HYPE.selectedEventId),p_id:t.id,
      p_name:name,p_sector:sector,p_price:price,p_quantity_total:qty,p_starts_at:startAt,p_ends_at:endAt,p_active:true,p_sort_order:index+1
    });
    await loadAdminLots(HYPE.selectedEventId);
    renderConfigTickets();
    hypeNotify("Lote atualizado.");
  } catch (err) { alert(err.message); }
}

async function clearTicketSchedule(index) {
  const t = HYPE.lots[index];
  if (!t || !HYPE.selectedEventId) return;
  try {
    await sbRpc("staff_upsert_lot_v2", {
      p_username:HYPE.user,p_password:HYPE.pass,p_event_id:Number(HYPE.selectedEventId),p_id:t.id,
      p_name:t.name,p_sector:t.sector,p_price:Number(t.price),p_quantity_total:Number(t.quantity_total),p_starts_at:null,p_ends_at:null,p_active:true,p_sort_order:index+1
    });
    await loadAdminLots(HYPE.selectedEventId);
    renderConfigTickets();
    hypeNotify("Horários removidos.");
  } catch (err) { alert(err.message); }
}

async function savePixKey() {
  try {
    const key = document.getElementById("pixKeyInput")?.value.trim() || "";
    await sbRpc("staff_save_pix", {p_username:HYPE.user,p_password:HYPE.pass,p_pix:key});
    HYPE.pixKey = key; hypeNotify("Chave PIX atualizada.");
  } catch (err) { alert(err.message); }
}

async function renderClientsTable() {
  const tbody = document.getElementById("adminTableBody");
  if (!tbody) return;
  const term = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const list = (HYPE.tickets || []).filter(item => String(item.customer_name || '').toLowerCase().includes(term) || String(item.lot_name || '').toLowerCase().includes(term) || String(item.ticket_code || '').toLowerCase().includes(term) || String(item.phone || '').toLowerCase().includes(term) || String(item.email || '').toLowerCase().includes(term));
  if (!list.length) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:30px">Nenhum cliente encontrado.</td></tr>`;
  else tbody.innerHTML = list.map(item => {
    const status = item.payment_status === 'Pago' ? 'pago' : item.payment_status === 'Cancelado' ? 'cancelado' : 'pendente';
    const entry = item.entry_status === 'Entrada utilizada' ? ` • Entrada ${hypeFormatDateTime(item.entry_at)}` : '';
    const canPay = ['admin','gerente','caixa'].includes(HYPE.role);
    const paymentStatus = String(item.payment_status || "Pendente");
    const cpf = item.cpf ? hypeEscape(item.cpf) : "—";
    const emailState = item.email_sent_at
      ? `<small style="display:block;color:var(--green);margin-top:4px">📧 INGRESSO ENVIADO</small>`
      : paymentStatus === "Pago" && item.email
        ? `<small style="display:block;color:#ffcc00;margin-top:4px">📧 E-MAIL AINDA NÃO ENVIADO</small>`
        : "";
    return `<tr><td><strong>${hypeEscape(item.customer_name || "SEM NOME")}</strong><br><span class="badge gender">${hypeEscape(item.gender || "N/I")}</span><small style="color:var(--muted)">${hypeEscape(item.ticket_code || "")} ${entry}</small><small style="display:block;color:var(--muted);line-height:1.55">📱 ${hypeEscape(item.phone || "—")}<br>📧 ${hypeEscape(item.email || "—")}<br>CPF: ${cpf}</small>${emailState}</td><td>${hypeFormatMoney(item.price)}<br><small style="color:var(--muted)">${hypeEscape(item.lot_name || "")}</small><small style="display:block;color:var(--muted)">${hypeEscape(item.sector || "")} • ${hypeEscape(item.payment_method || "Manual")}</small></td><td><span class="badge ${status}">${hypeEscape(paymentStatus.toUpperCase())}</span><br><small>${hypeEscape(item.entry_status || "Não utilizado")}</small></td><td><div class="actions-cell">${canPay && paymentStatus !== "Pago" ? `<button class="btn-action btn-confirm" onclick="setPayment(${item.id},'Pago')">✅ CONFIRMAR</button>` : ""}${canPay && paymentStatus === "Pago" && item.email ? `<button class="btn-action" onclick="sendTicketEmail(${item.id},true)">📧 REENVIAR</button>` : ""}${canPay && paymentStatus === "Pago" ? `<button class="btn-action" onclick="setPayment(${item.id},'Pendente')">PENDENTE</button>` : ""}${canPay && paymentStatus !== "Cancelado" ? `<button class="btn-action btn-del" onclick="setPayment(${item.id},'Cancelado')">CANCELAR</button>` : ""}</div></td></tr>`;
  }).join('');

  const total = HYPE.tickets.length;
  const paid = HYPE.tickets.filter(x=>x.payment_status==='Pago').length;
  const pending = HYPE.tickets.filter(x=>x.payment_status==='Pendente').length;
  const canceled = HYPE.tickets.filter(x=>x.payment_status==='Cancelado').length;
  const entered = HYPE.tickets.filter(x=>x.entry_status==='Entrada utilizada').length;
  const cash = HYPE.tickets.filter(x=>x.payment_status==='Pago').reduce((s,x)=>s+Number(x.price||0),0);
  const pendingValue = HYPE.tickets.filter(x=>x.payment_status==='Pendente').reduce((s,x)=>s+Number(x.price||0),0);
  const set = (id,v)=>{const el=document.getElementById(id);if(el)el.innerText=v;};
  set('totalCount',total); set('paidCount',paid); set('pendingCount',pending); set('totalCash',hypeFormatMoney(cash)); set('enteredCount',entered); set('canceledCount',canceled); set('pendingValue',hypeFormatMoney(pendingValue));
}

async function sendTicketEmail(id, force = false) {
  const cfg = hypeCfg();
  const response = await fetch(`${cfg.url}/functions/v1/send-ticket-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": cfg.anonKey,
      "Authorization": `Bearer ${cfg.anonKey}`
    },
    body: JSON.stringify({
      ticket_id: Number(id),
      username: HYPE.user,
      password: HYPE.pass,
      force: Boolean(force)
    })
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || "Não foi possível enviar o ingresso por e-mail.");
  }

  if (force) {
    await loadStaffTickets(document.getElementById("searchInput")?.value || "");
    renderClientsTable();
    hypeNotify(data?.already_sent ? "O ingresso já havia sido enviado." : "📧 Ingresso reenviado com sucesso.");
  }

  return data;
}

async function setPayment(id, status) {
  if (!confirm(`${status === 'Pago' ? 'Confirmar pagamento e enviar o ingresso por e-mail' : status === 'Cancelado' ? 'Cancelar ingresso' : 'Voltar para pendente'}?`)) return;

  try {
    await sbRpc("staff_set_payment", {
      p_username:HYPE.user,
      p_password:HYPE.pass,
      p_ticket_id:id,
      p_status:status
    });

    if (status === "Pago") {
      try {
        const emailResult = await sendTicketEmail(id, false);
        hypeNotify(
          emailResult?.already_sent
            ? "Pagamento confirmado. O ingresso já havia sido enviado por e-mail."
            : "✅ Pagamento confirmado e ingresso enviado por e-mail."
        );
      } catch (emailErr) {
        alert(
          "O pagamento foi CONFIRMADO, mas o e-mail não foi enviado.\n\n" +
          (emailErr.message || "Erro no envio.") +
          "\n\nUse o botão 📧 REENVIAR depois de corrigir o envio."
        );
      }
    } else {
      hypeNotify(`Status atualizado para ${status}.`);
    }

    await loadStaffTickets(document.getElementById("searchInput")?.value || "");
    renderClientsTable();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleStatus(id) { const item = HYPE.tickets.find(x=>Number(x.id)===Number(id)); if(item) await setPayment(id,item.payment_status==='Pago'?'Pendente':'Pago'); }
async function deleteClient(id) { await setPayment(id,'Cancelado'); }

async function clearAll() {
  if (!confirm("Isso vai CANCELAR todos os ingressos atuais. Continuar?")) return;
  try { await sbRpc("staff_cancel_all", {p_username:HYPE.user,p_password:HYPE.pass}); await loadStaffTickets(''); renderClientsTable(); hypeNotify('Ingressos cancelados.'); }
  catch (err) { alert(err.message); }
}

async function loadUsersIfAllowed() {
  if (!['admin','gerente'].includes(HYPE.role)) return [];
  return sbRpc("staff_list_users", {p_username:HYPE.user,p_password:HYPE.pass});
}

async function renderUsers() {
  const body = document.getElementById('usersTableBody');
  if (!body || !['admin','gerente'].includes(HYPE.role)) return;
  try {
    const rows = await loadUsersIfAllowed();
    body.innerHTML = (rows||[]).map(u=>`<tr><td>${hypeEscape(u.name)}<br><small>${hypeEscape(u.username)}</small></td><td>${hypeEscape(u.role)}</td><td>${u.active ? `<button class="btn-action btn-del" onclick="deleteUser(${u.id})">DESATIVAR</button>` : '<span class="badge cancelado">INATIVO</span>'}</td></tr>`).join('');
  } catch (err) { body.innerHTML=`<tr><td colspan="3">${hypeEscape(err.message)}</td></tr>`; }
}

async function addUser() {
  const name = document.getElementById('newUserName')?.value.trim() || '';
  const username = document.getElementById('newUsername')?.value.trim() || '';
  const password = document.getElementById('newUserPassword')?.value || '';
  const role = document.getElementById('newUserRole')?.value || 'caixa';
  if (!name || !username || !password) return alert('Preencha nome, usuário e senha.');
  try {
    await sbRpc('staff_add_user',{p_username:HYPE.user,p_password:HYPE.pass,p_name:name,p_new_username:username,p_new_password:password,p_role:role});
    ['newUserName','newUsername','newUserPassword'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    await renderUsers(); hypeNotify('Pessoa adicionada à equipe.');
  } catch(err){ alert(err.message); }
}

async function deleteUser(id) {
  if (!confirm('Desativar este usuário?')) return;
  try { await sbRpc('staff_delete_user',{p_username:HYPE.user,p_password:HYPE.pass,p_user_id:id}); await renderUsers(); hypeNotify('Usuário desativado.'); }
  catch(err){ alert(err.message); }
}

function exportEntriesCSV() {
  const rows = HYPE.tickets || [];
  const headers = ['id','ticket_code','customer_name','phone','email','cpf','gender','lot_name','sector','price','payment_method','payment_status','entry_status','purchased_at','paid_at','email_sent_at','entry_at'];
  const csv = [headers.join(';'), ...rows.map(r=>headers.map(h=>`"${String(r[h] ?? '').replaceAll('"','""')}"`).join(';'))].join('\n');
  const blob = new Blob(["\uFEFF" + csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`hype-ingressos-${new Date().toISOString().slice(0,10)}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function startAdminTicker() {
  clearInterval(window.__hypeAdminTicker);
  window.__hypeAdminTicker = setInterval(()=>renderConfigTickets(),1000);
}

/* ========================= PORTARIA ========================= */

async function initPortaria() {
  if (!(await requireLogin("portaria"))) { showLogin(); return; }
  hideLogin();
  document.getElementById("portariaSearch")?.focus();
}

async function searchClient() {
  const query = document.getElementById('portariaSearch')?.value.trim() || '';
  const container = document.getElementById('resultsContainer');
  if (!container) return;
  if (!query) { container.innerHTML='<div class="empty-state">Digite nome, WhatsApp ou #HYPE.</div>'; return; }
  try {
    const list = await loadStaffTickets(query);
    renderPortariaResults(list);
  } catch(err){ container.innerHTML=`<div class="empty-state" style="color:var(--red)">${hypeEscape(err.message)}</div>`; }
}

function renderPortariaResults(list) {
  const container = document.getElementById('resultsContainer');
  if (!list.length) { container.innerHTML='<div class="empty-state" style="color:var(--red)">❌ Nenhum ingresso encontrado.</div>'; return; }
  container.innerHTML = list.map(item=>{
    const paid = item.payment_status==='Pago';
    const used = item.entry_status==='Entrada utilizada';
    const canceled = item.payment_status==='Cancelado';
    const cls = canceled ? 'cancelado' : used ? 'used' : paid ? 'pago' : 'pendente';
    let text = canceled ? 'CANCELADO ❌' : used ? 'JÁ ENTROU ⚠️' : paid ? 'LIBERADO ✅' : 'BLOQUEADO ❌';
    const canValidate = paid && !used && !canceled;
    return `<div class="result-card ${cls}"><div class="client-info"><h3>${hypeEscape(item.customer_name)}</h3><div class="client-details"><span class="badge gender">${hypeEscape(item.gender||'N/I')}</span><span>•</span><strong>${hypeEscape(item.lot_name||'')}</strong></div><div class="portaria-extra">${hypeEscape(item.ticket_code)}${item.entry_at ? ` • Entrada: ${hypeFormatDateTime(item.entry_at)}`:''}</div></div><div class="status-area"><div class="status-tag ${cls}">${text}</div>${canValidate?`<button class="btn-entry" onclick="validateEntry('${hypeEscape(item.ticket_code)}')">✅ LIBERAR ENTRADA</button>`:''}</div></div>`;
  }).join('');
}

async function validateEntry(code) {
  try {
    const device = `${navigator.userAgent.slice(0,40)} | ${location.hostname}`;
    const rows = await sbRpc('staff_validate_entry',{p_username:HYPE.user,p_password:HYPE.pass,p_code:code,p_device:device});
    const result = Array.isArray(rows)?rows[0]:rows;
    if (!result?.ok) { alert(result?.message || 'Entrada negada.'); return; }
    hypeNotify('✅ ENTRADA LIBERADA');
    await searchClient();
  } catch(err){ alert(err.message); }
}

async function startQrScanner() {
  const area = document.getElementById('scannerArea');
  const video = document.getElementById('qrVideo');
  if (!area || !video) return;
  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    return alert('Seu navegador não suporta leitura automática de QR. Use a busca pelo código do ingresso.');
  }
  try {
    HYPE.scannerStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    video.srcObject = HYPE.scannerStream;
    area.classList.add('show');
    const detector = new BarcodeDetector({formats:['qr_code']});
    clearInterval(HYPE.scannerTimer);
    HYPE.scannerTimer = setInterval(async()=>{
      if (video.readyState < 2) return;
      try {
        const codes = await detector.detect(video);
        if (codes?.length && codes[0].rawValue) {
          document.getElementById('portariaSearch').value = codes[0].rawValue;
          stopQrScanner();
          await validateEntry(codes[0].rawValue);
        }
      } catch (_) {}
    }, 450);
  } catch(err){ alert('Não foi possível abrir a câmera: ' + err.message); }
}

function stopQrScanner() {
  clearInterval(HYPE.scannerTimer);
  HYPE.scannerTimer = null;
  if (HYPE.scannerStream) HYPE.scannerStream.getTracks().forEach(t=>t.stop());
  HYPE.scannerStream = null;
  document.getElementById('scannerArea')?.classList.remove('show');
}


/* ========================= EVENTO / ARTISTA ========================= */

function eventManagerPreviewFields() {
  const get = id => document.getElementById(id)?.value || "";
  const artist = document.getElementById("previewArtist");
  const eventName = document.getElementById("previewEventName");
  const meta = document.getElementById("previewEventMeta");
  const desc = document.getElementById("previewDescription");
  if (artist) artist.textContent = get("eventArtist") || "ARTISTA";
  if (eventName) eventName.textContent = get("eventName") || "Nome do evento";
  const bits = [];
  if (get("eventDate")) bits.push(new Date(get("eventDate")+"T12:00:00").toLocaleDateString("pt-BR"));
  if (get("eventOpening")) bits.push("Abertura " + get("eventOpening"));
  if (get("eventVenue")) bits.push(get("eventVenue"));
  if (meta) meta.textContent = bits.join(" • ") || "Data • Local";
  if (desc) desc.textContent = get("eventDescription");
}

async function initEventManager() {
  if (!(await requireLogin("admin"))) {
    const login = document.getElementById("loginScreen");
    if (login) login.style.display = "grid";
    return;
  }
  if (!["admin","gerente"].includes(HYPE.role)) {
    sessionClear();
    alert("Somente Admin/Gerente pode editar o evento.");
    return;
  }
  const login = document.getElementById("loginScreen");
  if (login) login.style.display = "none";
  await loadPublicState();
  fillEventManager();
}

async function eventManagerLogin() {
  const username = document.getElementById("eventAdminUser")?.value.trim() || "";
  const password = document.getElementById("eventAdminPass")?.value || "";
  if (!username || !password) return alert("Informe usuário e senha.");
  try {
    const found = await verifyStaff(username, password);
    if (!found || !["admin","gerente"].includes(found.role)) return alert("Conta sem permissão.");
    sessionSave(found.username, password, found.role);
    document.getElementById("loginScreen").style.display = "none";
    await loadPublicState();
    fillEventManager();
  } catch (err) { alert(err.message); }
}

function fillEventManager() {
  const e = HYPE.event || {};
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = value || ""; };
  set("eventName", e.name);
  set("eventArtist", e.artist_name);
  set("eventDate", e.event_date);
  set("eventOpening", e.opening_time ? String(e.opening_time).slice(0,5) : "");
  set("eventClosing", e.closing_time ? String(e.closing_time).slice(0,5) : "");
  set("eventVenue", e.venue);
  set("eventDescription", e.description);
  HYPE.eventImageData = e.cover_image || "";
  const img = document.getElementById("eventPreviewImg");
  if (img && HYPE.eventImageData) {
    img.src = HYPE.eventImageData;
    img.style.display = "block";
  }
  eventManagerPreviewFields();
  ["eventName","eventArtist","eventDate","eventOpening","eventClosing","eventVenue","eventDescription"]
    .forEach(id => document.getElementById(id)?.addEventListener("input", eventManagerPreviewFields));
}

function previewEventImage(input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Escolha uma imagem válida.");
  if (file.size > 8 * 1024 * 1024) return alert("A imagem deve ter no máximo 8 MB.");

  const reader = new FileReader();
  reader.onload = () => {
    const original = new Image();
    original.onload = () => {
      const maxW = 1600, maxH = 1200;
      let w = original.width, h = original.height;
      const scale = Math.min(1, maxW / w, maxH / h);
      w = Math.round(w * scale); h = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(original, 0, 0, w, h);
      HYPE.eventImageData = canvas.toDataURL("image/jpeg", 0.82);
      const preview = document.getElementById("eventPreviewImg");
      if (preview) { preview.src = HYPE.eventImageData; preview.style.display = "block"; }
    };
    original.src = reader.result;
  };
  reader.readAsDataURL(file);
}

async function saveEventManager() {
  if (!HYPE.user || !HYPE.pass) return alert("Faça login novamente.");
  const val = id => document.getElementById(id)?.value || "";
  try {
    await sbRpc("staff_save_event_v2", {
      p_username: HYPE.user,
      p_password: HYPE.pass,
      p_event_id: HYPE.event?.id ? Number(HYPE.event.id) : null,
      p_name: val("eventName"),
      p_artist_name: val("eventArtist"),
      p_event_date: val("eventDate") || null,
      p_opening_time: val("eventOpening") || null,
      p_closing_time: val("eventClosing") || null,
      p_venue: val("eventVenue"),
      p_description: val("eventDescription"),
      p_cover_image: HYPE.eventImageData || "",
      p_active: true,
      p_sort_order: Number(HYPE.event?.sort_order || 0)
    });
    await loadPublicState();
    fillEventManager();
    hypeNotify("Evento publicado no site!");
  } catch (err) {
    alert(err.message || "Erro ao salvar evento.");
  }
}



/* ========================= BOOT ========================= */

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (document.getElementById('ticketForm')) {
      await initClient();
    } else if (document.getElementById('adminPass')) {
      await initAdmin();
    } else if (document.getElementById('portariaPass')) {
      await initPortaria();
    } else if (document.getElementById('eventManagerForm') || document.getElementById('eventAdminUser')) {
      await initEventManager();
    }
  } catch (err) {
    console.error(err);
    alert(err.message || 'Erro ao inicializar o sistema.');
  }
});
