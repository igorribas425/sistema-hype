/* HYPE V95 — Admin em central de ícones
   Home limpa + módulos separados.
*/
(() => {
  'use strict';
  const $ = id => document.getElementById(id);

  const sections = {
    financeiro: {
      title: 'Financeiro',
      subtitle: 'Vendas, caixa e valores acumulados',
      ids: ['v94SalesTopStats','v94SalesFinancePanel','v16DashboardPanel']
    },
    promoters: {
      title: 'Promoters',
      subtitle: 'Equipe, links, vendas e cupons',
      ids: ['v16ManagementPanel']
    },
    lista: {
      title: 'Lista / FREE',
      subtitle: 'Aprovação de fotos, nomes liberados e lista do evento',
      ids: ['v92ListPeoplePanel','v408SimpleListAdmin']
    },
    portaria: {
      title: 'Portaria',
      subtitle: 'Entradas, movimento da noite e quem já entrou',
      ids: ['v34LivePanel','v92PortariaPeoplePanel']
    },
    clientes: {
      title: 'Clientes & Ingressos',
      subtitle: 'Pagamentos, status, busca e ingressos',
      ids: ['adminMainGrid','v95ClientsPanel']
    },
    cadastros: {
      title: 'Cadastros de Clientes',
      subtitle: 'Histórico permanente, frequência e bloqueios',
      ids: ['v103CustomerRegistryPanel']
    },
    eventos: {
      title: 'Eventos & Lotes',
      subtitle: 'Festas, preços, horários e categorias',
      ids: ['eventsAdminPanel','adminMainGrid','v95LotsPanel']
    },
    avaliacao: {
      title: 'Avaliações',
      subtitle: 'Feedbacks deixados pelos clientes na saída',
      ids: ['v92EvaluationPanel']
    },
    ferramentas: {
      title: 'Sorteio & Acessos',
      subtitle: 'Sorteio do evento e dispositivos autorizados',
      ids: ['v18ControlPanel']
    }
  };

  const allIds = [...new Set(Object.values(sections).flatMap(s => s.ids))];

  function hideAll() {
    allIds.forEach(id => {
      const el = $(id);
      if (el) el.classList.remove('v95-show');
    });
    const lots = $('v95LotsPanel');
    const clients = $('v95ClientsPanel');
    if (lots) lots.classList.remove('v95-show');
    if (clients) clients.classList.remove('v95-show');
  }

  async function refreshSection(key) {
    try {
      if (key === 'financeiro') {
        await window.HypeAdminTabsV92?.refreshSales?.(true);
        if (typeof renderV16Dashboard === 'function') renderV16Dashboard();
      } else if (key === 'promoters') {
        if (typeof loadV16AdminData === 'function') await loadV16AdminData();
      } else if (key === 'lista') {
        await window.HypeAdminTabsV92?.refreshPeople?.(true);
        await window.HypeV49Registration?.loadListSettings?.();
      } else if (key === 'portaria') {
        await window.HypeAdminTabsV92?.refreshPeople?.(true);
        await window.HypeV34?.refreshLive?.();
      } else if (key === 'clientes') {
        if (typeof refreshAdminOrders === 'function') await refreshAdminOrders(false);
      } else if (key === 'cadastros') {
        await window.HypeCustomerRegistryV103?.load?.();
      } else if (key === 'eventos') {
        if (typeof loadAdminEvents === 'function') await loadAdminEvents();
        if (typeof renderAdminEvents === 'function') renderAdminEvents();
        if (typeof renderConfigTickets === 'function') renderConfigTickets();
      } else if (key === 'avaliacao') {
        await window.HypeV34?.refreshLive?.();
      } else if (key === 'ferramentas') {
        if (typeof window.hypeV18AdminInit === 'function') await window.hypeV18AdminInit();
      }
    } catch (err) {
      console.warn('[HYPE V95][refresh]', key, err);
    }
  }

  function open(key) {
    const meta = sections[key];
    if (!meta) return;

    hideAll();
    $('v95AdminHome')?.classList.add('v95-hidden');
    $('v95SectionBar')?.classList.remove('v95-hidden');

    const title = $('v95SectionTitle');
    const sub = $('v95SectionSubtitle');
    if (title) title.textContent = meta.title;
    if (sub) sub.textContent = meta.subtitle;

    meta.ids.forEach(id => $(id)?.classList.add('v95-show'));

    // O grid original tem dois blocos. Cada módulo mostra somente o seu.
    if (key === 'clientes') {
      $('v95ClientsPanel')?.classList.add('v95-show');
      $('v95LotsPanel')?.classList.remove('v95-show');
    }
    if (key === 'eventos') {
      $('v95LotsPanel')?.classList.add('v95-show');
      $('v95ClientsPanel')?.classList.remove('v95-show');
    }

    try { sessionStorage.setItem('hype_admin_hub_v95', key); } catch (_) {}
    window.scrollTo({top:0,behavior:'smooth'});
    refreshSection(key);
  }

  function home() {
    hideAll();
    $('v95SectionBar')?.classList.add('v95-hidden');
    $('v95AdminHome')?.classList.remove('v95-hidden');
    try { sessionStorage.removeItem('hype_admin_hub_v95'); } catch (_) {}
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function init() {
    document.querySelectorAll('[data-v95-open]').forEach(btn => {
      btn.addEventListener('click', () => open(btn.dataset.v95Open));
    });
    $('v95BackHome')?.addEventListener('click', home);

    // A nova experiência sempre abre na central de ícones.
    home();
  }

  window.HypeAdminHubV95 = { open, home, refreshSection };
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 220));
})();