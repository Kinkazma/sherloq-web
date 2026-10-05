import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {noisesnifferPackedFlags} from '../src/noisesniffer-packed-flags.js';
test('96MP two-bit memberships retain repeated marks and full native byte export',async()=>{
 const count=96000000,budget=new Budget(256*1024**2),owner=budget.reserve(95469360),flags=noisesnifferPackedFlags(count,budget),expected=new Map();assert.equal(flags.byteLength,24000000);
 for(let i=0;i<50000;i++){const id=i*7687%count,bit=i%3?1:2;flags.mark(id,bit);flags.mark(id,2);expected.set(id,bit|2);}flags.mark(count-1,1);expected.set(count-1,1);
 let written=0;await flags.flush({write(bytes,offset){for(let j=0;j<bytes.length;j++)assert.equal(bytes[j],expected.get(offset+j)??0);written+=bytes.length;}});assert.equal(written,count);flags.dispose();owner();assert.equal(budget.total(),0);
});
test('insufficient spare RAM keeps the byte-page fallback; cancellation releases packed data',async()=>{
 const budget=new Budget(96*1024**2),owner=budget.reserve(90*1024**2);assert.equal(noisesnifferPackedFlags(96000000,budget),null);owner();const flags=noisesnifferPackedFlags(100003,budget),controller=new AbortController();controller.abort();await assert.rejects(flags.flush({write(){throw Error('Must not write');}},{signal:controller.signal}),e=>e.code==='CANCELLED');flags.dispose();assert.equal(budget.total(),0);
});
