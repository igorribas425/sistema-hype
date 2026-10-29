import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('same QR scanner routes guest QR without pretending it was purchased',()=>{const s=read('portaria-v18.js');assert.match(s,/HypeListaSimples\.processQr/);});
test('guest QR asks staff to review profile and check in once',()=>{
 const s=read('hype-v406-lista-simples.js');
 assert.match(s,/portaria_guest_qr_lookup_v103/);
 assert.match(s,/portaria_guest_simple_enter_v406/);
 assert.match(s,/CONVIDADO PROMOTER/);
 assert.match(s,/CONFIRMAR ENTRADA/);
});
test('admin only exposes registration link, not personal links',()=>{
 const s=read('admin-promoter-invites-v206.js');
 assert.match(s,/staff_list_invite_promoters_v207/);
 assert.doesNotMatch(s,/inviteLink=code|COPIAR LINK DE CONVITE/);
});