import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {acquireMigrationWorkspace} from '../src/migration-workspace.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('migration owners share one allowance and keep it until the last in-flight I/O ends',async()=>{
 const budget=new Budget(100),a=acquireMigrationWorkspace(budget,100),b=acquireMigrationWorkspace(budget,100);assert.equal(budget.total(),100);let finish;const io=a.run(async reserve=>{const release=reserve(100);try{await new Promise(resolve=>finish=resolve);}finally{release();}});await tick();await a.release();let freed=false;const close=b.release().then(()=>freed=true);await tick();assert.equal(freed,false);assert.equal(budget.total(),100);finish();await io;await close;assert.equal(budget.total(),0);
});
test('cancelled migration queue entries do not block later useful I/O',async()=>{
 const budget=new Budget(100),owner=acquireMigrationWorkspace(budget,100),controller=new AbortController();let finish;const first=owner.run(()=>new Promise(resolve=>finish=resolve));await tick();const cancelled=owner.run(()=>assert.fail('Cancelled I/O executed'),{signal:controller.signal});const checked=assert.rejects(cancelled,{code:'CANCELLED'});controller.abort();const last=owner.run(reserve=>{const release=reserve(100);release();return 7;});finish();await first;await checked;assert.equal(await last,7);await owner.release();assert.equal(budget.total(),0);
});
test('store allocation failure releases the migration allowance and delete errors do not strand it',async()=>{
 const tiny=new Budget(20),session={backend:'indexeddb',async create(){return {stagingBytes:16,readInto(out){out.fill(1);},write(){},dispose(){throw Error('delete');}};}};await assert.rejects(createSegmentedBytes(8,{budget:tiny,storage:'memory',temporarySession:session}),{code:'MEMORY_LIMIT'});assert.equal(tiny.total(),0);
 const budget=new Budget(24),store=await createSegmentedBytes(8,{budget,storage:'temporary',temporarySession:session});await assert.rejects(store.promote(),/delete/);assert.equal(store.storage,'memory');assert.equal(budget.total(),24,'Committed RAM lost its emergency window');await store.spill();await assert.rejects(store.dispose(),/delete/);assert.equal(budget.total(),0);
});

test('migration accounting survives a live buffer beyond operation completion',async()=>{const budget=new Budget(100),owner=acquireMigrationWorkspace(budget,100);let drop;await owner.run(reserve=>{drop=reserve(100);});let done=false;const close=owner.release().then(()=>done=true);await tick();assert.equal(done,false);assert.equal(budget.total(),100);drop();await close;assert.equal(budget.total(),0);});
