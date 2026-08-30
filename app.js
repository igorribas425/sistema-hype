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
  event: null,
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
  const [lots, pix, eventRows] = await Promise.all([
    sbRpc("public_lots"),
    sbRpc("public_pix_key"),
    sbRpc("public_event")
  ]);
  HYPE.lots = Array.isArray(lots) ? lots : [];
  HYPE.pixKey = typeof pix === "string" ? pix : "";
  HYPE.event = Array.isArray(eventRows) ? (eventRows[0] || null) : (eventRows || null);
  return HYPE.lots;
}

function renderPublicEvent() {
  const e = HYPE.event;
  const hero = document.getElementById("eventHero");
  if (!hero || !e) return;

  const artist = document.getElementById("eventHeroArtist");
  const name = document.getElementById("eventHeroName");
  const desc = document.getElementById("eventHeroDescription");
  const meta = document.getElementById("eventHeroMeta");
  const img = document.getElementById("eventHeroImage");

  if (artist) artist.textContent = e.artist_name || e.name || "HYPE";
  if (name) name.textContent = e.name || "Evento HYPE";
  if (desc) desc.textContent = e.description || "";

  const bits = [];
  if (e.event_date) {
    const d = new Date(`${e.event_date}T12:00:00`);
    bits.push(d.toLocaleDateString("pt-BR"));
  }
  if (e.opening_time) bits.push(`Abertura ${String(e.opening_time).slice(0,5)}`);
  if (e.venue) bits.push(e.venue);
  if (meta) meta.textContent = bits.join(" • ");

  if (img && e.cover_image) {
    img.src = e.cover_image;
    img.style.display = "block";
  }
  hero.classList.add("show");
}

