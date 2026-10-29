import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('página de convidados e selfie separadas da Lista Free',()=>{
 assert.match(read('lista-promoter.html'),/guestCameraPreview/);
 assert.match(read('lista-promoter-v206.js'),/promoter-guest-registration/);
 assert.match(read('lista-promoter-v206.js'),/promoter_code/);
 assert.match(read('lista-promoter-v206.js'),/promoter_public_status_v55/);
});
test('promoter recebe dois links separados',()=>{
 assert.match(read('promoter-v49.js'),/promoterInviteLink/);
 assert.match(read('promoter-global-v16-8.js'),/copyPromoterInviteV206/);
});
test('Admin exige aprovação antes de enviar QR',()=>{
 const s=read('admin-promoter-invites-v206.js');
 assert.match(s,/staff_promoter_guest_review_v206/);
 assert.match(s,/await sendQr\(id,false\)/);
 assert.match(s,/guest_list_approved/);
});
test('Portaria usa leitor com checkin confirmado e QR repetido bloqueado',()=>{
 assert.match(read('portaria-promoter-v206.js'),/portaria_promoter_guests_v206/);
 const s=read('hype-v406-lista-simples.js');
 assert.match(s,/portaria_guest_qr_lookup_v103/);
 assert.match(s,/portaria_guest_simple_enter_v406/);
});
