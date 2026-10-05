import test from 'node:test';
import assert from 'node:assert/strict';

test('diagnostic reads preserve the active cancellation controller and root transport failures close storage',
 {skip:!process.execArgv.includes('--experimental-test-module-mocks')&&'Requires isolated module mocks'},async t=>{
 const old=Object.getOwnPropertyDescriptor(globalThis,'self'),messages=[],waiters=[];let aborted=false,disposed=0,started;
 const entered=new Promise(resolve=>started=resolve);
 const take=predicate=>{const value=messages.find(predicate);return value?Promise.resolve(value):new Promise(resolve=>waiters.push({predicate,resolve}));};
 const target={postMessage(value){messages.push(value);for(const item of waiters.splice(0)){if(item.predicate(value))item.resolve(value);else waiters.push(item);}}};
 Object.defineProperty(globalThis,'self',{configurable:true,value:target});t.after(()=>{if(old)Object.defineProperty(globalThis,'self',old);else delete globalThis.self;});
 t.mock.module('../src/index.js',{namedExports:{createEngine:()=>({capabilities:()=>({version:'test'}),resumeAutomatic:async(request,{signal,onProgress})=>{assert.ok(signal instanceof AbortSignal);assert.deepEqual(request,{analysisId:'retained',groups:['sift']});onProgress({phase:'resuming'});return {analysisId:request.analysisId};},run:async(task,{signal})=>{started();await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));return {cancelled:true};},dispose:async()=>{disposed++;}})}});
 await import('../src/worker.js');
 target.onmessage({data:{sequence:1,method:'init',args:[],options:{}}});await take(x=>x.sequence===1);
 target.onmessage({data:{sequence:4,method:'resumeAutomatic',args:[{analysisId:'retained',groups:['sift']}]}});assert.equal((await take(x=>x.sequence===4&&x.progress)).progress.phase,'resuming');assert.deepEqual((await take(x=>x.sequence===4&&x.result)).result,{analysisId:'retained'});
 target.onmessage({data:{sequence:2,method:'run',args:[{}]}});await entered;
 target.onmessage({data:{sequence:3,method:'capabilities',args:[]}});assert.equal((await take(x=>x.sequence===3)).result.version,'test');
 target.onmessage({data:{sequence:2,method:'cancel-task'}});await take(x=>x.sequence===2);assert.equal(aborted,true);
 target.onmessage({data:null});assert.equal((await take(x=>x.fatal)).fatal.code,'WORKER_MESSAGE_FAILED');
 await take(x=>x.storageClosed===true);assert.equal(disposed,1);
});
