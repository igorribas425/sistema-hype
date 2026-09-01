/* HYPE V16.7 - LISTA DE PROMOTERS + COPIAR LINK + EXCLUIR
   Requer as RPCs V16 existentes e o patch SQL SUPABASE_V16_7_PROMOTER_EXCLUIR.sql.
*/
(() => {
  const OFFICIAL_DOMAIN = 'https://hypeloungeclub.com.br';
  let lastRenderedEventId = null;
  let rendering = false;

  function esc(value) {
    if (typeof hypeEscape === 'function') return hypeEscape(value);
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function money(value) {
    if (typeof hypeFormatMoney === 'function') return hypeFormatMoney(value);
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
  }

  function eventId() {
    return Number(HYPE?.selectedEventId || HYPE?.event?.id || 0);
  }

  function promoterCodeFromName(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 42) || 'PROMOTER';
  }

  function promoterLink(row) {
    return `${OFFICIAL_DOMAIN}/cliente.html?event=${encodeURIComponent(row.event_id)}&promoter=${encodeURIComponent(row.code)}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
  }

  async function loadPromotersV167() {
    const id = eventId();
    if (!id || !HYPE?.user || !HYPE?.pass || HYPE?.role !== 'admin') return [];
    const rows = await sbRpc('staff_list_promoters_v16', {
      p_username: HYPE.user,
      p_password: HYPE.pass,
      p_event_id: id
    });
    return (Array.isArray(rows) ? rows : []).sort((a,b) =>
      Number(b.paid_count || 0) - Number(a.paid_count || 0) ||
      Number(b.sales_count || 0) - Number(a.sales_count || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );
  }

  async function renderPromotersV167(force = false) {
    const box = document.getElementById('v16PromoterList');
    if (!box) return;
    const id = eventId();
    if (!id) {
      box.innerHTML = '<div style="margin-top:12px;color:var(--muted);font-size:12px">Selecione um evento em EVENTOS / SHOWS.</div>';
      return;
    }
    if (HYPE?.role !== 'admin') return;
    if (rendering) return;
    if (!force && lastRenderedEventId === id && box.dataset.loaded === '1') return;

    rendering = true;
    box.innerHTML = '<div style="margin-top:12px;color:var(--muted);font-size:12px">Carregando promoters...</div>';
    try {
      const rows = await loadPromotersV167();
      lastRenderedEventId = id;
      box.dataset.loaded = '1';
      if (!rows.length) {
        box.innerHTML = '<div style="margin-top:12px;padding:14px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12px">Nenhum promoter gerado neste evento ainda.</div>';
        return;
      }

      box.innerHTML = `
        <div style="margin-top:14px;font-size:12px;color:var(--muted);font-weight:800;letter-spacing:.6px">PROMOTERS JÁ GERADOS</div>
        ${rows.map((p, index) => {
          const link = promoterLink(p);
          const rank = index + 1;
          return `
            <div style="margin-top:10px;padding:13px;border:1px solid var(--line);border-radius:14px;background:#0b0b0e">
              <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
                <div style="min-width:0;flex:1">
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <strong style="font-size:15px;color:#fff">${rank <= 3 ? `${rank}º • ` : ''}${esc(p.name)}</strong>
                    <span style="font-size:10px;padding:4px 7px;border-radius:999px;border:1px solid var(--line);color:${p.active ? '#9ef0b9' : '#ff9aaa'}">${p.active ? 'ATIVO' : 'INATIVO'}</span>
                  </div>
                  <div style="margin-top:5px;font-size:11px;color:var(--muted)">Código: <b style="color:#fff">${esc(p.code)}</b></div>
                  <div style="margin-top:6px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--muted)">
                    <span>✅ Pagos: <b style="color:#fff">${Number(p.paid_count || 0)}</b></span>
                    <span>🧾 Pedidos: <b style="color:#fff">${Number(p.sales_count || 0)}</b></span>
                    <span>💰 Faturamento: <b style="color:#fff">${esc(money(p.revenue || 0))}</b></span>
                  </div>
                  <div style="margin-top:7px;font-size:10px;color:#777;word-break:break-all">${esc(link)}</div>
                </div>
                <div style="display:flex;gap:7px;flex-wrap:wrap">
                  <button class="btn-action" type="button" onclick="copyPromoterLinkV167(${Number(p.id)})">🔗 COPIAR LINK</button>
                  <button class="btn-action btn-del" type="button" onclick="deletePromoterV167(${Number(p.id)}, '${esc(String(p.name).replace(/'/g, '&#39;'))}')">🗑️ EXCLUIR</button>
                </div>
              </div>
            </div>`;
        }).join('')}`;

      window.__HYPE_V167_PROMOTERS = rows;
    } catch (err) {
      box.innerHTML = `<div style="margin-top:12px;color:var(--red);font-size:12px">${esc(err?.message || 'Erro ao carregar promoters.')}</div>`;
    } finally {
      rendering = false;
    }
  }

  window.copyPromoterLinkV167 = async function(id) {
    const row = (window.__HYPE_V167_PROMOTERS || []).find(p => Number(p.id) === Number(id));
    if (!row) return alert('Promoter não encontrado.');
    await copyText(promoterLink(row));
    if (typeof hypeNotify === 'function') hypeNotify('Link do promoter copiado.');
    else alert('Link copiado.');
  };

  window.deletePromoterV167 = async function(id, name) {
    const eid = eventId();
    if (!eid) return alert('Selecione um evento.');
    if (!confirm(`Excluir o promoter ${name || ''}?\n\nAs vendas antigas continuam registradas, mas o link dele deixa de valer para novas compras.`)) return;
    try {
      await sbRpc('staff_delete_promoter_v16', {
        p_username: HYPE.user,
        p_password: HYPE.pass,
        p_event_id: eid,
        p_id: Number(id)
      });
      lastRenderedEventId = null;
      const box = document.getElementById('v16PromoterList');
      if (box) box.dataset.loaded = '0';
      await renderPromotersV167(true);
      if (typeof hypeNotify === 'function') hypeNotify('Promoter excluído.');
    } catch (err) {
      alert(err?.message || 'Não foi possível excluir o promoter.');
    }
  };

  // Substitui a criação antiga: o Admin informa somente o nome.
  window.createPromoterV16 = async function() {
    const input = document.getElementById('v16PromoterName');
    const name = input?.value.trim() || '';
    const eid = eventId();
    if (!eid) return alert('Selecione primeiro o evento em EVENTOS / SHOWS.');
    if (!name) return alert('Digite o nome do promoter.');
    try {
      const current = await loadPromotersV167();
      const used = new Set(current.map(p => String(p.code || '').toUpperCase()));
      const base = promoterCodeFromName(name);
      let code = base;
      let n = 2;
      while (used.has(code)) code = `${base.slice(0, 37)}-${n++}`;

      await sbRpc('staff_upsert_promoter_v16', {
        p_username: HYPE.user,
        p_password: HYPE.pass,
        p_event_id: eid,
        p_id: 0,
        p_name: name,
        p_code: code,
        p_active: true
      });
      if (input) input.value = '';
      lastRenderedEventId = null;
      const box = document.getElementById('v16PromoterList');
      if (box) box.dataset.loaded = '0';
      await renderPromotersV167(true);
      const created = (window.__HYPE_V167_PROMOTERS || []).find(p => String(p.code).toUpperCase() === code);
      if (created) await copyText(promoterLink(created));
      if (typeof hypeNotify === 'function') hypeNotify('Promoter criado e link copiado.');
    } catch (err) {
      alert(err?.message || 'Não foi possível criar o promoter.');
    }
  };

  // Atualiza a lista toda vez que o Admin troca de evento.
  if (typeof window.selectAdminEvent === 'function') {
    const originalSelectAdminEvent = window.selectAdminEvent;
    window.selectAdminEvent = async function(eventIdValue) {
      const result = await originalSelectAdminEvent.apply(this, arguments);
      lastRenderedEventId = null;
      const box = document.getElementById('v16PromoterList');
      if (box) box.dataset.loaded = '0';
      await renderPromotersV167(true);
      return result;
    };
  }

  // Também acompanha renderizações do painel após login/recarga.
  if (typeof window.renderAdminEvents === 'function') {
    const originalRenderAdminEvents = window.renderAdminEvents;
    window.renderAdminEvents = function() {
      const result = originalRenderAdminEvents.apply(this, arguments);
      setTimeout(() => renderPromotersV167(false), 0);
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => renderPromotersV167(true), 700);
  });
})();
