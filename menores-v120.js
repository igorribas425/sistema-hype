/* HYPE Menores V129: somente 16-17 anos, selfie e documento do menor, conferência humana. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const ENDPOINT='https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minors-authorization';
 const canvas=$('signature'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 let drawing=false,signed=false,photoUrl='',documentUrl='',minorFaceUrl='',minorDocumentUrl='';
 let photosProcessing=0;

 function message(text,ok=false){
   const el=$('feedback');el.textContent=text;el.className=ok?'ok':'bad';el.scrollIntoView({behavior:'smooth',block:'center'});
 }
 async function rpc(data){
   const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),60000);
   try{
     const resp=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:ctrl.signal});
     const body=await resp.json().catch(()=>({}));
     if(!resp.ok||body.ok!==true)throw new Error(body.error||'Não foi possível concluir o cadastro. Confira os dados.');
     if(!body.protocol)throw new Error('O servidor não confirmou o protocolo. Confira no ADM antes de reenviar.');
     return body;
   }catch(err){
     if(err?.name==='AbortError')throw new Error('O envio demorou muito. Confira o cadastro com a HYPE antes de tentar de novo; ele pode ter sido recebido.');
     if(err instanceof TypeError)throw new Error('Falha de conexão. Confira no ADM antes de reenviar para evitar duplicidade.');
     throw err;
   }finally{clearTimeout(timer);}
 }
 function setupCanvas(){
   canvas.width=960;canvas.height=240;
   ctx.fillStyle='#fff';ctx.fillRect(0,0,960,240);
   ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#121117';ctx.lineWidth=4;
   signed=false;
 }
 const pt=(e)=>{
   const r=canvas.getBoundingClientRect();
   return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};
 };
 canvas.addEventListener('pointerdown',e=>{
   drawing=true;signed=true;canvas.setPointerCapture(e.pointerId);
   const p=pt(e);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.15,p.y+.15);ctx.stroke();
 });
 canvas.addEventListener('pointermove',e=>{
   if(!drawing)return;
   const p=pt(e);ctx.lineTo(p.x,p.y);ctx.stroke();
 });
 ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>{drawing=false;}));
 $('clearSign').addEventListener('click',setupCanvas);setupCanvas();

 async function compressPhoto(file,kind='selfie'){
   if(!file)throw new Error('Toque no quadro e escolha uma foto.');
   const supported=/^image\//.test(file.type)||/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name||'');
   if(!supported)throw new Error('Selecione uma foto da câmera ou da Biblioteca de Fotos.');
   if(file.size>15*1024*1024)throw new Error('Foto muito grande. No iPhone, tente outra foto ou selecione uma versão menor na Biblioteca.');
   const url=window.URL.createObjectURL(file);
   try{
     const img=new Image();
     // Compatibilidade com Safari/iPhone, inclusive versões em que img.decode() falha.
     await new Promise((resolve,reject)=>{
       let settled=false;
       const finish=err=>{
         if(settled)return;
         settled=true;clearTimeout(timeout);
         img.onload=null;img.onerror=null;
         if(err)reject(err);else resolve(true);
       };
       const timeout=setTimeout(()=>finish(new Error('A foto demorou para abrir no iPhone. Tire outra foto ou escolha JPG na Biblioteca.')),14000);
       img.onload=()=>finish(null);
       img.onerror=()=>finish(new Error('O iPhone não conseguiu abrir esta imagem. Tire outra foto ou escolha JPG na Biblioteca.'));
       img.src=url;
       if(img.complete&&img.naturalWidth)finish(null);
     });
     const w=img.naturalWidth,h=img.naturalHeight;
     if(!w||!h)throw new Error('Imagem não reconhecida. Selecione uma foto JPG ou tire outra foto.');
     const doc=kind==='documento';
     // Documento mantém mais detalhes para permitir a leitura humana dos dados.
     const sizes=doc?[1450,1250,1050,900]:[720,600];
     const qualities=doc?[.85,.75,.65,.53]:[.73,.60,.48];
     for(const max of sizes){
       const scale=Math.min(1,max/Math.max(w,h));
       const c=document.createElement('canvas');
       c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
       const context=c.getContext('2d');
       if(!context)throw new Error('Memória insuficiente para processar foto. Feche outras abas e tente novamente.');
       try{context.drawImage(img,0,0,c.width,c.height);}
       catch(_){throw new Error('Não foi possível converter esta imagem. Tire outra foto no iPhone.');}
       for(const quality of qualities){
         const result=c.toDataURL('image/jpeg',quality);
         if(result.length<=530000)return result;
       }
     }
     throw new Error('Imagem ainda grande. Tire outra foto mais próxima do documento.');
   }finally{window.URL.revokeObjectURL(url);}
 }
 function photoError(inputId,err){
   const el=$(inputId+'Status');
   if(el){el.className='photo-status is-error';el.textContent='❌ '+String(err?.message||'Erro na foto. Tente novamente.');}
   const label=$(inputId+'Button');if(label)label.textContent='📷 TENTAR FOTO NOVAMENTE';
   message(err?.message||'Não foi possível carregar a foto.');
 }
 // A selfie do responsavel usa a camera ao vivo, sem acesso a galeria.
 // A captura nao substitui a conferencia humana nem uma prova de vida biometrica.
 function setupGuardianLiveCamera(){
   let trigger=$('guardianPhoto');
   if(!trigger)return;
   // Se o HTML antigo vier do cache, tambem removemos o campo que aceita galeria.
   if(trigger.tagName!=='BUTTON'){
     const liveButton=document.createElement('button');
     liveButton.type='button';
     liveButton.className=trigger.className;
     liveButton.id=trigger.id;
     liveButton.setAttribute('aria-label','Abrir câmera frontal para selfie ao vivo do responsável');
     liveButton.setAttribute('aria-describedby','guardianPhotoStatus');
     trigger.replaceWith(liveButton);
     trigger=liveButton;
   }
   const overlay=document.createElement('div');
   overlay.id='hypeGuardianCamera';
   overlay.setAttribute('role','dialog');
   overlay.setAttribute('aria-modal','true');
   overlay.setAttribute('aria-label','Capturar selfie ao vivo do responsavel');
   overlay.style.cssText='display:none;position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.94);align-items:center;justify-content:center;padding:14px;overflow-y:auto';
   overlay.innerHTML=[
     '<section style="background:#191720;color:#fff;border:1px solid #a04a71;border-radius:16px;padding:16px;width:min(100%,480px);box-sizing:border-box;text-align:center">',
     '<h2 style="font-size:19px;margin:0 0 8px">Selfie ao vivo do responsável</h2>',
     '<p style="font-size:13px;color:#f0d5df;margin:0 0 12px">Abra a câmera frontal, enquadre seu rosto e tire a foto agora. Não é permitido selecionar fotos salvas. A equipe fará a conferência da identidade.</p>',
     '<video id="hypeGuardianLiveVideo" autoplay muted playsinline style="display:block;width:100%;max-height:53vh;min-height:180px;object-fit:cover;transform:scaleX(-1);border-radius:12px;background:#09090b"></video>',
     '<p id="hypeGuardianCameraMessage" role="status" style="font-size:13px;min-height:36px;color:#f6dce7;margin:12px 0"></p>',
     '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">',
     '<button type="button" id="hypeGuardianCapture" disabled style="flex:1;min-width:160px;border:0;border-radius:10px;background:#d12d63;color:#fff;font-weight:800;padding:14px">📸 CAPTURAR SELFIE</button>',
     '<button type="button" id="hypeGuardianCancel" style="border:1px solid #a1a1aa;border-radius:10px;background:transparent;color:#fff;font-weight:700;padding:14px">Cancelar</button>',
     '</div><small style="display:block;color:#c7bcc5;margin-top:10px">A câmera é desligada ao capturar ou fechar. Não gravamos vídeo.</small></section>'
   ].join('');
   document.body.appendChild(overlay);
   const video=$('hypeGuardianLiveVideo'),status=$('hypeGuardianCameraMessage');
   const take=$('hypeGuardianCapture'),cancel=$('hypeGuardianCancel');
   let stream=null,requestId=0,priorOverflow='';
   function stop(){
     if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
     try{video.pause();video.srcObject=null;}catch(_){}
   }
   function close(){
     requestId++;
     stop();
     overlay.style.display='none';
     document.body.style.overflow=priorOverflow;
     trigger.focus();
   }
   trigger.addEventListener('click',async()=>{
     if(overlay.style.display!=='none')return;
     if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){
       photoError('guardianPhoto',new Error('Câmera indisponível. Abra o link HTTPS no Safari (iPhone) ou Chrome (Android), fora do WhatsApp/Instagram.'));
       return;
     }
     const id=++requestId;
     priorOverflow=document.body.style.overflow;
     document.body.style.overflow='hidden';
     overlay.style.display='flex';
     take.disabled=true;
     status.textContent='⏳ Solicitando acesso à câmera frontal...';
     cancel.focus();
     try{
       const live=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:1280},height:{ideal:960}}});
       if(id!==requestId){live.getTracks().forEach(track=>track.stop());return;}
       stream=live;
       video.srcObject=live;
       await video.play();
       if(id!==requestId)return;
       take.disabled=false;
       take.focus();
       status.textContent='✅ Câmera pronta. Olhe para a lente, com o rosto inteiro visível, e toque em CAPTURAR SELFIE.';
     }catch(err){
       if(id!==requestId)return;
       stop();
       const denied=err?.name==='NotAllowedError'||err?.name==='PermissionDeniedError';
       status.textContent=denied?'❌ Permita o acesso à câmera nas configurações do navegador e tente novamente.':'❌ Não foi possível iniciar a câmera. Abra no Safari ou Chrome e confira as permissões.';
     }
   });
   take.addEventListener('click',()=>{
     if(!stream||!video.videoWidth||!video.videoHeight){status.textContent='A câmera ainda está carregando. Tente novamente.';return;}
     try{
       const width=video.videoWidth,height=video.videoHeight;
       let captured='';
       for(const max of [720,600,480]){
         const scale=Math.min(1,max/Math.max(width,height));
         const c=document.createElement('canvas');
         c.width=Math.max(1,Math.round(width*scale));
         c.height=Math.max(1,Math.round(height*scale));
         const context=c.getContext('2d');
         if(!context)throw new Error('Não foi possível processar a imagem.');
         context.drawImage(video,0,0,c.width,c.height);
         for(const quality of [.73,.60,.48]){
           captured=c.toDataURL('image/jpeg',quality);
           if(captured.length<=530000)break;
         }
         if(captured.length<=530000)break;
       }
       if(!captured||captured.length>530000)throw new Error('Foto muito grande. Tente novamente com boa iluminação.');
       photoUrl=captured;
       $('photoPreview').src=photoUrl;
       $('photoPreview').style.display='block';
       close();
     }catch(err){status.textContent='❌ '+(err.message||'Não foi possível tirar a foto.');}
   });
   cancel.addEventListener('click',close);
   overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
   document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.style.display!=='none')close();});
   document.addEventListener('visibilitychange',()=>{if(document.hidden&&overlay.style.display!=='none')close();});
   window.addEventListener('pagehide',stop);
 }
 setupGuardianLiveCamera();
 $('guardianDocument').addEventListener('change',async()=>{
   documentUrl='';photosProcessing++;
   $('documentPreview').style.display='none';
   try{documentUrl=await compressPhoto($('guardianDocument').files[0],'documento');$('documentPreview').src=documentUrl;$('documentPreview').style.display='block';}
   catch(err){photoError('guardianDocument',err);}
   finally{photosProcessing--;}
 });

 function updateMinorAge(){
   const birth=$('minorBirth').value;
   if(!birth)return true;
   const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const d=new Date(birth+'T12:00:00Z'),e=new Date(now+'T12:00:00Z');
   if(Number.isNaN(d.getTime())||Number.isNaN(e.getTime()))return false;
   let years=e.getUTCFullYear()-d.getUTCFullYear();
   if(e.getUTCMonth()<d.getUTCMonth()||(e.getUTCMonth()===d.getUTCMonth()&&e.getUTCDate()<d.getUTCDate()))years--;
   const ok=years===16||years===17;
   $('minorBirth').setCustomValidity(ok?'':'Somente adolescentes de 16 ou 17 anos podem solicitar a autorização geral.');
   return ok;
 }
 $('minorBirth').addEventListener('change',updateMinorAge);
 $('minorFacePhoto').addEventListener('change',async()=>{
   minorFaceUrl='';photosProcessing++;
   try{minorFaceUrl=await chooseMinorPhoto('minorFacePhoto','minorFacePreview','selfie');}
   catch(err){photoError('minorFacePhoto',err);}
   finally{photosProcessing--;}
 });
 $('minorDocumentPhoto').addEventListener('change',async()=>{
   minorDocumentUrl='';photosProcessing++;
   try{minorDocumentUrl=await chooseMinorPhoto('minorDocumentPhoto','minorDocumentPreview','documento');}
   catch(err){photoError('minorDocumentPhoto',err);}
   finally{photosProcessing--;}
 });
 async function chooseMinorPhoto(inputId,previewId,kind){
   const img=$(previewId);img.style.display='none';
   const value=await compressPhoto($(inputId).files[0],kind);
   img.src=value;img.style.display='block';
   return value;
 }
 // Máscara progressiva: XXX.XXX.XXX-XX, preservando os 11 dígitos e a posição do cursor.
 function formatCpf(value){
   const digits=String(value||'').replace(/\D/g,'').slice(0,11);
   let result=digits.slice(0,3);
   if(digits.length>3)result+='.'+digits.slice(3,6);
   if(digits.length>6)result+='.'+digits.slice(6,9);
   if(digits.length>9)result+='-'+digits.slice(9,11);
   return result;
 }
 ['minorCpf','guardianCpf'].forEach(id=>{
   $(id).addEventListener('input',e=>{
     const field=e.target;
     const before=field.value.slice(0,field.selectionStart??field.value.length).replace(/\D/g,'').length;
     const formatted=formatCpf(field.value);
     field.value=formatted;
     let cursor=0,digitCount=0;
     while(cursor<formatted.length&&digitCount<before){
       if(/\d/.test(formatted[cursor]))digitCount++;
       cursor++;
     }
     if(typeof field.setSelectionRange==='function')field.setSelectionRange(cursor,cursor);
   });
 });
 $('minorForm').addEventListener('invalid',e=>{
   $('minorSubmitProgress').textContent='⚠️ Preencha os campos obrigatórios e marque os termos. O cadastro ainda não foi enviado.';
 },true);
 $('minorForm').addEventListener('submit',async e=>{
   e.preventDefault();
   const btn=$('sendForm');
   if(btn.disabled)return;
   if(photosProcessing>0)return message('Aguarde as quatro fotos terminarem de processar antes de enviar.');
   if(!e.currentTarget.reportValidity())return message('Preencha os campos obrigatórios e aceite os termos.');
   if(!await updateMinorAge())return message('A autorização geral é para quem já tem 16 ou 17 anos.');
   if(!minorFaceUrl)return message('Tire uma selfie nítida do rosto do próprio menor.');
   if(!minorDocumentUrl)return message('Envie uma foto legível do documento do próprio menor.');
   if(!['Pai','Mãe'].includes($('minorRelation').value))return message('Para o cadastro da HYPE, selecione Pai ou Mãe. Outros vínculos precisam ser tratados diretamente com a administração.');
   if(!signed)return message('O pai ou a mãe precisa assinar no quadro branco.');
   if(!photoUrl)return message('Inclua a selfie do responsável antes de continuar.');
   if(!documentUrl)return message('Inclua uma foto nítida do RG ou CNH do responsável antes de continuar.');
   const form={
     action:'submit',
     minorName:$('minorName').value,minorCpf:$('minorCpf').value,minorBirth:$('minorBirth').value,
     minorEmail:$('minorEmail').value.trim().toLowerCase(),
     minorFacePhoto:minorFaceUrl,minorDocumentPhoto:minorDocumentUrl,
     guardianName:$('guardianName').value,guardianCpf:$('guardianCpf').value,
     guardianBirth:$('guardianBirth').value,guardianPhone:$('guardianPhone').value,
     guardianEmail:$('guardianEmail').value.trim().toLowerCase(),
     relation:$('minorRelation').value,photo:photoUrl,documentPhoto:documentUrl,
     signature:canvas.toDataURL('image/png'),
     attend:$('checkAttend').checked,noAlcohol:$('checkAlcohol').checked,
     privacy:$('checkPrivacy').checked,guardianConfirmed:$('checkGuardian').checked
   };
   btn.disabled=true;btn.textContent='⏳ ENVIANDO... NÃO FECHE A PÁGINA';
   $('minorSubmitProgress').textContent='⏳ Enviando as fotos, os documentos e a assinatura. Aguarde a confirmação com protocolo...';
   try{
     const response=await rpc(form);
     $('minorSubmitProgress').textContent='';
     $('minorForm').hidden=true;
     const box=$('feedback');
     box.className='ok';box.replaceChildren();
     const top=document.createElement('strong');top.textContent='✅ Declaração recebida. Protocolo: '+response.protocol;
     const sub=document.createElement('p');sub.textContent='Cadastro recebido no sistema e aguardando análise. Salve o protocolo ou tire um print. O e-mail pode falhar, mas isso não apaga o cadastro. Após aprovação, apresente documentos originais na portaria para conferência. Esta autorização NÃO é ingresso e NÃO libera entrada automaticamente.';
     const back=document.createElement('a');back.href='./cliente.html';back.textContent='← Voltar ao site HYPE (compra normal apenas para maiores)';
     box.append(top,sub,back);box.scrollIntoView({behavior:'smooth',block:'start'});
   }catch(err){
     $('minorSubmitProgress').textContent='❌ Envio não confirmado. Leia o motivo abaixo e consulte a HYPE antes de repetir.';
     message('❌ '+(err.message||err));
   }finally{btn.disabled=false;btn.textContent='ENVIAR AUTORIZAÇÃO PARA ANÁLISE';}
 });
 updateMinorAge();
})();
