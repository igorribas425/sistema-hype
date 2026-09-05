/* ============================================================
   HYPE LOUNGE CLUB // ADMIN V34
   - Check-in ao vivo: reflete cada entrada/saida/reentrada em ate ~1s.
   - Pesquisa pos-evento: somente pessoas que realmente entraram.
   ============================================================ */
(() => {
  'use strict';

  const V34 = {
    eventId: 0,
    timer: null,
    lastLogId: 0,
    events: [],
    attendees: [],
    initialized: false,
    busy: false,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const arr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const adminReady = () => typeof HYPE !== 'undefined' && HYPE.user && HYPE.pass && ['admin','gerente','caixa'].includes(HYPE.role);
  const canSurvey = () => adminReady() && ['admin','gerente'].includes(HYPE.role);

  function fmtDate(value) {
    if (!value) return '';
    const d = new Date(`${String(value).slice(0,10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-BR');
  }

  function fmtTime(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }

  function selectSmartEvent(events) {
    const preferred = Number(HYPE?.selectedEventId || 0);
    if (preferred && events.some(e => Number(e.id) === preferred)) return preferred;

    const now = new Date();
    const day = new Date(now);
    if (now.getHours() < 8) day.setDate(day.getDate() - 1);
    const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
    const same = events.find(e => String(e.event_date || '').slice(0,10) === key);
    if (same) return Number(same.id);

    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const future = events.filter(e => String(e.event_date || '') >= today)
      .sort((a,b)=>String(a.event_date||'').localeCompare(String(b.event_date||'')));
    return Number((future[0] || events[0] || {}).id || 0);
  }

  async function loadEvents() {
    if (!adminReady()) return;
    let events = [];
    try {
      events = arr(await sbRpc('staff_list_raffle_events_v23', {p_username:HYPE.user,p_password:HYPE.pass}));
    } catch (_) {
      try {
        events = arr(await sbRpc('staff_list_events_v13', {p_username:HYPE.user,p_password:HYPE.pass}));
      } catch (_) {
        events = arr(HYPE.events || []);
      }
    }
    V34.events = events;
    const select = $('v34EventSelect');
    if (!select) return;
    select.innerHTML = events.length
      ? events.map(e => `<option value="${Number(e.id)}">${esc(fmtDate(e.event_date))} • ${esc(e.name || 'Evento HYPE')}</option>`).join('')
      : '<option value="">Nenhum evento encontrado</option>';

    const chosen = V34.eventId && events.some(e=>Number(e.id)===Number(V34.eventId))
      ? Number(V34.eventId)
      : selectSmartEvent(events);
    V34.eventId = chosen;
    select.value = String(chosen || '');
  }

  function setText(id, value) {
    const el = $(id); if (el) el.textContent = String(value ?? '0');
  }

  function actionLabel(action) {
    if (action === 'ENTRY') return 'Entrada';
    if (action === 'REENTRY') return 'Reentrada';
    if (action === 'TEMPORARY_EXIT') return 'Saída temporária';
    return action || '';
  }

  function renderChart(data) {
    const box = $('v34LiveChart');
    if (!box) return;
    const timeline = arr(data?.timeline);
    if (!timeline.length) {
      box.innerHTML = '<div class="v34-empty">O gráfico começa assim que a primeira entrada for confirmada na Portaria.</div>';
      return;
    }

    const width = 920, height = 260, padX = 42, padTop = 20, padBottom = 42;
    const chartW = width - padX * 2;
    const chartH = height - padTop - padBottom;
    const maxY = Math.max(1, Number(data?.inside_now || 0), ...timeline.map(p=>Number(p.inside||0)));
    const xAt = (i) => padX + (timeline.length === 1 ? chartW : (i / (timeline.length - 1)) * chartW);
    const yAt = (v) => padTop + chartH - (Number(v || 0) / maxY) * chartH;

    let path = `M ${xAt(0).toFixed(1)} ${yAt(timeline[0].inside).toFixed(1)}`;
    for (let i=1;i<timeline.length;i++) {
      const x = xAt(i), yPrev = yAt(timeline[i-1].inside), y = yAt(timeline[i].inside);
      path += ` H ${x.toFixed(1)} V ${y.toFixed(1)}`;
    }

    const last = timeline[timeline.length-1];
    const first = timeline[0];
    const yMid = Math.round(maxY / 2);
    box.innerHTML = `
      <svg class="v34-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Pessoas dentro da casa ao longo da noite">
        <line x1="${padX}" y1="${padTop+chartH}" x2="${width-padX}" y2="${padTop+chartH}" class="v34-axis"/>
        <line x1="${padX}" y1="${padTop}" x2="${padX}" y2="${padTop+chartH}" class="v34-axis"/>
        <line x1="${padX}" y1="${yAt(yMid)}" x2="${width-padX}" y2="${yAt(yMid)}" class="v34-gridline"/>
        <path d="${path}" class="v34-live-path" fill="none"/>
        <circle cx="${xAt(timeline.length-1)}" cy="${yAt(last.inside)}" r="6" class="v34-live-dot"/>
        <text x="${padX-10}" y="${padTop+5}" text-anchor="end" class="v34-axis-text">${maxY}</text>
        <text x="${padX-10}" y="${padTop+chartH+4}" text-anchor="end" class="v34-axis-text">0</text>
        <text x="${padX}" y="${height-10}" text-anchor="start" class="v34-axis-text">${esc(fmtTime(first.at))}</text>
        <text x="${width-padX}" y="${height-10}" text-anchor="end" class="v34-axis-text">${esc(fmtTime(last.at))}</text>
      </svg>
      <div class="v34-chart-footer"><span>Última movimentação: <b>${esc(actionLabel(last.action))}</b> • ${esc(fmtTime(last.at))}</span><strong>${Number(last.inside||0)} dentro</strong></div>`;
  }

  function renderLive(data) {
    setText('v34InsideNow', data?.inside_now || 0);
    setText('v34EnteredTotal', data?.entered_total || 0);
    setText('v34TempOut', data?.temporary_out || 0);
    setText('v34Remaining', data?.remaining || 0);
    setText('v34Reentries', data?.reentries || 0);
    setText('v34PaidTotal', data?.paid_total || 0);
    const status = $('v34LiveStatus');
    if (status) {
      status.textContent = `AO VIVO • ${data?.event_name || 'Evento'} • atualização automática ~1s`;
      status.className = 'v34-live-status online';
    }
    const newLog = Number(data?.last_log_id || 0);
    if (newLog && newLog !== V34.lastLogId) {
      $('v34LivePanel')?.classList.remove('v34-pulse');
      requestAnimationFrame(()=> $('v34LivePanel')?.classList.add('v34-pulse'));
    }
    V34.lastLogId = newLog;
    renderChart(data);
  }

  async function refreshLive(silent = true) {
    if (!adminReady() || !V34.eventId || document.hidden || V34.busy) return;
    V34.busy = true;
    try {
      const raw = await sbRpc('staff_live_checkin_v34', {
        p_username:HYPE.user,
        p_password:HYPE.pass,
        p_event_id:Number(V34.eventId)
      });
      const data = Array.isArray(raw) ? raw[0] : raw;
      if (data) renderLive(data);
    } catch (err) {
      const status = $('v34LiveStatus');
      if (status) {
        status.textContent = err?.message || 'Não foi possível atualizar o check-in.';
        status.className = 'v34-live-status error';
      }
      if (!silent) alert(err?.message || 'Erro no check-in ao vivo.');
    } finally {
      V34.busy = false;
    }
  }

  async function changeEvent() {
    V34.eventId = Number($('v34EventSelect')?.value || 0);
    V34.lastLogId = 0;
    await refreshLive(false);
    if (canSurvey()) {
      await Promise.allSettled([refreshSurveyReport(), loadSurveyAttendees(false)]);
    }
  }

  function surveyLink(token) {
    return `${location.origin}${location.pathname.replace(/\/[^/]*$/, '/') }pesquisa.html?token=${encodeURIComponent(token)}`;
  }

  function normalizePhone(value) {
    let d = String(value || '').replace(/\D/g,'');
    if (!d) return '';
    if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) d = `55${d}`;
    return d;
  }

  function renderAttendees() {
    const box = $('v34SurveyAttendees');
    if (!box) return;
    if (!V34.attendees.length) {
      box.innerHTML = '<div class="v34-empty">Nenhuma pessoa que entrou neste evento ainda.</div>';
      return;
    }
    box.innerHTML = V34.attendees.map((a,i) => {
      const phone = normalizePhone(a.phone);
      const state = a.responded ? 'RESPONDEU ✅' : a.email_sent_at && a.whatsapp_sent_at ? 'GMAIL + WHATSAPP ENVIADOS' : a.whatsapp_sent_at ? 'WHATSAPP ENVIADO' : (a.email_sent_at || a.sent_at) ? 'GMAIL ENVIADO' : 'AGUARDANDO AUTO';
      return `<div class="v34-attendee">
        <div><b>${i+1}. ${esc(a.customer_name || 'Cliente')}</b><small>${esc(state)}${a.email?` • ${esc(a.email)}`:''}</small></div>
        <div class="v34-attendee-actions">
          ${phone?`<button class="btn-action" type="button" onclick="HypeV34.whatsApp('${esc(a.invite_token)}','${esc(phone)}','${esc(a.customer_name || '')}')">💬 WHATSAPP</button>`:''}
          <button class="btn-action" type="button" onclick="HypeV34.copyLink('${esc(a.invite_token)}')">🔗 LINK</button>
        </div>
      </div>`;
    }).join('');
  }

  async function loadSurveyAttendees(render = true) {
    const box = $('v34SurveyAttendees');
    if (!canSurvey()) {
      if (box) box.innerHTML = '<div class="v34-empty">Somente Admin/Gerente pode enviar pesquisas.</div>';
      return [];
    }
    if (!V34.eventId) return [];
    try {
      let data;
      try {
        data = arr(await sbRpc('staff_survey_attendees_v35', {
          p_username:HYPE.user,
          p_password:HYPE.pass,
          p_event_id:Number(V34.eventId)
        }));
      } catch (_) {
        data = arr(await sbRpc('staff_survey_attendees_v34', {
          p_username:HYPE.user,
          p_password:HYPE.pass,
          p_event_id:Number(V34.eventId)
        }));
      }
      V34.attendees = data;
      if (render) renderAttendees();
      return data;
    } catch (err) {
      if (box) box.innerHTML = `<div class="v34-empty error">${esc(err?.message || 'Erro ao carregar participantes.')}</div>`;
      return [];
    }
  }

  function renderFeedbackRankingV35(r) {
    const total = Number(r?.response_count || 0);
    const items = [
      {key:'rating_5',label:'🔥 Incrível'},
      {key:'rating_4',label:'🙂 Bom'},
      {key:'rating_3',label:'😐 Regular'},
      {key:'rating_2',label:'🙁 Ruim'},
      {key:'rating_1',label:'⛔ Péssimo'}
    ];
    const box = $('v35FeedbackRanking');
    if (box) box.innerHTML = items.map(item=>{
      const count = Number(r?.[item.key] || 0);
      const pct = total ? Math.round((count/total)*100) : 0;
      return `<div class="v35-rank-row"><span>${item.label}</span><div><i style="width:${pct}%"></i></div><b>${count}</b></div>`;
    }).join('');

    const dominant = $('v35FeedbackDominant');
    if (dominant) {
      if (!total) dominant.textContent = 'SEM RESPOSTAS';
      else {
        const ranked = items.map(x=>({...x,count:Number(r?.[x.key]||0)})).sort((a,b)=>b.count-a.count);
        dominant.textContent = `${ranked[0].label.toUpperCase()} • ${ranked[0].count}`;
      }
    }

    const auto = $('v35AutoFeedbackStatus');
    if (auto) {
      const d = r?.dispatch || {};
      const status = String(d.status || '').toLowerCase();
      const email = Number(r?.email_sent_count || d.email_sent || 0);
      const wa = Number(r?.whatsapp_sent_count || d.whatsapp_sent || 0);
      if (status === 'completed') {
        auto.className = 'v35-auto-status ok';
        auto.textContent = `✅ Envio automático concluído • Gmail ${email} • WhatsApp ${wa}`;
      } else if (status === 'partial' || status === 'processing') {
        auto.className = 'v35-auto-status warn';
        auto.textContent = `⏳ Envio automático em andamento/parcial • Gmail ${email} • WhatsApp ${wa}${d.last_error?` • ${d.last_error}`:''}`;
      } else {
        auto.className = 'v35-auto-status';
        auto.textContent = 'Envio automático: acontece quando a Portaria vira para o próximo evento após 08:00.';
      }
    }
  }

  async function refreshSurveyReport() {
    if (!canSurvey() || !V34.eventId) return;
    try {
      const raw = await sbRpc('staff_survey_report_v34', {
        p_username:HYPE.user,
        p_password:HYPE.pass,
        p_event_id:Number(V34.eventId)
      });
      const r = Array.isArray(raw) ? raw[0] : raw;
      if (!r) return;
      setText('v34SurveyEligible', r.eligible_count || 0);
      setText('v34SurveyInvited', r.invited_count || 0);
      setText('v35SurveyEmail', r.email_sent_count || 0);
      setText('v35SurveyWhatsApp', r.whatsapp_sent_count || 0);
      setText('v34SurveyAnswers', r.response_count || 0);
      setText('v34SurveyAverage', Number(r.average_rating || 0).toFixed(2));
      const returnRate = Number(r.response_count||0) ? Math.round((Number(r.would_return_yes||0)/Number(r.response_count||1))*100) : 0;
      setText('v34SurveyReturn', `${returnRate}%`);
      renderFeedbackRankingV35(r);
      const comments = $('v34SurveyComments');
      const rows = arr(r.comments);
      if (comments) comments.innerHTML = rows.length ? rows.map(c=>`<div class="v34-comment"><div><b>${esc(c.name||'Cliente')}</b><span>${'★'.repeat(Math.max(0,Math.min(5,Number(c.rating||0))))}${'☆'.repeat(Math.max(0,5-Math.min(5,Number(c.rating||0))))}</span></div><p>${esc(c.comment||'Sem comentário.')}</p><small>${c.would_return===true?'Voltaria ✅':c.would_return===false?'Não voltaria':'Não respondeu se voltaria'} • ${esc(fmtDateTime(c.submitted_at))}</small></div>`).join('') : '<div class="v34-empty">Ainda não há respostas.</div>';
    } catch (err) {
      const comments = $('v34SurveyComments');
      if (comments) comments.innerHTML = `<div class="v34-empty error">${esc(err?.message || 'Erro ao carregar relatório.')}</div>`;
    }
  }

  function fmtDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }

  async function sendSurveyEmail() {
    if (!canSurvey()) return alert('Somente Admin/Gerente pode enviar a pesquisa.');
    if (!V34.eventId) return alert('Selecione um evento.');
    if (!confirm('Enviar a pesquisa por e-mail somente para as pessoas que realmente entraram neste evento?')) return;
    const btn = $('v34SurveyEmailBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'ENVIANDO...'; }
    try {
      const cfg = hypeCfg();
      const response = await fetch(`${cfg.url}/functions/v1/send-ticket-email`, {
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':cfg.anonKey,'Authorization':`Bearer ${cfg.anonKey}`},
        body:JSON.stringify({
          action:'survey_invites',
          event_id:Number(V34.eventId),
          username:HYPE.user,
          password:HYPE.pass,
          base_url:new URL('.', location.href).toString(),
          force:false
        })
      });
      let data=null; try{data=await response.json();}catch(_){}
      if (!response.ok || data?.ok===false) throw new Error(data?.error || 'Não foi possível enviar a pesquisa.');
      hypeNotify(`📧 Pesquisa enviada: ${Number(data?.sent||0)} e-mail(s).`);
      await Promise.allSettled([loadSurveyAttendees(true),refreshSurveyReport()]);
      if (Number(data?.remaining||0)>0) alert(`Foram enviados ${data.sent} nesta rodada. Ainda restam ${data.remaining}; clique novamente para continuar.`);
    } catch (err) {
      alert(err?.message || 'Erro no envio da pesquisa.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📧 ENVIAR PESQUISA POR E-MAIL'; }
    }
  }

  function whatsApp(token, phone, name) {
    const link = surveyLink(token);
    const eventName = $('v34EventSelect')?.selectedOptions?.[0]?.textContent || 'evento HYPE';
    const first = String(name||'').trim().split(/\s+/)[0] || '';
    const msg = `⭐ HYPE LOUNGE CLUB\n\nOi${first?` ${first}`:''}! Como foi sua noite no ${eventName}? 🔥\n\nSua opinião ajuda a HYPE a deixar os próximos eventos ainda melhores. Leva menos de 1 minuto.\n\n👉 ${link}`;
    window.open(`https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(msg)}`,'_blank','noopener');
  }

  async function copyLink(token) {
    const link = surveyLink(token);
    try { await navigator.clipboard.writeText(link); hypeNotify('🔗 Link da pesquisa copiado.'); }
    catch (_) { prompt('Copie o link da pesquisa:',link); }
  }

  function applyRole() {
    const panel = $('v34SurveyPanel');
    if (panel) panel.style.display = canSurvey() ? '' : 'none';
  }

  async function init() {
    if (!adminReady() || V34.initialized) return;
    V34.initialized = true;
    applyRole();
    await loadEvents();
    await refreshLive(false);
    if (canSurvey()) await Promise.allSettled([loadSurveyAttendees(true),refreshSurveyReport()]);
    clearInterval(V34.timer);
    V34.timer = setInterval(()=>refreshLive(true),1000);
  }

  // Se a tela abriu antes do login, espera a sessão ficar pronta.
  const boot = setInterval(()=>{
    if (adminReady()) {
      clearInterval(boot);
      init().catch(err=>console.warn('[HYPE V34]',err));
    }
  },700);
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>init().catch(()=>{}),900));
  window.addEventListener('focus',()=>refreshLive(true));
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) refreshLive(true); });

  window.HypeV34 = {
    changeEvent,
    refreshLive:()=>refreshLive(false),
    loadSurveyAttendees:()=>loadSurveyAttendees(true),
    refreshSurveyReport,
    sendSurveyEmail,
    whatsApp,
    copyLink
  };
})();
