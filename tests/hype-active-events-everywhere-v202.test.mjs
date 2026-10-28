import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('function hypeVisibleOperationalEventsV202(');
const end=source.indexOf('\nwindow.HypeVisibleOperationalEventsV202=',begin);
assert.ok(begin>=0&&end>begin);
const code=source.slice(begin,end);
const events=[
 {id:23,event_date:'2026-10-23',active:false},
 {id:24,event_date:'2026-10-24',active:false},
 {id:26,event_date:'2026-11-01',active:true},
 {id:25,event_date:'2026-10-30',active:true}
];
function pick(date,minutes) {
 const ctx={events,now:{date,minutes}};
 vm.runInNewContext(code+';result=hypeVisibleOperationalEventsV202(events).map(e=>e.id)',{
 ...ctx, hypeEventStillPublicV37:(e)=>{
 const day=e.event_date;
 const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const after=next.toISOString().slice(0,10);
 return date<after || (date===after && minutes<480);
 }});
}
test('somente festas atuais na operação',()=>{
 const context={events,hypeEventStillPublicV37:e=>e.event_date>='2026-10-27'};
 vm.runInNewContext(code+';result=hypeVisibleOperationalEventsV202(events).map(e=>e.id)',context);
 assert.deepEqual([...context.result],[25,26]);
});
test('festas passadas nunca são apagadas da lista original',()=>{
 const context={events,hypeEventStillPublicV37:e=>e.event_date>='2026-10-27'};
 vm.runInNewContext(code+';result=hypeVisibleOperationalEventsV202(events)',context);
 assert.equal(events.length,4);
 assert.equal(context.result.length,2);
});
