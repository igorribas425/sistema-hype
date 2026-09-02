/* HYPE V16.8 - PROMOTER GLOBAL
   Um único link de promoter funciona em todos os eventos atuais e futuros.
   Requer SUPABASE_V16_8_PROMOTER_GLOBAL.sql.
*/
(() => {
  const OFFICIAL_DOMAIN = 'https://hypeloungeclub.com.br';
  let rendering = false;
  let lastLoadAt = 0;

  function esc(value) {
    if (typeof hypeEscape === 'function') return hypeEscape(value);
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  function money(value) {
    if (typeof hypeFormatMoney === 'function') return hypeFormatMoney(value);
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
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
    return `${OFFICIAL_DOMAIN}/cliente.html?promoter=${encodeURIComponent(String(row.code || '').trim().toUpperCase())}`;
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

  // Mantém compatibilidade com links antigos ?event=ID&promoter=CODIGO,
  // mas o promoter NÃO fica mais preso ao evento do link.
  window.hypeReadPromoterLinkV16 = function() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const code = String(params.get('promoter') || '').trim().toUpperCase();
      const eventId = Number(params.get('event') || 0) || null;
      HYPE.promoterLinkCode = code;
      HYPE.promoterLinkEventId = null;
      return { code, eventId };
    } catch (_) {
      HYPE.promoterLinkCode = '';
      HYPE.promoterLinkEventId = null;
      return { code:'', eventId:null };
    }
  };

  window.hypeApplyPromoterLinkV16 = function() {
    const input = document.getElementById('clientPromoter');
    const status = document.getElementById('clientPromoterStatus');
    const code = String(HYPE?.promoterLinkCode || '').trim().toUpperCase();
    if (input) input.value = code;
    if (status) {
      if (code) {
        status.innerHTML = `✅ Compra vinculada ao promoter <b>${esc(code)}</b>. Este link vale para qualquer evento HYPE.`;
        status.className = 'v16-coupon-status ok';
      } else {
        status.textContent = 'Compra direta: nenhum promoter vinculado.';
        status.className = 'v16-coupon-status';
      }
    }
  };

  async function loadGlobalPromoters() {
    if (!HYPE?.user || !HYPE?.pass || HYPE?.role !== 'admin') return [];
    const rows = await sbRpc('staff_list_promoters_global_v16', {
      p_username: HYPE.user,
      p_password: HYPE.pass
    });
    return (Array.isArray(rows) ? rows : []).sort((a,b) =>
      Number(b.paid_count || 0) - Number(a.paid_count || 0) ||
      Number(b.sales_count || 0) - Number(a.sales_count || 0) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
    );
  }

  async function renderPromotersGlobal(force = false) {
    const box = document.getElementById('v16PromoterList');
    if (!box || HYPE?.role !== 'admin' || rendering) return;
    if (!force && Date.now() - lastLoadAt < 1500 && box.dataset.globalLoaded === '1') return;

    rendering = true;
    box.innerHTML = '<div style="margin-top:12px;color:var(--muted);font-size:12px">Carregando promoters globais...</div>';
    try {
      const rows = await loadGlobalPromoters();
      window.__HYPE_V168_PROMOTERS = rows;
      HYPE.promoters = rows;
      lastLoadAt = Date.now();
      box.dataset.globalLoaded = '1';

      if (!rows.length) {
        box.innerHTML = '<div style="margin-top:12px;padding:14px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:12px">Nenhum promoter gerado ainda. Crie uma vez e o mesmo link funcionará em todos os eventos.</div>';
        return;
      }

      box.innerHTML = `
        <div style="margin-top:14px;font-size:12px;color:var(--muted);font-weight:800;letter-spacing:.6px">PROMOTERS GLOBAIS • TODOS OS EVENTOS</div>
        ${rows.map((p, index) => `
          <div style="margin-top:10px;padding:13px;border:1px solid var(--line);border-radius:14px;background:#0b0b0e">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">
              <div style="min-width:0;flex:1">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <strong style="font-size:15px;color:#fff">${index < 3 ? `${index+1}º • ` : ''}${esc(p.name)}</strong>
                  <span style="font-size:10px;padding:4px 7px;border-radius:999px;border:1px solid var(--line);color:${p.active ? '#9ef0b9' : '#ff9aaa'}">${p.active ? 'ATIVO' : 'INATIVO'}</span>
                </div>
                <div style="margin-top:5px;font-size:11px;color:var(--muted)">Código: <b style="color:#fff">${esc(p.code)}</b> • funciona em todos os eventos</div>
                <div style="margin-top:6px;display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--muted)">
                  <span>✅ Pagos: <b style="color:#fff">${Number(p.paid_count || 0)}</b></span>
                  <span>🧾 Pedidos: <b style="color:#fff">${Number(p.sales_count || 0)}</b></span>
                  <span>💰 Faturamento: <b style="color:#fff">${esc(money(p.revenue || 0))}</b></span>
                </div>
                <div style="margin-top:7px;font-size:10px;color:#777;word-break:break-all">${esc(promoterLink(p))}</div>
              </div>
              <div style="display:flex;gap:7px;flex-wrap:wrap">
                <button class="btn-action" type="button" onclick="copyPromoterLinkV168(${Number(p.id)})">🔗 COPIAR LINK</button>
                <button class="btn-action" type="button" onclick="togglePromoterV168(${Number(p.id)})">${p.active ? 'DESATIVAR' : 'ATIVAR'}</button>
                <button class="btn-action btn-del" type="button" onclick="deletePromoterV168(${Number(p.id)})">🗑️ EXCLUIR</button>
              </div>
            </div>
          </div>`).join('')}`;
    } catch (err) {
      box.innerHTML = `<div style="margin-top:12px;color:var(--red);font-size:12px">${esc(err?.message || 'Erro ao carregar promoters.')}</div>`;
    } finally {
      rendering = false;
    }
  }

  window.createPromoterV16 = async function() {
    if (HYPE?.role !== 'admin') return alert('Somente o Admin pode gerenciar promoters.');
    const input = document.getElementById('v16PromoterName');
    const name = input?.value.trim() || '';
    if (!name) return alert('Digite o nome do promoter.');
    try {
      const current = await loadGlobalPromoters();
      const used = new Set(current.map(p => String(p.code || '').toUpperCase()));
      const base = promoterCodeFromName(name);
      let code = base, n = 2;
      while (used.has(code)) code = `${base.slice(0,37)}-${n++}`;

      await sbRpc('staff_upsert_promoter_global_v16', {
        p_username:HYPE.user,
        p_password:HYPE.pass,
        p_id:0,
        p_name:name,
        p_code:code,
        p_active:true
      });
      if (input) input.value = '';
      await renderPromotersGlobal(true);
      const created = (window.__HYPE_V168_PROMOTERS || []).find(p => String(p.code).toUpperCase() === code);
      if (created) await copyText(promoterLink(created));
      if (typeof hypeNotify === 'function') hypeNotify('Promoter criado. Link global copiado.');
    } catch (err) { alert(err?.message || 'Não foi possível criar o promoter.'); }
  };

  window.copyPromoterLinkV16 = async function(id) { return window.copyPromoterLinkV168(id); };
  window.copyPromoterLinkV168 = async function(id) {
    const row = (window.__HYPE_V168_PROMOTERS || []).find(p => Number(p.id) === Number(id));
    if (!row) return alert('Promoter não encontrado.');
    await copyText(promoterLink(row));
    if (typeof hypeNotify === 'function') hypeNotify(`Link global de ${row.name} copiado.`);
  };

  window.togglePromoterV16 = async function(id) { return window.togglePromoterV168(id); };
  window.togglePromoterV168 = async function(id) {
    const row = (window.__HYPE_V168_PROMOTERS || []).find(p => Number(p.id) === Number(id));
    if (!row) return;
    try {
      await sbRpc('staff_upsert_promoter_global_v16', {
        p_username:HYPE.user,
        p_password:HYPE.pass,
        p_id:Number(row.id),
        p_name:row.name,
        p_code:row.code,
        p_active:!row.active
      });
      await renderPromotersGlobal(true);
    } catch (err) { alert(err?.message || 'Não foi possível alterar o promoter.'); }
  };

  window.deletePromoterV168 = async function(id) {
    const row = (window.__HYPE_V168_PROMOTERS || []).find(p => Number(p.id) === Number(id));
    if (!row) return alert('Promoter não encontrado.');
    if (!confirm(`Excluir o promoter ${row.name}?\n\nAs vendas antigas continuam no histórico, mas o link dele deixa de valer para novas compras.`)) return;
    try {
      await sbRpc('staff_delete_promoter_global_v16', {
        p_username:HYPE.user,
        p_password:HYPE.pass,
        p_id:Number(row.id)
      });
      await renderPromotersGlobal(true);
      if (typeof hypeNotify === 'function') hypeNotify('Promoter excluído.');
    } catch (err) { alert(err?.message || 'Não foi possível excluir o promoter.'); }
  };

  // A lista de promoters deixa de depender do evento selecionado.
  if (typeof window.loadV16AdminData === 'function') {
    const originalLoad = window.loadV16AdminData;
    window.loadV16AdminData = async function() {
      const result = await originalLoad.apply(this, arguments);
      if (HYPE?.role === 'admin') await renderPromotersGlobal(true);
      return result;
    };
  }

  if (typeof window.selectAdminEvent === 'function') {
    const originalSelect = window.selectAdminEvent;
    window.selectAdminEvent = async function() {
      const result = await originalSelect.apply(this, arguments);
      if (HYPE?.role === 'admin') await renderPromotersGlobal(true);
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (document.getElementById('v16PromoterList')) renderPromotersGlobal(true);
      if (document.getElementById('ticketForm')) window.hypeApplyPromoterLinkV16();
    }, 900);
  });
})();
