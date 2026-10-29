import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
for(const [html,js] of [['lista.html','lista-v49.js'],['lista-promoter.html','lista-promoter-v206.js']]){
 const page=fs.readFileSync(new URL('../'+html,import.meta.url),'utf8');
 const code=fs.readFileSync(new URL('../'+js,import.meta.url),'utf8');
 test(html+' includes native front camera/gallery options for iOS & Android',()=>{
  assert.match(page,/capture="user"/);assert.match(page,/for="guestPhotoGallery"/);
  assert.match(page,/webkit-playsinline/);assert.match(page,/type="file" accept="image\/\*"/);
  assert.match(code,/getUserMedia/);assert.match(code,/normalizePhoto/);assert.match(code,/photoBusy/);
  assert.match(code,/payload\.set\('photo', capturedPhoto\)/);
  assert.doesNotMatch(code,/new DataTransfer\(/);
  assert.match(code,/window\.addEventListener\('pagehide',stopCamera\)/);
  assert.match(code,/toBlob/);
 });
}
