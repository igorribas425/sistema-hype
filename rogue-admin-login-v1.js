/* ROGUE: login Auth real com usuário reservado; sem liberar RPCs do financeiro ou ingressos. */
(()=>{"use strict";
 const AUTH_EMAIL="rogue@gmail.com";
 const API_URL="https://etxvkvdsnqqdkonvbgzf.supabase.co";
 const byId=id=>document.getElementById(id);
 const form=byId("rogueLoginForm"),status=byId("rogueLoginStatus"),button=byId("rogueLoginButton");
 if(!form||!status||!button)return;
 const notify=(message,error=false)=>{status.textContent=message;status.style.color=error?"#ff9fac":"#cbd9ce"};
 const cfg=window.HYPE_SUPABASE_CONFIG;
 if(!window.supabase?.createClient||!cfg||cfg.url!==API_URL||!cfg.anonKey){
   notify("A configuração segura da Rogue não foi carregada. O login está indisponível.",true);button.disabled=true;return;
 }
 const client=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"rogue-admin-onboarding-v1"}});
 async function verifyAndConfirm(){
   const {data:userData,error:userErr}=await client.auth.getUser();
   const user=userData?.user;
   if(userErr||!user||user.email?.toLowerCase()!==AUTH_EMAIL||!user.email_confirmed_at){
     notify("Conta não confirmada ou e-mail diferente do administrador Rogue.",true);return false;
   }
   const {data:allowed,error:gateError}=await client.rpc("rogue_admin_access_v1",{}, {get:true});
   if(gateError||allowed!==true){
     notify("Identidade autenticada, mas o acesso não foi autorizado. Não foram liberadas funções administrativas.",true);return false;
   }
   form.hidden=true;form.style.display="none";
   const preview=byId("roguePreviewAfterLogin");if(preview){preview.hidden=false;preview.style.display="block"}
   notify("Login rogue confirmado! A autenticação está funcionando. Abra o painel para consultar eventos, ingressos e pendências da Rogue. Alterações continuam bloqueadas.");
   return true;
 }
 form.addEventListener("submit",async event=>{
   event.preventDefault();
   const user=byId("adminUser")?.value?.trim()?.toLowerCase();
   const pass=byId("adminPass")?.value||"";
   if(user!=="rogue"||!pass){notify("Informe o usuário rogue e a senha da sua conta.",true);return}
   button.disabled=true;notify("Validando login no Supabase exclusivo da Rogue...");
   try{
     const {data,error}=await client.auth.signInWithPassword({email:AUTH_EMAIL,password:pass});
     byId("adminPass").value="";
     if(error||!data?.user){throw error||new Error("Login não confirmado")}
     if(!(await verifyAndConfirm())){await client.auth.signOut()}
   }catch(err){notify("Não foi possível entrar. Verifique a senha e sua conexão. "+String(err?.message||"").slice(0,140),true)}
   finally{button.disabled=false}
 });
 (async()=>{try{const {data}=await client.auth.getSession();if(data?.session)await verifyAndConfirm()}catch(_){}})();
})();
