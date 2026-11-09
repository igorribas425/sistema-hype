/* ROGUE — consulta SOMENTE eventos públicos. Sem vendas, cadastro ou operações de ADM. */
(()=>{"use strict";
 const URL="https://etxvkvdsnqqdkonvbgzf.supabase.co";
 const hide=(id)=>{const e=document.getElementById(id);if(e){e.hidden=true;e.style.setProperty("display","none","important")}};
 function node(tag,cl,text){const e=document.createElement(tag);if(cl)e.className=cl;if(text!=null)e.textContent=text;return e}
 function status(root,title,detail){root.replaceChildren();const pane=node("div","event-empty");pane.style.cssText="padding:28px 26px;line-height:1.65;min-height:140px";const h=node("strong",null,title);h.style.cssText="font-size:19px;display:block;margin-bottom:8px";pane.append(h,node("span",null,detail));root.append(pane)}
 const money=n=>"R$ "+Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
 function dateBR(d){try{return new Date(String(d).slice(0,10)+"T12:00:00-03:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"})}catch{return "Data a confirmar"}}
 const future=e=>{if(!e?.active)return false;const d=String(e.event_date||"").slice(0,10);return /^\\d{4}-\\d{2}-\\d{2}$/.test(d)&&new Date(d+"T23:59:59-03:00").getTime()>=Date.now()};
 window.roguePreviewReadOnlyCatalog=async function(){
  hide("ticketBox");hide("v14Spotlight");hide("eventDots");
  const root=document.getElementById("eventCarousel");if(!root)return;
  const title=document.querySelector(".events-head h2");if(title)title.textContent="Calendário da ROGUE — consulta";
  status(root,"Consultando eventos da Rogue…","Somente dados públicos. Os pagamentos e cadastros continuam bloqueados.");
  const cfg=window.HYPE_SUPABASE_CONFIG;
  if(!cfg||cfg.url!==URL||!cfg.anonKey||!window.supabase?.createClient){status(root,"Integração em revisão","A configuração do banco da Rogue não está disponível nesta versão.");return}
  try{
   const sb=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:false}});
   const res=await sb.rpc("public_events_v13",{}, {get:true});if(res.error)throw res.error;
   const events=Array.isArray(res.data)?res.data:[];const upcoming=events.filter(future).sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date)));
   if(!upcoming.length){
      status(root,"Nenhuma festa futura cadastrada na Rogue","O banco da Rogue está conectado para leitura. Ainda não existe evento futuro publicado. Para criar a próxima festa, precisamos finalizar o acesso seguro ao ADM da Rogue. Esta prévia não recebe pagamentos.");
      return;
   }
   root.replaceChildren();
   for(const e of upcoming.slice(0,15)){
     const card=node("article","event-card");card.style.cssText="min-width:min(88vw,330px);min-height:300px";
     const art=node("div","event-card-image");art.style.cssText="min-height:160px;display:flex;align-items:center;justify-content:center;background:#17151a";
     const u=String(e.cover_image||"");if(/^https:\/\//i.test(u)){const img=node("img");img.src=u;img.alt="Capa de evento Rogue";img.loading="lazy";art.append(img)}else{art.append(node("b",null,"ROGUE LOUNGE"))}
     const body=node("div","event-card-body");body.append(node("small",null,"Evento público — visualização"),node("h2",null,String(e.artist_name||e.name||"Evento Rogue")),node("h3",null,String(e.name||"Evento")));
     body.append(node("div","event-card-meta",dateBR(e.event_date)+(e.venue?" • "+e.venue:"")));
     const lotWrap=node("div","event-card-meta","Consultando lotes…");body.append(lotWrap);
     const locked=node("div",null,"Ingressos e Pix desativados nesta prévia");locked.style.cssText="margin-top:14px;font-weight:bold;color:#b5b4bd;font-size:12px";body.append(locked);
     card.append(art,body);root.append(card);
     const lots=await sb.rpc("public_lots_by_event_v16",{p_event_id:Number(e.id)},{get:true});
     if(lots.error){lotWrap.textContent="Lotes indisponíveis para consulta";continue}
     const arr=Array.isArray(lots.data)?lots.data:[];
     lotWrap.textContent=arr.length?arr.slice(0,4).map(x=>String(x.name||x.sector||"Ingresso")+": "+money(x.price)).join(" • "):"Sem lotes cadastrados";
   }
  }catch(e){console.warn("[ROGUE][prévia somente leitura] Falha ao consultar eventos públicos",e?.message||e);status(root,"Catálogo em revisão","Não foi possível consultar os eventos públicos da Rogue neste momento. Nenhum ingresso foi gerado e nenhuma operação foi efetuada.")}
 };
})();
