import test from 'node:test';import assert from 'node:assert/strict';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('the real neural endpoint releases old sessions and reusable tensors while preserving one ORT runtime',async()=>{
 const previous={self:globalThis.self,fetch:globalThis.fetch,audit:globalThis.neuralSwitchAudit},audit={events:[],liveTensors:0},messages=[];globalThis.neuralSwitchAudit=audit;
 const module=code=>'data:text/javascript,'+encodeURIComponent(code);
 const factoryUrl=module('export function heapBytes(){return 16*1024**2;}');
 const ortUrl=module(`export const env={wasm:{},webgpu:{},versions:{test:'model-switch'}};
 export class Tensor {constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims;this.closed=false;globalThis.neuralSwitchAudit.liveTensors++;}dispose(){if(!this.closed){this.closed=true;globalThis.neuralSwitchAudit.liveTensors--;}}}
 export const InferenceSession={async create(bytes){const factor=bytes[0],a=globalThis.neuralSwitchAudit;a.events.push('create:'+factor);return{async run(feeds){return{y:new Tensor('float32',Float32Array.from(feeds.x.data,x=>x*factor),feeds.x.dims)};},async release(){a.events.push('release:'+factor);}};}};`);
 const assets=[];for(const factor of [2,3]){const bytes=Uint8Array.of(factor);assets.push({url:'https://example.invalid/'+factor,bytes:1,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')});}
 globalThis.fetch=async url=>new Response(Uint8Array.of(Number(String(url).split('/').at(-1))));
 let settle;const endpoint={postMessage(data){messages.push(data);if(data.executionReady)queueMicrotask(()=>endpoint.onmessage({data:{command:'execute'}}));if(data.result||data.error||data.disposed)settle?.(data);}};globalThis.self=endpoint;
 try{
  await import('../src/neural-graph-worker.js?switch-runtime');const results=[];
  for(const asset of assets){const data={asset,inputs:{x:{data:Float32Array.of(5),dims:[1]},bank:{data:Float32Array.of(7),dims:[1]}},reusableInputs:{bank:'same-bank'},provider:'wasm',runtime:{factoryUrl,ortUrl,wasmUrl:'unused'},memoryMaximumBytes:128*1024**2,outputBytes:4,threads:1};
   const result=await new Promise(resolve=>{settle=resolve;endpoint.onmessage({data});});assert.equal(result.error,undefined);results.push(result);await turn();assert.equal(audit.liveTensors,1,'only the declared immutable input stays cached');}
  assert.deepEqual(results.map(r=>[...r.result.y.data]),[[10],[15]]);assert.deepEqual(audit.events,['create:2','release:2','create:3']);assert.deepEqual(results[1].runtimeLifecycle,{runtimeInitializations:1,modelInitializations:2,modelSwitches:1,sessionCache:{sessions:0,bytes:0,hits:0,evictions:0,currentHit:false}});
  const disposed=await new Promise(resolve=>{settle=resolve;endpoint.onmessage({data:{command:'dispose'}});});assert.equal(disposed.error,undefined);assert.equal(disposed.disposed,true);assert.equal(disposed.cleanupReceipt.schema,'sherloq.neural-worker-cleanup/1');assert.equal(audit.liveTensors,0);assert.deepEqual(audit.events,['create:2','release:2','create:3','release:3']);
 }finally{globalThis.self=previous.self;globalThis.fetch=previous.fetch;if(previous.audit===undefined)delete globalThis.neuralSwitchAudit;else globalThis.neuralSwitchAudit=previous.audit;}
});
