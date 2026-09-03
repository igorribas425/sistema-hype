/* HYPE V20 // Admin: monitor e bloqueio dos celulares leitores */
(() => {
  'use strict';
  const esc=v=>typeof hypeEscape==='function'?hypeEscape(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('pt-BR');};
  const rows=d=>Array.isArray(d)?d:(d?[d]:[]);
  function ready(){return window.HYPE?.role==='admin'&&HYPE.user&&HYPE.pass;}

  async function loadReadersAdminV20(){
    if(!ready())return;
    const box=document.getElementById('v20AdminReaderList');if(!box)return;
    try{
      const data=rows(await sbRpc('staff_list_portaria_readers_v20',{p_username:HYPE.user,p_password:HYPE.pass}));
      const active=data.filter(x=>x.active);
      if(!data.length){box.innerHTML='<div class="v18-empty">Nenhum celular leitor registrado.</div>';return;}
      box.innerHTML=data.map(r=>`<div class="v18-device ${r.active?'active':'pending'}"><div><strong>${esc(r.reader_label||'Celular leitor')}</strong><small>Computador: <b>${esc(r.device_label||'Portaria')}</b> • ${r.active?'ATIVO':'ENCERRADO'}${r.last_scan_at?` • última leitura ${esc(fmt(r.last_scan_at))}`:''}</small></div><div class="v18-device-actions">${r.active?`<button class="btn-action btn-del" onclick="revokeReaderAdminV20('${esc(r.reader_id)}')">🔒 BLOQUEAR</button>`:''}</div></div>`).join('');
    }catch(err){box.innerHTML=`<div class="v18-empty error">${esc(err.message||'Erro ao carregar leitores.')}</div>`;}
  }

  async function revokeReaderAdminV20(id){
    if(!ready())return;
    if(!confirm('Bloquear este celular leitor? Ele para de enviar QR imediatamente.'))return;
    try{await sbRpc('staff_revoke_portaria_reader_v20',{p_username:HYPE.user,p_password:HYPE.pass,p_reader_id:id});hypeNotify('Celular leitor bloqueado.');await loadReadersAdminV20();}
    catch(err){alert(err.message||'Não foi possível bloquear o leitor.');}
  }

  window.loadReadersAdminV20=loadReadersAdminV20;
  window.revokeReaderAdminV20=revokeReaderAdminV20;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(ready())loadReadersAdminV20();},1400));
  setInterval(()=>{if(!document.hidden&&ready())loadReadersAdminV20().catch(()=>{});},9000);
})();
