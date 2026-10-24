/* HYPE Menores V129: somente 16-17 anos, selfie e documento do menor, conferência humana. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const ENDPOINT='https://txxoqfcwqncqyiqgzboz.supabase.co/functions/v1/hype-minors-authorization';
 const canvas=$('signature'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 let drawing=false,signed=false,photoUrl='',documentUrl='',minorFaceUrl='',minorDocumentUrl='';

 function message(text,ok=false){
   const el=$('feedback');el.textContent=text;el.className=ok?'ok':'bad';el.scrollIntoView({behavior:'smooth',block:'center'});
 }
 async function rpc(data){
   const resp=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   const body=await resp.json().catch(()=>({}));
   if(!resp.ok||body.ok!==true)throw new Error(body.error||'Não foi possível comunicar com a HYPE.');
   return body;
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
   if(!file||!file.type.startsWith('image/'))throw new Error('Selecione uma foto do responsável ou do documento.');
   if(file.size>12*1024*1024)throw new Error('Imagem muito grande. Escolha uma foto de até 12 MB.');
   const url=URL.createObjectURL(file);
   try{
     const img=new Image();img.src=url;await img.decode();
     const w=img.naturalWidth,h=img.naturalHeight;
     if(!w||!h)throw new Error('Imagem não reconhecida. Tente outra foto.');
     const doc=kind==='documento';
     // Documento mantém mais detalhes para permitir a leitura humana dos dados.
     const sizes=doc?[1450,1250,1050,900]:[720,600];
     const qualities=doc?[.85,.75,.65,.53]:[.73,.60,.48];
     for(const max of sizes){
       const scale=Math.min(1,max/Math.max(w,h));
       const c=document.createElement('canvas');
       c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
       c.getContext('2d').drawImage(img,0,0,c.width,c.height);
       for(const quality of qualities){
         const result=c.toDataURL('image/jpeg',quality);
         if(result.length<=530000)return result;
       }
     }
     throw new Error('Imagem ainda grande. Tire outra foto mais próxima do documento.');
   }finally{URL.revokeObjectURL(url);}
 }
 $('guardianPhoto').addEventListener('change',async()=>{
   try{
     photoUrl=await compressPhoto($('guardianPhoto').files[0]);
     $('photoPreview').src=photoUrl;$('photoPreview').style.display='block';
   }catch(err){photoUrl='';$('photoPreview').style.display='none';message(err.message);}
 });
 $('guardianDocument').addEventListener('change',async()=>{
   documentUrl='';
   $('documentPreview').style.display='none';
   try{
     documentUrl=await compressPhoto($('guardianDocument').files[0],'documento');
     $('documentPreview').src=documentUrl;
     $('documentPreview').style.display='block';
   }catch(err){message(err.message||'Não foi possível ler o documento.');}
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
   minorFaceUrl='';
   try{minorFaceUrl=await chooseMinorPhoto('minorFacePhoto','minorFacePreview','selfie');}
   catch(err){message(err.message||'Não foi possível processar a selfie do menor.');}
 });
 $('minorDocumentPhoto').addEventListener('change',async()=>{
   minorDocumentUrl='';
   try{minorDocumentUrl=await chooseMinorPhoto('minorDocumentPhoto','minorDocumentPreview','documento');}
   catch(err){message(err.message||'Não foi possível processar o documento do menor.');}
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
 $('minorForm').addEventListener('submit',async e=>{
   e.preventDefault();
   const btn=$('sendForm');
   if(!await updateMinorAge())return message('A autorização geral é para quem já tem 16 ou 17 anos.');
   if(!minorFaceUrl)return message('Tire uma selfie nítida do rosto do próprio menor.');
   if(!minorDocumentUrl)return message('Envie uma foto legível do documento do próprio menor.');
   if(!signed)return message('O responsável precisa assinar no quadro branco.');
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
   btn.disabled=true;btn.textContent='ENVIANDO COM SEGURANÇA...';
   try{
     const response=await rpc(form);
     $('minorForm').hidden=true;
     const box=$('feedback');
     box.className='ok';box.replaceChildren();
     const top=document.createElement('strong');top.textContent='✅ Declaração recebida. Protocolo: '+response.protocol;
     const sub=document.createElement('p');sub.textContent='Cadastro enviado para análise da HYPE. Aguarde o resultado nos Gmails informados. Se aprovado, a autorização poderá ser apresentada nas festas da HYPE enquanto o adolescente tiver 16 ou 17 anos, sujeita às regras de cada evento. O ingresso de R$ 30,00 será comprado presencialmente. Este protocolo NÃO é ingresso e não libera entrada.';
     const back=document.createElement('a');back.href='./cliente.html';back.textContent='← Voltar ao site HYPE (compra normal apenas para maiores)';
     box.append(top,sub,back);box.scrollIntoView({behavior:'smooth',block:'start'});
   }catch(err){message('❌ '+(err.message||err));}
   finally{btn.disabled=false;btn.textContent='ENVIAR AUTORIZAÇÃO PARA ANÁLISE';}
 });
 updateMinorAge();
})();
