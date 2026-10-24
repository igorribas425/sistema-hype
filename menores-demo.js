/* HYPE Demonstração v128: somente marcador sintético enviado ao ADM; imagens e dados ficam no navegador. */
(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const cv=$('signature'),cx=cv.getContext('2d');
  let hasSignature=true, drawing=false, originalObjectUrls=[];
  function drawPreview(target, kind) {
    const can=document.createElement('canvas');
    can.width=kind==='document'?720:500;
    can.height=kind==='document'?420:500;
    const x=can.getContext('2d');
    x.fillStyle=kind==='document'?'#e8e6e1':'#212333';
    x.fillRect(0,0,can.width,can.height);
    if(kind==='document'){
      x.fillStyle='#242536';x.font='bold 31px system-ui';x.fillText('DOCUMENTO FICTÍCIO',28,55);
      x.font='bold 23px system-ui';x.fillText('SEM VALIDADE • SOMENTE TESTE',28,89);
      x.fillStyle='#c9c9d4';x.fillRect(28,115,175,200);
      x.fillStyle='#554e67';x.beginPath();x.arc(114,185,42,0,Math.PI*2);x.fill();
      x.beginPath();x.ellipse(114,277,72,54,0,Math.PI,2*Math.PI);x.fill();
      x.fillStyle='#25222b';x.font='22px system-ui';x.fillText('Nome: Mariana Exemplo',228,155);
      x.fillText('Identidade: DADO FICTÍCIO',228,195);
      x.fillText('Documento: NÃO É RG/CNH',228,234);
      x.fillStyle='#b21642';x.fillRect(0,345,720,75);
      x.fillStyle='#ffffff';x.font='bold 34px system-ui';x.fillText('DEMONSTRAÇÃO',28,395);
    }else{
      x.fillStyle='#ab839d';x.beginPath();x.arc(250,195,91,0,Math.PI*2);x.fill();
      x.beginPath();x.ellipse(250,440,172,136,0,Math.PI,2*Math.PI);x.fill();
      x.fillStyle='#ffffff';x.textAlign='center';x.font='bold 29px system-ui';x.fillText('SELFIE FICTÍCIA',250,42);
      x.font='22px system-ui';x.fillText('Somente demonstração',250,477);
    }
    const img=$(target);
    img.src=can.toDataURL('image/png');
    img.style.display='block';
  }
  function resetSignature(simulated=true){
    cv.width=960;cv.height=240;
    cx.fillStyle='#ffffff';cx.fillRect(0,0,960,240);
    cx.strokeStyle='#1c1a22';cx.lineWidth=4;cx.lineCap='round';cx.lineJoin='round';
    hasSignature=simulated;
    if(simulated){cx.fillStyle='#17121b';cx.font='italic 38px cursive';cx.fillText('Mariana Exemplo — TESTE',35,128);
      cx.font='bold 17px system-ui';cx.fillStyle='#8e153e';cx.fillText('ASSINATURA FICTÍCIA — SEM VALIDADE',35,170);}
  }
  const point=e=>{const r=cv.getBoundingClientRect();return{x:(e.clientX-r.left)*cv.width/r.width,y:(e.clientY-r.top)*cv.height/r.height}};
  cv.addEventListener('pointerdown',e=>{drawing=true;hasSignature=true;cv.setPointerCapture(e.pointerId);const p=point(e);cx.beginPath();cx.moveTo(p.x,p.y);cx.lineTo(p.x+.1,p.y+.1);cx.stroke()});
  cv.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);cx.lineTo(p.x,p.y);cx.stroke()});
  ['pointerup','pointercancel','lostpointercapture'].forEach(t=>cv.addEventListener(t,()=>drawing=false));
  $('clearSign').addEventListener('click',()=>resetSignature(false));
  $('demoRestoreSign').addEventListener('click',()=>resetSignature(true));
  resetSignature();
  drawPreview('photoPreview','selfie');
  drawPreview('documentPreview','document');
  const demoCpf=value=>{let d=String(value).replace(/\D/g,'').slice(0,11);return d.slice(0,3)+(d.length>3?'.'+d.slice(3,6):'')+(d.length>6?'.'+d.slice(6,9):'')+(d.length>9?'-'+d.slice(9):'')};
  for(const id of ['minorCpf','guardianCpf']) $(id).addEventListener('input',e=>{e.target.value=demoCpf(e.target.value)});
  function previewLocal(id,preview){
    $(id).addEventListener('change',()=>{
      const file=$(id).files?.[0];if(!file)return;
      if(!file.type.startsWith('image/')||file.size>10*1024*1024){message('Selecione uma imagem de até 10 MB.',false);return;}
      const url=URL.createObjectURL(file);originalObjectUrls.push(url);
      $(preview).src=url;$(preview).style.display='block';
    });
  }
  previewLocal('guardianPhoto','photoPreview');
  previewLocal('guardianDocument','documentPreview');
  function message(content,good=false){
    const el=$('feedback');el.className=good?'ok':'bad';el.textContent=content;el.style.display='block';
    el.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function age(dateString,refDate){
    const a=new Date(dateString+'T12:00:00'),b=new Date(refDate+'T12:00:00');
    if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime()))return -1;
    let years=b.getFullYear()-a.getFullYear();
    if(b.getMonth()<a.getMonth()||(b.getMonth()===a.getMonth()&&b.getDate()<a.getDate()))years--;
    return years;
  }
  function resultStatus(status){
    $('demoStatus').textContent=status;
    $('demoStatus').style.color=status==='PENDENTE'?'#fcd488':status==='CONFERIDO'?'#9ce0b6':'#ff9bac';
  }
  const DEMO_ENDPOINT="https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minors-demo";
  $('minorForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const minor=$('minorCpf').value.replace(/\D/g,''),guardian=$('guardianCpf').value.replace(/\D/g,'');
    if(minor.length!==11||guardian.length!==11){
      message('Preencha os dois CPFs com 11 dígitos. Este ambiente usa apenas CPFs fictícios.');
      return;
    }
    if(minor===guardian){message('Os CPFs do menor e do responsável devem ser diferentes, inclusive na simulação.');return;}
    if(age($('minorBirth').value,'2026-10-24')<0||age($('minorBirth').value,'2026-10-24')>=18){
      message('Na simulação, o menor deve ter menos de 18 anos.');return;
    }
    if(age($('guardianBirth').value,'2026-10-24')<18){message('O responsável deve ser maior de 18 anos.');return;}
    if(!hasSignature){message('Assine no quadro branco ou restaure a assinatura fictícia para continuar.');return;}
    // Envia apenas um sinal fixo de teste. Nenhum dado digitado, selfie ou documento é transmitido.
    const btn=$('sendForm');
    btn.disabled=true;btn.textContent='ENVIANDO TESTE AO ADM...';
    let record;
    try{
      const r=await fetch(DEMO_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'submit'})});
      const response=await r.json().catch(()=>({}));
      if(!r.ok||response.ok!==true)throw Error(response.error||'Não foi possível avisar o ADM.');
      record=response.record;
    }catch(error){
      message('Falha ao registrar no ADM: '+(error.message||error)+'. Tente novamente.',false);
      btn.disabled=false;btn.textContent='SIMULAR ENVIO E VER O ADM';
      return;
    }
    btn.disabled=false;btn.textContent='SIMULAR ENVIO E VER O ADM';
    const data=[
      ['Protocolo de teste (no ADM)',record.id],
      ['Evento',$('minorEvent').selectedOptions[0]?.textContent||'HYPE — Demonstração'],
      ['Menor',$('minorName').value],['CPF fictício',$('minorCpf').value],['Nascimento',$('minorBirth').value],
      ['Responsável',$('guardianName').value],['CPF fictício do responsável',$('guardianCpf').value],
      ['WhatsApp fictício',$('guardianPhone').value],['Vínculo',$('minorRelation').value]
    ];
    $('demoData').replaceChildren();
    for(const [label,value] of data){
      const box=document.createElement('div'),small=document.createElement('small'),v=document.createElement('strong');
      small.textContent=label;v.textContent=value;
      box.append(small,v);$('demoData').append(box);
    }
    $('demoPhotoResult').src=$('photoPreview').src;
    $('demoDocumentResult').src=$('documentPreview').src;
    $('demoSignResult').src=cv.toDataURL('image/png');
    $('minorForm').hidden=true;$('demoAdmin').hidden=false;
    resultStatus('PENDENTE');
    message('Teste '+record.id.slice(0,8)+' registrado na aba Menores de idade do ADM! Somente o marcador de teste foi salvo; nenhum CPF, imagem, assinatura ou ingresso real foi transmitido.',true);
    $('demoAdmin').scrollIntoView({behavior:'smooth',block:'start'});
  });
  $('demoApprove').addEventListener('click',()=>resultStatus('CONFERIDO'));
  $('demoReject').addEventListener('click',()=>resultStatus('RECUSADO'));
  $('demoRestart').addEventListener('click',()=>{
    $('minorForm').hidden=false;$('demoAdmin').hidden=true;$('feedback').style.display='none';
    resultStatus('PENDENTE');$('minorForm').scrollIntoView({behavior:'smooth',block:'start'});
  });
  window.addEventListener('pagehide',()=>{for(const url of originalObjectUrls)URL.revokeObjectURL(url)});
})();
