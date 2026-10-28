/* Regression tests for the admin event selector (Halloween Friday vs Sunday).
   Run with: node --test tests/hype-current-event-v200.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function hypeActiveEventIdV171()'),source.indexOf('function hypeTicketEventNameV200(',source.indexOf('function hypeActiveEventIdV171()')));
function pick(events,date,minutes){
  const context={HYPE:{events,adminEvents:[],selectedEventId:26},Map,
    hypeSaoPauloNowPartsV37:()=>({date,minutes}),
    hypeAddDaysToDateKeyV37:(date,days)=>{
      const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
    }};
  vm.runInNewContext(fn+';chosen=hypeActiveEventIdV171();',context);
  return context.chosen;
}
const events=[
 {id:26,name:'Beijo Proibido',event_date:'2026-11-01',active:true},
 {id:25,name:'Halloween da Hype',event_date:'2026-10-30',active:true},
 {id:24,name:'Festa antiga',event_date:'2026-10-24',active:false}
];
test('prioriza sexta mesmo com domingo publicado',()=>assert.equal(pick(events,'2026-10-27',1200),25));
test('durante madrugada de sábado mantém festa de sexta',()=>assert.equal(pick(events,'2026-10-31',90),25));
test('sábado após 8h passa para domingo',()=>assert.equal(pick(events,'2026-10-31',540),26));
test('domingo mantém evento da data correta',()=>assert.equal(pick(events,'2026-11-01',1380),26));
test('eventos encerrados continuam acessíveis quando não há futuro',()=>assert.equal(pick(events,'2026-11-05',700),26));
test('não escolhe evento inativo',()=>assert.equal(pick([{id:25,event_date:'2026-10-30',active:false},{id:26,event_date:'2026-11-01',active:true}],'2026-10-27',700),26));
