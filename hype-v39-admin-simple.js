(function(){
  'use strict';
  const KEY='hype_admin_simple_v39';
  const advancedIds=['v34SurveyPanel','v36RefundPanel','v16ManagementPanel','v18ControlPanel'];
  function isSimple(){ return localStorage.getItem(KEY)!=='0'; }
  function apply(){
    const simple=isSimple();
    advancedIds.forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display=simple?'none':''; });
    const b=document.getElementById('v39AdminModeBtn');
    if(b) b.textContent=simple?'⚙️ MOSTRAR FERRAMENTAS':'✅ VOLTAR AO MODO SIMPLES';
    const t=document.getElementById('v39AdminModeText');
    if(t) t.textContent=simple?'Mostrando somente o que você usa mais no dia a dia. Nada foi apagado.':'Ferramentas avançadas visíveis.';
  }
  function toggle(){ localStorage.setItem(KEY,isSimple()?'0':'1'); apply(); }
  function addBar(){
    if(document.getElementById('v39AdminSimpleBar')) return;
    const target=document.getElementById('v16DashboardPanel')||document.querySelector('.panel-box');
    if(!target) return;
    const bar=document.createElement('div');
    bar.id='v39AdminSimpleBar';
    bar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:14px 0;padding:12px 14px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:#0b0b0e';
    bar.innerHTML='<div><b style="display:block;font-size:12px">MODO SIMPLES DO ADMIN</b><span id="v39AdminModeText" style="display:block;color:#92929a;font-size:10px;margin-top:4px"></span></div><button id="v39AdminModeBtn" type="button" style="min-height:40px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:#17171c;color:#fff;padding:0 12px;font-weight:900;cursor:pointer"></button>';
    target.parentNode.insertBefore(bar,target);
    document.getElementById('v39AdminModeBtn').addEventListener('click',toggle);
    apply();
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(addBar,50));
})();
