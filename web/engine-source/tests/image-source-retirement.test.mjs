import test from'node:test';import assert from'node:assert/strict';import{Budget}from'../src/cache.js';import{disposeSegmentedImage}from'../src/image-sources.js';
const fault=()=>Object.freeze(Object.assign(new Error('Native source dependant ACK refused'),{code:'STORAGE_IO'}));
const turn=()=>new Promise(r=>setImmediate(r));function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function fixture(){const budget=new Budget(1024),events=[],error=fault();const owner=(name,n,handler)=>{budget.retain(n);let calls=0,closed=false;return{get calls(){return calls;},async dispose(){if(closed)return;calls++;events.push(name);await handler?.(calls);closed=true;budget.retained-=n;}};};return{budget,events,error,owner};}
test('failed Noisesniffer cache keeps its Original surface/session/source alive until retry',async()=>{
 const f=fixture(),cache=f.owner('cache',23,n=>{if(n===1)throw f.error;}),record={noisesnifferCache:cache,surface:f.owner('surface',31),session:f.owner('session',7),source:f.owner('source',5)};
 await assert.rejects(disposeSegmentedImage(record),e=>e===f.error);assert.deepEqual(f.events,['cache']);assert.equal(record.noisesnifferCache,cache);assert.equal(f.budget.total(),66);await disposeSegmentedImage(record);assert.deepEqual(f.events,['cache','cache','surface','session','source']);assert.equal(f.budget.total(),0);
});
test('independent cache owners retire once and leave failed old owners retryable',async()=>{
 const f=fixture(),a=f.owner('A',11),b=f.owner('B',13,n=>{if(n===1)throw f.error;}),record={emCache:a,noisesnifferCache:b,surface:f.owner('surface',17)};
 await assert.rejects(disposeSegmentedImage(record),e=>e===f.error);assert.equal(a.calls,1);assert.equal(b.calls,1);assert.equal(f.budget.total(),30);await disposeSegmentedImage(record);assert.equal(a.calls,1);assert.equal(b.calls,2);assert.equal(f.budget.total(),0);
});
test('source surface refusal never retires its temporary backing or encoded source early',async()=>{
 const f=fixture(),record={surface:f.owner('surface',17,n=>{if(n===1)throw f.error;}),session:f.owner('session',19),source:f.owner('source',23)};
 await assert.rejects(disposeSegmentedImage(record),e=>e===f.error);assert.deepEqual(f.events,['surface']);assert.equal(f.budget.total(),59);await disposeSegmentedImage(record);assert.deepEqual(f.events,['surface','surface','session','source']);assert.equal(f.budget.total(),0);
});
test('session retry does not redispose an acknowledged surface, and encoded source stays live',async()=>{
 const f=fixture(),record={surface:f.owner('surface',17),session:f.owner('session',19,n=>{if(n===1)throw f.error;}),source:f.owner('source',23)};
 await assert.rejects(disposeSegmentedImage(record),e=>e===f.error);assert.deepEqual(f.events,['surface','session']);assert.equal(f.budget.total(),42);await disposeSegmentedImage(record);assert.deepEqual(f.events,['surface','session','session','source']);assert.equal(f.budget.total(),0);
});
test('concurrent Original disposal coalesces the same active cache ACK',async()=>{
 const f=fixture(),ack=deferred(),record={noisesnifferCache:f.owner('cache',11,()=>ack.promise),surface:f.owner('surface',17)};const a=disposeSegmentedImage(record),b=disposeSegmentedImage(record);assert.equal(a,b);await turn();assert.deepEqual(f.events,['cache']);assert.equal(f.budget.total(),28);ack.resolve();await Promise.all([a,b]);assert.deepEqual(f.events,['cache','surface']);assert.equal(f.budget.total(),0);
});
test('pixel-store cache failures keep their entries and Original, while acknowledged siblings retire',async()=>{
 const f=fixture(),a=f.owner('pixel-A',11,n=>{if(n===1)throw f.error;}),b=f.owner('pixel-B',13),record={pixelStoreCaches:new Map([['A',a],['B',b]]),surface:f.owner('surface',17)};
 await assert.rejects(disposeSegmentedImage(record),e=>e===f.error);assert.equal(record.pixelStoreCaches.get('A'),a);assert.equal(record.pixelStoreCaches.has('B'),false);assert.equal(f.budget.total(),28);await disposeSegmentedImage(record);assert.equal(record.pixelStoreCaches.size,0);assert.equal(f.budget.total(),0);
});
test('replaced cache fields cannot lose an older refused owner before final source closure',async()=>{
 const f=fixture(),old=f.owner('old',11,n=>{if(n===1)throw f.error;}),fresh=f.owner('fresh',13),record={noisesnifferCache:old,surface:f.owner('surface',17)};
 await assert.rejects(disposeSegmentedImage(record),e=>e===f.error);record.noisesnifferCache=fresh;await disposeSegmentedImage(record);assert.equal(old.calls,2);assert.equal(fresh.calls,1);assert.equal(f.budget.total(),0);
});
test('a borrowed Original temporary session remains owned by its caller after crop retirement',async()=>{
 const f=fixture(),session=f.owner('borrowed-session',19),record={ownsTemporarySession:false,session,surface:f.owner('surface',17),source:f.owner('source',23)};await disposeSegmentedImage(record);assert.equal(session.calls,0);assert.deepEqual(f.events,['surface','source']);assert.equal(f.budget.total(),19);await session.dispose();assert.equal(f.budget.total(),0);
});
