import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {catnetCompanionSource} from '../src/catnet-companion-source.js';
test('real Q100/444 companion attempts all owners after a surface failure and retries its failed owner',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=(url,options)=>String(url).startsWith('file:')?readFile(new URL(String(url))).then(data=>new Response(data)):originalFetch(url,options);
 const budget=new Budget(128*1024**2),width=16,height=16,surface={descriptor:{width,height},async readWindow(r){const release=budget.reserve(r.width*r.height*3);return{pixels:{format:'rgb8',width:r.width,height:r.height,data:Uint8Array.from({length:r.width*r.height*3},(_,i)=>(i*17)%256)},release};}};let companion;
 try{
  companion=await catnetCompanionSource({surface},{budget});await companion.releaseEncoded();assert.equal(budget.total(),width*height*3);
  const actual=companion.surface.dispose,primary=Object.freeze(Object.assign(Error('controlled surface retirement failure'),{code:'STORAGE_IO'}));let attempts=0;
  companion.surface.dispose=()=>{attempts++;throw primary;};await assert.rejects(companion.release(),e=>e===primary);assert.equal(budget.total(),0,'RGB must retire even though an independent surface failed');
  await assert.rejects(companion.source.visit(()=>{}),/disposed/);companion.surface.dispose=()=>{attempts++;return actual();};await companion.release();assert.equal(attempts,2);await companion.release();assert.equal(attempts,2);assert.equal(budget.total(),0);
 }finally{try{await companion?.store.dispose();}finally{globalThis.fetch=originalFetch;}}
});
