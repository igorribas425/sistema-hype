import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const file of ['admin-v34.js','portaria-v18.js']){
  const src=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const start=src.indexOf('  function portariaVisibleEventsV201(');
  const end=src.indexOf('\n  async function loadEvents()',start)>0?
    src.indexOf('\n  async function loadEvents()',start):
    src.indexOf('\n  function selectSmartEvent(',start);
  const fn=src.slice(start,end);
  const get=(events,date,time)=>vm.runInNewContext(fn+";portariaVisibleEventsV201(events,now).map(e=>e.id)",{
    events,now:new Date(date+'T'+time+'-03:00'),Intl,Date
  });
  const events=[
    {id:23,event_date:'2026-10-23',active:false},
    {id:24,event_date:'2026-10-24',active:false},
    {id:25,event_date:'2026-10-30',active:true},
    {id:26,event_date:'2026-11-01',active:true}
  ];
  test(file+': esconde festas anteriores sem afetar as próximas',()=>{
    assert.deepEqual([...get(events,'2026-10-27','23:40:00')],[25,26]);
  });
  test(file+': mantém festa até 7h59 da madrugada seguinte',()=>{
    assert.deepEqual([...get(events,'2026-10-31','07:59:00')],[25,26]);
  });
  test(file+': encerra visibilidade a partir das 8h',()=>{
    assert.deepEqual([...get(events,'2026-10-31','08:00:00')],[26]);
  });
  test(file+': depois de encerradas não aparecem na Portaria',()=>{
    assert.deepEqual([...get(events,'2026-11-02','08:00:00')],[]);
  });
}
