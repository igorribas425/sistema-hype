import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../supabase/functions/asaas-sync/index.ts',import.meta.url),'utf8');
test('Pix pago inicia envio Resend logo após confirmação',()=>{
 const paid=src.indexOf('payment_status:"Pago"');
 const call=src.indexOf('emailSent=await emailAfterPixV205(sb,t,key,url)');
 assert.ok(paid>0&&call>paid);
 assert.match(src,/emailAfterPixV205/);
 assert.match(src,/hype-resend-ticket/);
});
test('duas abas não confirmam nem enviam duas vezes',()=>{
 assert.match(src,/\.eq\("id",t\.id\)\.eq\("payment_status","Pendente"\)\.select\("id"\)/);
 assert.match(src,/if\(newlyConfirmed&&!t\.email_sent_at\)/);
});
test('confirmação do Resend precede marcação de envio',()=>{
 const a=src.indexOf('if(!response.ok||result.ok!==true)');
 const b=src.indexOf('.update({email_sent_at:new Date().toISOString()})');
 assert.ok(a>0&&b>a);
 assert.match(src,/\.is\("email_sent_at",null\)/);
});
test('falha do e-mail não desfaz o pagamento',()=>{
 assert.match(src,/catch\(err\)\{\s*emailError=/);
 assert.match(src,/return json\(req,\{ok:true,paid:true,status,ticket_id:t\.id,paid_at:paidAt/);
 assert.match(src,/INGRESSO_EMAIL_PROVIDER_ERRO/);
});
test('o envio é interno e não publica segredo',()=>{
 assert.match(src,/Authorization":"Bearer "\+serviceRole/);
 assert.doesNotMatch(src,/RESEND_API_KEY\s*=\s*["']/);
});
