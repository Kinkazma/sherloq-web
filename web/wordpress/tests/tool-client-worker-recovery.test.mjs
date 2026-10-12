import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';

for(const code of ['WORKER_FAILED','WORKER_MESSAGE_FAILED','WORKER_LOAD_FAILED'])test(`${code}: retry replaces only the failed M2 client and keeps the original image`,async()=>{
 const previousFetch=globalThis.fetch;
 globalThis.fetch=async()=>({json:async()=>({assetBase:'./unified-assets/'})});
 let loads=0,created=0,disposed=0;
 const source={id:'original',surface:{id:'original-rgb',revision:1,width:4,height:3,format:'rgb8'}};
 const engine={async loadBlob(){loads++;return source;},async capabilities(){return {memory:{budgetBytes:1024**3,retainedBytes:36,cacheBytes:0,knownHeapCapacityBytes:0}};},async dispose(){}};
 const client=await createToolClient({engineFactory:()=>engine,m2Factory:async()=>{
  const attempt=++created;
  return {async analyzeBlob(){if(attempt===1)throw Object.assign(Error('Transport failed'),{code});return {id:2,width:4,height:3};},async metadata(){return {source:{dimensions:source.surface}};},async release(){},async dispose(){disposed++;}};
 }});
 try{
  const file=new Blob(['synthetic']);await client.load({id:'original',blob:file});
  const task={id:'analysis',operation:'m2.catnet',params:{},backend:'auto'};
  await assert.rejects(client.run(task,{file}),error=>error.code===code);
  assert.equal(disposed,1);assert.equal(client.source,source);
  const result=await client.run(task,{file});
  assert.equal(result.status,'ok');assert.equal(created,2);assert.equal(loads,1);assert.equal(result.views.length,3);
 }finally{await client.dispose();globalThis.fetch=previousFetch;}
});
