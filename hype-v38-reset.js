/* HYPE V38 — ZERAR CONTADORES SEM APAGAR DADOS
   Guarda uma linha-base no próprio navegador.
   As vendas/ingressos reais continuam intactos.
*/
(() => {
  'use strict';

  const PAGE = /portaria\.html/i.test(location.pathname) ? 'portaria' : /admin\.html/i.test(location.pathname) ? 'admin' : '';
  if (!PAGE) return;

  const targets = PAGE === 'admin'
    ? [
        ['totalCount','Total na lista','number'],
        ['paidCount','Pagos','number'],
        ['pendingCount','Pendentes','number'],
        ['totalCash','Caixa','money'],
        ['enteredCount','Entraram','number'],
        ['canceledCount','Cancelados','number'],
        ['pendingValue','Pendente em R$','money'],
        ['v16DashSold','Dashboard: ingressos pagos','number'],
        ['v16DashRevenue','Dashboard: faturamento','money'],
        ['v16DashFemale','Dashboard: feminino','number'],
        ['v16DashMale','Dashboard: masculino','number'],
        ['v16DashDiscount','Dashboard: descontos','money'],
        ['v16DashEntered','Dashboard: entraram','number'],
        ['v34InsideNow','Check-in: dentro agora','number'],
        ['v34EnteredTotal','Check-in: entraram total','number'],
        ['v34TempOut','Check-in: saída temporária','number'],
        ['v34Remaining','Check-in: ainda não chegaram','number'],
        ['v34Reentries','Check-in: reentradas','number'],
        ['v34PaidTotal','Check-in: ingressos pagos','number'],
        ['v34SurveyEligible','Pesquisa: compareceram','number'],
        ['v34SurveyInvited','Pesquisa: convites enviados','number'],
        ['v35SurveyEmail','Pesquisa: Gmail','number'],
        ['v35SurveyWhatsApp','Pesquisa: WhatsApp','number'],
        ['v34SurveyAnswers','Pesquisa: respostas','number']
      ]
    : [
        ['enteredCount','Já entraram','number'],
        ['remainingCount','Faltam entrar','number'],
        ['paidCount','Pagos','number'],
        ['femaleCount','Feminino dentro','number'],
        ['maleCount','Masculino dentro','number']
      ];

  const map = new Map(targets.map(([id,label,type]) => [id,{id,label,type}]));
  const raw = new Map();
  const guard = new Set();

  function parseNumber(text) {
    const s = String(text ?? '').trim();
    if (!s) return 0;
    if (/R\$/i.test(s)) {
      const n = Number(s.replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));
      return Number.isFinite(n) ? n : 0;
    }
    const n = Number(s.replace(/[^\d.-]/g,''));
    return Number.isFinite(n) ? n : 0;
  }

  function format(v,type) {
    const n = Math.max(0, Number(v || 0));
    if (type === 'money') return n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    return String(Math.round(n));
  }

  function eventKey() {
    if (PAGE === 'portaria') return String(Number(localStorage.getItem('hype_portaria_event_v18') || 0) || '0');
    try {
      const v34 = Number(document.getElementById('v34EventSelect')?.value || 0);
      const v16raw = document.getElementById('v16DashboardEvent')?.value || '';
      const selected = Number(window.HYPE?.selectedEventId || 0);
      return String(v34 || selected || (v16raw === 'all' ? 'all' : Number(v16raw || 0)) || 'all');
    } catch (_) {
      return 'all';
    }
  }

  function key(id) {
    return `hype_v38_reset::${PAGE}::${eventKey()}::${id}`;
  }

  function getBaseline(id) {
    const n = Number(localStorage.getItem(key(id)) || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function setBaseline(id,value) {
    localStorage.setItem(key(id), String(Number(value || 0)));
  }

  function historyKey() { return `hype_v38_reset_history::${PAGE}`; }

  function addHistory(id, value) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(historyKey()) || '[]'); } catch (_) {}
    const meta = map.get(id);
    list.unshift({
      at:new Date().toISOString(),
      event:eventKey(),
      id,
      label:meta?.label || id,
      baseline:Number(value || 0)
    });
    localStorage.setItem(historyKey(), JSON.stringify(list.slice(0,80)));
  }

  function apply(id) {
    const el = document.getElementById(id);
    const meta = map.get(id);
    if (!el || !meta) return;

    if (!raw.has(id)) raw.set(id, parseNumber(el.textContent));
    const value = Number(raw.get(id) || 0);
    const baseline = getBaseline(id);
    const adjusted = Math.max(0, value - baseline);

    guard.add(id);
    el.textContent = format(adjusted, meta.type);
    setTimeout(() => guard.delete(id), 0);
  }

  function observe(id) {
    const el = document.getElementById(id);
    const meta = map.get(id);
    if (!el || !meta || el.dataset.hypeResetReady === '1') return;
    el.dataset.hypeResetReady = '1';

    raw.set(id, parseNumber(el.textContent));
    apply(id);

    const parent = el.parentElement;
    if (parent) {
      parent.classList.add('hype-v38-reset-card');
      if (!parent.querySelector(`.hype-v38-reset-btn[data-reset-id="${id}"]`)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hype-v38-reset-btn';
        btn.dataset.resetId = id;
        btn.title = `Zerar ${meta.label} sem apagar dados`;
        btn.setAttribute('aria-label', `Zerar ${meta.label}`);
        btn.textContent = '↺';
        btn.addEventListener('click', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          const currentRaw = Number(raw.get(id) ?? parseNumber(el.textContent) ?? 0);
          if (!confirm(`Zerar "${meta.label}" na tela?\n\nIsso NÃO apaga ingressos, pagamentos ou histórico. Apenas começa esta contagem visual do zero neste navegador.`)) return;
          setBaseline(id,currentRaw);
          addHistory(id,currentRaw);
          apply(id);
          if (typeof window.hypeNotify === 'function') window.hypeNotify(`${meta.label} zerado na tela.`);
        });
        parent.appendChild(btn);
      }
    }

    new MutationObserver(() => {
      if (guard.has(id)) return;
      raw.set(id, parseNumber(el.textContent));
      apply(id);
    }).observe(el,{childList:true,characterData:true,subtree:true});
  }

  function mountHistory() {
    if (PAGE !== 'admin' || document.getElementById('hypeV38ResetHistoryBtn')) return;
    const stats = document.querySelector('.stats.stats-extended') || document.querySelector('.stats');
    if (!stats) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:-10px 0 18px';
    wrap.innerHTML = '<button id="hypeV38ResetHistoryBtn" class="hype-v38-reset-history-btn" type="button">🕘 HISTÓRICO DE ZERADAS</button>';
    stats.insertAdjacentElement('afterend',wrap);

    document.body.insertAdjacentHTML('beforeend', `
      <div id="hypeV38ResetModal" class="hype-v38-reset-modal">
        <div class="hype-v38-reset-modal-card">
          <h3>🕘 Histórico de zeradas</h3>
          <p>As zeradas são apenas visuais e ficam salvas neste navegador. Os dados reais do Supabase continuam intactos.</p>
          <div id="hypeV38ResetHistory" class="hype-v38-reset-history"></div>
          <div class="hype-v38-reset-modal-actions">
            <button type="button" id="hypeV38ResetRestore" class="danger">RESTAURAR VALORES REAIS</button>
            <button type="button" id="hypeV38ResetClose">FECHAR</button>
          </div>
        </div>
      </div>`);

    const modal = document.getElementById('hypeV38ResetModal');
    const render = () => {
      let list = [];
      try { list = JSON.parse(localStorage.getItem(historyKey()) || '[]'); } catch (_) {}
      const box = document.getElementById('hypeV38ResetHistory');
      if (!box) return;
      box.innerHTML = list.length ? list.slice(0,40).map(h => {
        const d = new Date(h.at);
        const when = Number.isNaN(d.getTime()) ? h.at : d.toLocaleString('pt-BR');
        return `<div><b>${String(h.label || h.id)}</b><small>${when} • evento ${String(h.event || '')}</small></div>`;
      }).join('') : '<div><small>Nenhuma contagem foi zerada ainda.</small></div>';
    };

    document.getElementById('hypeV38ResetHistoryBtn').onclick = () => {
      render();
      modal?.classList.add('open');
    };
    document.getElementById('hypeV38ResetClose').onclick = () => modal?.classList.remove('open');
    modal?.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });

    document.getElementById('hypeV38ResetRestore').onclick = () => {
      if (!confirm('Restaurar os valores reais de todos os contadores desta tela/evento?')) return;
      targets.forEach(([id]) => localStorage.removeItem(key(id)));
      targets.forEach(([id]) => apply(id));
      render();
      if (typeof window.hypeNotify === 'function') window.hypeNotify('Valores reais restaurados.');
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      targets.forEach(([id]) => observe(id));
      mountHistory();
    }, 900);

    setInterval(() => {
      targets.forEach(([id]) => {
        if (!document.getElementById(id)?.dataset.hypeResetReady) observe(id);
      });
    }, 2200);
  });
})();
