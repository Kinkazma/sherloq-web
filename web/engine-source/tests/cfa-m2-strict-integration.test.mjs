import test from 'node:test';
import assert from 'node:assert/strict';
import {createM2WorkerHost} from '../src/m2-worker-host.js';
import {createM2WorkerClient} from '../src/m2-worker-client.js';
import {withM2NativeSourceTransport} from '../src/m2-native-source-client.js';
import {createCfaSourceRegionRouter} from '../src/cfa-source-region-router.js';
import {cfaFixture} from './helpers/cfa-strict-fixture.mjs';
import {cfaNpz} from '../src/npz.js';
import {createM2NpzStream} from '../src/m2-npz-stream.js';

// Controlled graph outputs; the production host/channel/router/context manager,
// native postprocess, display and NPZ implementations are real. No model proof.
async function endpoint(fixture) {
 const worker={postMessage(message,transfer=[]){const data=structuredClone(message,{transfer});queueMicrotask(()=>host.handle(data));},terminate(){}};
 const host=createM2WorkerHost({post(message,transfer=[]){const data=structuredClone(message,{transfer});queueMicrotask(()=>worker.onmessage?.({data}));},analyzerFactories:{cfa:configuration=>createCfaSourceRegionRouter({...configuration,nativeFactory:()=>fixture.native})}});
 const client=withM2NativeSourceTransport(await createM2WorkerClient({memoryBudgetBytes:32*1024**2,methods:{cfa:{}}},{workerFactory:()=>worker}));
 return client;
}
function reader(f) {
 const d=f.domain,reads=[];let disposed=0;
 return{width:d.width,height:d.height,sha256:d.sourceSha256,origin:d.origin,sourceRegionDomain:d.descriptor,purpose:'analysis-native-contexts',analysisContext:'native-cfa-contexts-only',reads,get disposed(){return disposed;},
  async readWindow(rect,hooks){reads.push({...rect});return f.image.surface.readWindow({...rect,x:rect.x+d.origin[0],y:rect.y+d.origin[1]},hooks);},dispose(){disposed++;}};
}

test('production M2 host accepts only the explicit CFA contexts channel and preserves result-owned source lifetime',{timeout:10000},async()=>{
 const f=await cfaFixture({rectangles:[[1,1,49,49],[65,3,113,51]],exclusions:[[17,17,25,25]]}),r=reader(f),client=await endpoint(f);
 try {
  const result=await client.analyzeNativeRectangle('cfa',r,{variant:'Original',block:8,tile:32},{backend:'cpu'});
  assert(f.calls.length>1);assert.equal(r.disposed,0);assert(r.reads.length>1);
  for(const rect of r.reads)for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)assert(f.domain.contains(x,y),'No excluded scientific RGB reaches the controlled native analyzer');
  const metadata=await client.metadata(result);assert.equal(metadata.metadata.fragmented,true);assert.equal(metadata.provenance.analysisContext,'native-cfa-contexts-only');assert.equal(metadata.provenance.sourceRegionDomain.fingerprint,f.domain.fingerprint);
  const calls=f.calls.length;for(const view of[0,1,2]){const display=await client.readDisplay(result.id,view,{x:0,y:0,w:result.width,h:result.height,step:1});assert.equal(display.pixels.width,result.width);assert.equal(r.disposed,0);}assert.equal(f.calls.length,calls);
  const exp=await client.beginExport(result.id),bytes=await client.readExport(exp.id,0,Math.min(exp.bytes,65536));assert(bytes.length>0);await client.releaseExport(exp.id);
  await client.release(result.id);assert.equal(r.disposed,1);assert.equal((await client.memory()).activeReservationBytes,0);
 } finally {await client.dispose();await f.close();assert.equal(f.held.size,0);assert.equal(f.windows.size,0);assert.equal(f.budget.snapshot().activeReservationBytes,0);}
});

test('a preparation envelope or a non-CFA consumer cannot use the new scientific CFA channel',{timeout:10000},async()=>{
 for(const patch of[{purpose:'preparation-envelope',preparationContext:'envelope-not-scientific-membership'}, {analysisContext:'admitted-native-rectangle'}, {method:'rita'}]) {
  const f=await cfaFixture({rectangles:[[1,1,49,49],[65,3,113,51]]}),r=Object.assign(reader(f),patch),client=await endpoint(f);
  try{await assert.rejects(client.analyzeNativeRectangle(patch.method??'cfa',r,{block:8,tile:32}));assert.equal(f.calls.length,0);assert.equal(r.reads.length,0);assert.equal(r.disposed,1);assert.equal((await client.memory()).activeReservationBytes,0);}finally{await client.dispose();await f.close();}
 }
});

test('packed CFA NPZ and bounded M2 streaming preserve the same eight raw fields and metadata',{timeout:10000},async()=>{
 const f=await cfaFixture({rectangles:[[1,1,49,49],[65,3,113,51]]});let result,stream;
 try{result=await f.run({variant:'Original',block:8,tile:32});const direct=cfaNpz(result,16*1024**2);stream=await createM2NpzStream('cfa',result,{budget:f.budget});const out=new Uint8Array(stream.length);for(let at=0;at<out.length;at+=1024)out.set(await stream.read(at,Math.min(1024,out.length-at)),at);assert.deepEqual(out,direct.bytes);assert.equal(new DataView(out.buffer).getUint16(out.length-12,true),10);}
 finally{stream?.release();result?.release();await f.close();assert.equal(f.budget.snapshot().activeReservationBytes,0);}
});