async function loadStaffTickets(search = "") {
  if (!HYPE.user || !HYPE.pass) throw new Error("Usuário não autenticado.");
  const rows = await sbRpc("staff_list_tickets", {
    p_username: HYPE.user,
    p_password: HYPE.pass,
    p_search: search
  });
  HYPE.tickets = Array.isArray(rows) ? rows : [];
  return HYPE.tickets;
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
    renderPublicEvent();
    renderClientTickets();
    updateClientTicketState();
    clearInterval(clientTicker);
    clientTicker = setInterval(async () => {
      try { await loadPublicState(); renderPublicEvent(); renderClientTickets(document.getElementById("ticketType")?.value); updateClientTicketState(); }
      catch (_) { /* mantém a última tela */ }
    }, 5000);
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

async function generatePix(e) {
  e.preventDefault();
  const select = document.getElementById("ticketType");
  const lotId = Number(select?.value);
  if (!lotId) return alert("Nenhum lote disponível.");
  const name = document.getElementById("clientName")?.value.trim() || "";
  const phone = document.getElementById("clientPhone")?.value.trim() || "";
  const cpf = document.getElementById("clientCpf")?.value.trim() || "";
  const gender = document.getElementById("clientGender")?.value || "";
  if (!name) return alert("Informe seu nome.");
  try {
    const rows = await sbRpc("create_ticket", { p_name:name, p_phone:phone, p_cpf:cpf, p_gender:gender, p_lot_id:lotId });
    const entry = Array.isArray(rows) ? rows[0] : rows;
    if (!entry) throw new Error("Não foi possível criar o ingresso.");
    HYPE.currentEntryId = entry.id;

    const qrValue = entry.qr_token || entry.ticket_code;
    const pixKey = HYPE.pixKey || "";
    const pixPayload = pixKey ? `00020126580014br.gov.bcb.pix0136${pixKey}5204000053039865802BR5910BOATE HYPE6009CARAZINHO62070503***6304` : "";
    const qrImg = document.getElementById("qrImg");
    if (qrImg) {
      // QR do pagamento (PIX) continua separado do QR do ingresso.
      qrImg.src = pixPayload ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(pixPayload)}` : "";
    }
    const pixText = document.getElementById("pixKeyText");
    if (pixText) pixText.innerText = pixKey || "Chave PIX ainda não cadastrada no Admin.";
    document.getElementById("pixArea").style.display = "block";
    document.getElementById("ticketForm").style.display = "none";
    hypeNotify(`Pedido ${entry.ticket_code} criado com sucesso!`);

    fillTicketCard(entry);
  } catch (err) {
    await loadPublicState().catch(()=>{});
    renderClientTickets();
    alert(err.message || "Erro ao criar ingresso.");
  }
}

function fillTicketCard(entry) {
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.innerText = value ?? ""; };
  set("tClientName", entry.customer_name);
  set("tClientPhone", entry.phone || "Não informado");
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

async function initAdmin(fromLogin = false) {
  if (!fromLogin && !(await requireLogin("admin"))) { showLogin(); return; }
  hideLogin();
  if (!['admin','gerente','caixa'].includes(HYPE.role)) return alert("Sem permissão.");
  try {
    await Promise.all([loadPublicState(), loadStaffTickets(""), loadUsersIfAllowed()]);
    renderConfigTickets();
    renderClientsTable();
    renderUsers();
    const pix = document.getElementById("pixKeyInput"); if (pix) pix.value = HYPE.pixKey || "";
    startAdminTicker();
    clearInterval(HYPE.refreshTimer);
    HYPE.refreshTimer = setInterval(async () => {
      try { await loadPublicState(); await loadStaffTickets(document.getElementById("searchInput")?.value || ""); renderConfigTickets(); renderClientsTable(); }
      catch (_) {}
    }, 5000);
  } catch (err) {
    alert(err.message);
  }
}

function renderConfigTickets() {
  const target = document.getElementById("ticketConfigList");
  if (!target) return;
  if (!['admin','gerente'].includes(HYPE.role)) {
    target.innerHTML = `<div class="info-note">Seu perfil não pode alterar lotes.</div>`;
    return;
  }
  const lots = HYPE.lots || [];
  if (!lots.length) {
    target.innerHTML = `<div class="empty-lots">Nenhum ingresso/lote cadastrado ainda. Use o formulário acima para criar o primeiro e definir o preço.</div>`;
    return;
  }
  target.innerHTML = lots.map((t, i) => `
    <div class="ticket-admin-card">
      <div class="ticket-admin-head"><strong>${hypeEscape(t.name)}</strong><span class="schedule-badge ${hypeStatus(t).code === 'active' ? 'active' : hypeStatus(t).code === 'upcoming' ? 'upcoming' : 'expired'}">${hypeEscape(hypeStatus(t).label)}</span></div>
      <div class="ticket-admin-grid ticket-admin-grid-wide">
        <div class="form-group"><label>Nome</label><input id="tName_${i}" value="${hypeEscape(t.name)}"></div>
        <div class="form-group"><label>Setor</label><input id="tSector_${i}" value="${hypeEscape(t.sector || '')}"></div>
        <div class="form-group"><label>Preço</label><input id="tPrice_${i}" type="number" step="0.01" min="0" value="${Number(t.price || 0)}"></div>
        <div class="form-group"><label>Quantidade (0 = ilimitado)</label><input id="tQty_${i}" type="number" min="0" value="${Number(t.quantity_total || 0)}"></div>
        <div class="form-group"><label>Início</label><input id="tStart_${i}" type="datetime-local" value="${toDateTimeLocal(t.starts_at)}"></div>
        <div class="form-group"><label>Expiração</label><input id="tEnd_${i}" type="datetime-local" value="${toDateTimeLocal(t.ends_at)}"></div>
      </div>
      <div class="ticket-admin-preview"><span>Vendidos: <b>${Number(t.quantity_sold || 0)}</b></span><span>Disponíveis: <b>${t.quantity_total ? Math.max(0,Number(t.quantity_available||0)) : '∞'}</b></span><span>Setor: <b>${hypeEscape(t.sector||'Pista')}</b></span><span>${hypeEscape(hypeCountdownText(t))}</span></div>
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


async function createNewLot() {
  if (!['admin','gerente'].includes(HYPE.role)) return alert("Somente Admin/Gerente pode criar ingressos.");
  const name = document.getElementById("newLotName")?.value.trim() || "";
  const sector = document.getElementById("newLotSector")?.value.trim() || "Pista";
  const priceRaw = document.getElementById("newLotPrice")?.value;
  const qtyRaw = document.getElementById("newLotQty")?.value;
  const startRaw = document.getElementById("newLotStart")?.value || "";
  const endRaw = document.getElementById("newLotEnd")?.value || "";

  const price = Number(priceRaw);
  const qty = Number(qtyRaw || 0);

  if (!name) return alert("Digite o nome do ingresso.");
  if (priceRaw === "" || !Number.isFinite(price) || price < 0) return alert("Digite um preço válido.");
  if (!Number.isFinite(qty) || qty < 0) return alert("Digite uma quantidade válida.");

  let startAt = null, endAt = null;
  try {
    startAt = fromDateTimeLocal(startRaw);
    endAt = fromDateTimeLocal(endRaw);
  } catch (_) {
    return alert("Confira as datas e horários.");
  }

  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
    return alert("A expiração precisa ser depois do início da venda.");
  }

  try {
    await sbRpc("staff_upsert_lot", {
      p_username: HYPE.user,
      p_password: HYPE.pass,
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

    ["newLotName","newLotSector","newLotPrice","newLotStart","newLotEnd"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const qtyEl = document.getElementById("newLotQty");
    if (qtyEl) qtyEl.value = "0";

    await loadPublicState();
    renderConfigTickets();
    hypeNotify("Ingresso criado com sucesso.");
  } catch (err) {
    alert(err.message || "Erro ao criar ingresso.");
  }
}

async function updateTicket(index) {
  const t = HYPE.lots[index];
  if (!t) return;
  try {
    const name = document.getElementById(`tName_${index}`).value.trim();
    const sector = document.getElementById(`tSector_${index}`).value.trim();
    const price = Number(document.getElementById(`tPrice_${index}`).value);
    const qty = Number(document.getElementById(`tQty_${index}`).value);
    const startAt = fromDateTimeLocal(document.getElementById(`tStart_${index}`).value);
    const endAt = fromDateTimeLocal(document.getElementById(`tEnd_${index}`).value);
    await sbRpc("staff_upsert_lot", {p_username:HYPE.user,p_password:HYPE.pass,p_id:t.id,p_name:name,p_sector:sector,p_price:price,p_quantity_total:qty,p_starts_at:startAt,p_ends_at:endAt,p_active:true,p_sort_order:index+1});
    await loadPublicState(); renderConfigTickets(); hypeNotify("Lote atualizado.");
  } catch (err) { alert(err.message); }
}

async function clearTicketSchedule(index) {
  const t = HYPE.lots[index];
  if (!t) return;
  try {
    await sbRpc("staff_upsert_lot", {p_username:HYPE.user,p_password:HYPE.pass,p_id:t.id,p_name:t.name,p_sector:t.sector,p_price:Number(t.price),p_quantity_total:Number(t.quantity_total),p_starts_at:null,p_ends_at:null,p_active:true,p_sort_order:index+1});
    await loadPublicState(); renderConfigTickets(); hypeNotify("Horários removidos.");
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
  const list = (HYPE.tickets || []).filter(item => String(item.customer_name || '').toLowerCase().includes(term) || String(item.lot_name || '').toLowerCase().includes(term) || String(item.ticket_code || '').toLowerCase().includes(term));
  if (!list.length) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:30px">Nenhum cliente encontrado.</td></tr>`;
  else tbody.innerHTML = list.map(item => {
    const status = item.payment_status === 'Pago' ? 'pago' : item.payment_status === 'Cancelado' ? 'cancelado' : 'pendente';
    const entry = item.entry_status === 'Entrada utilizada' ? ` • Entrada ${hypeFormatDateTime(item.entry_at)}` : '';
    const canPay = ['admin','gerente','caixa'].includes(HYPE.role);
    return `<tr><td><strong>${hypeEscape(item.customer_name)}</strong><br><span class="badge gender">${hypeEscape(item.gender || 'N/I')}</span><small style="color:var(--muted)">${hypeEscape(item.ticket_code)}${entry}</small></td><td>${hypeFormatMoney(item.price)}<br><small style="color:var(--muted)">${hypeEscape(item.lot_name || '')}</small></td><td><span class="badge ${status}">${hypeEscape(item.payment_status.toUpperCase())}</span><br><small>${hypeEscape(item.entry_status)}</small></td><td><div class="actions-cell">${canPay && item.payment_status !== 'Pago' ? `<button class="btn-action" onclick="setPayment(${item.id},'Pago')">CONFIRMAR</button>` : ''}${canPay && item.payment_status === 'Pago' ? `<button class="btn-action" onclick="setPayment(${item.id},'Pendente')">PENDENTE</button>` : ''}${canPay && item.payment_status !== 'Cancelado' ? `<button class="btn-action btn-del" onclick="setPayment(${item.id},'Cancelado')">CANCELAR</button>` : ''}</div></td></tr>`;
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

async function setPayment(id, status) {
  if (!confirm(`${status === 'Pago' ? 'Confirmar pagamento' : status === 'Cancelado' ? 'Cancelar ingresso' : 'Voltar para pendente'}?`)) return;
  try { await sbRpc("staff_set_payment", {p_username:HYPE.user,p_password:HYPE.pass,p_ticket_id:id,p_status:status}); await loadStaffTickets(document.getElementById('searchInput')?.value||''); renderClientsTable(); hypeNotify(`Status atualizado para ${status}.`); }
  catch (err) { alert(err.message); }
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
  const headers = ['id','ticket_code','customer_name','phone','cpf','gender','lot_name','sector','price','payment_status','entry_status','purchased_at','paid_at','entry_at'];
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
    await sbRpc("staff_save_event", {
      p_username: HYPE.user,
      p_password: HYPE.pass,
      p_name: val("eventName"),
      p_artist_name: val("eventArtist"),
      p_event_date: val("eventDate") || null,
      p_opening_time: val("eventOpening") || null,
      p_closing_time: val("eventClosing") || null,
      p_venue: val("eventVenue"),
      p_description: val("eventDescription"),
      p_cover_image: HYPE.eventImageData || ""
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
