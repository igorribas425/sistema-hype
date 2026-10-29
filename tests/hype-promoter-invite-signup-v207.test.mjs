import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('cadastro vendas não entrega link de convidado',()=>{
 assert.doesNotMatch(read('promoter.html'),/promoterInviteResult/);
 assert.doesNotMatch(read('promoter-v49.js'),/inviteUrl|promoterInviteLink/);
});
test('cadastro convidado é novo e gera link próprio',()=>{
 assert.match(read('promoter-convite.html'),/Promoter de Convidados/);
 assert.match(read('promoter-convite-v207.js'),/public_promoter_invite_signup_v207/);
 assert.doesNotMatch(read('promoter-convite-v207.js'),/public_promoter_registration_submit_v49/);
});
test('convidado verifica o novo cadastro',()=>{
 assert.match(read('lista-promoter-v206.js'),/public_invite_promoter_status_v207/);
 assert.doesNotMatch(read('lista-promoter-v206.js'),/promoter_public_status_v55/);
});
test('ranking de vendas não gera convites',()=>{
 assert.doesNotMatch(read('promoter-global-v16-8.js'),/copyPromoterInviteV206/);
});
