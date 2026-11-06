import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const url=new URL('../sherloq-browser/assets/engine-worker.js',import.meta.url),source=await readFile(url,'utf8');
const code=source.replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(url.href)).replace("await import('./unified-engine/src/index.js')",'await loadEngine()');
const imports={};for(const m of source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm))for(const part of m[1].split(',')){const [name,alias]=part.trim().split(/\s+as\s+/);imports[alias??name]=(await import(new URL(m[2],url).href))[name];}

async function attempt({width,height,budget,presentation={view:'overlay'}}){
 const messages=[],calls=[],sha='a'.repeat(64),surface={id:'original',revision:1,width,height,format:'rgb8'};
 const engine={async loadBlob(){return {width,height,sha256:sha,surface,provenance:{format:'png'}};},async run(task){calls.push(task);return {id:task.id,imageId:task.imageId,operation:'ela.energy',status:'ok',layout:'surface',surface:{...surface,id:'scores',format:'float32'},planeSurfaces:{energy_low_score:{...surface,id:'scores',format:'float32'}},data:{width,height,metadata:{energy:{}}},provenance:{originalSha256:sha,params:task.params}};},async releaseSurface(){},async dispose(){}};
 const context=vm.createContext({...imports,Blob,performance,structuredClone,URL,AbortController,AbortSignal,DOMException,Uint8Array,Uint32Array,Float32Array,Int32Array,renderEnergySurface:async()=>({width,height,format:'rgb8',data:new Uint8Array(0)}),loadEngine:async()=>({createEngine:()=>engine}),self:{postMessage:value=>messages.push(value)}});
 new vm.Script(code).runInContext(context);
 async function send(id,action,payload){context.self.onmessage({data:{id,action,payload,options:{computeProfile:'maximum',uiRGBBudgetBytes:budget,uiReserveBytes:32*1024**2}}});await vm.runInContext('queue',context);return messages.find(m=>m.id===id&&(m.error||Object.hasOwn(m,'result')));}
 assert.equal((await send(1,'load',{id:'input'})).error,undefined);
 const answer=await send(2,'run',{id:'result',imageId:'input',operation:'ela.energy',params:{quality:75},presentation});
 return {answer,calls};
}
test('the large native Energy request uses engine-owned maps within the real consumer RGB budget',async()=>{
 const {answer,calls}=await attempt({width:3822,height:7716,budget:128*1024**2});
 assert.equal(answer.error,undefined);assert.equal(calls.length,1);assert.equal(calls[0].resultLayout,'surface');assert.equal(calls[0].params.quality,75);
});
test('insufficient RGB and two-panel presentation budgets are still refused before native work',async()=>{
 for(const spec of [{budget:3822*7716*3-1},{budget:128*1024**2,presentation:{view:'scores',field:'both'}}]){
  const {answer,calls}=await attempt({width:3822,height:7716,...spec});assert.equal(answer.error.code,'RESULT_MEMORY_BUDGET');assert.equal(calls.length,0);
 }
});
test('a small native request keeps its historical result route and unchanged scientific parameters',async()=>{
 const {answer,calls}=await attempt({width:96,height:96,budget:1024**2});assert.equal(answer.error,undefined);assert.equal(calls[0].resultLayout,undefined);assert.equal(calls[0].params.quality,75);
});
