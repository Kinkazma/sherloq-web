import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {createAutomaticElaProvider} from '../src/automatic-ela-provider.js';

test('automatic ELA retains actual native stages through a Ghost refusal and publishes the native scientific fields',{timeout:30000},async()=>{
 const ref=JSON.parse(await readFile(new URL('data/automatic-ela-provider-native.json',import.meta.url))),bytes=new Uint8Array(await readFile(new URL('data/automatic-ela-provider.rgb',import.meta.url))),budget=new Budget(512*1024**2),surface=createRgbSurface({byteLength:bytes.length,readInto(out,at){out.set(bytes.subarray(at,at+out.length));}},{width:ref.width,height:ref.height,budget,ownsStore:false}),provider=createAutomaticElaProvider({image:{surface},budget,cellParams:{...ref.params,ghost:true},maxWorkers:1}),job={id:'ela',enabled:true},events=[];let fail=true,result;
 const hooks={onProgress:e=>{events.push(e);if(fail&&e.phase==='ghost-cell-quality'&&e.quality===50){fail=false;throw new EngineError('MEMORY_ALLOCATION','Injected refused subsequent aggregation',{details:{allocationKind:'array-buffer',requestedBytes:8192}});}}};
 const hash=a=>createHash('sha256').update(a).digest('hex'),storeHash=async store=>{const digest=createHash('sha256');if(store.visit)await store.visit(bytes=>digest.update(bytes));else{const buffer=new Uint8Array(Math.min(65536,store.byteLength));for(let at=0;at<store.byteLength;at+=buffer.length){const part=buffer.subarray(0,Math.min(buffer.length,store.byteLength-at));await store.readInto(part,at);digest.update(part);}}return digest.digest('hex');};
 try{
  await assert.rejects(provider.run(job,hooks),{code:'MEMORY_ALLOCATION'});const cells=events.filter(e=>e.phase==='ela-cell-describe').length,ghosts=events.filter(e=>e.phase==='ghost-quality').length;assert.ok(cells>0);assert.equal(ghosts,71);
  result=await provider.run(job,hooks);assert.equal(events.filter(e=>e.phase==='ela-cell-describe').length,cells);assert.equal(events.filter(e=>e.phase==='ghost-quality').length,ghosts);const base=result.value;
  assert.ok(base.cells.ghost_curves.length>0);for(const [key,expected]of Object.entries(ref.fields)){if(['score','pre_background_score'].includes(key))continue;if(key==='energy_planes'){const digest=createHash('sha256');for(const store of base.energy.energy_planes)await store.visit(bytes=>digest.update(bytes));assert.equal(digest.digest('hex'),expected.sha256,key);continue;}const data=base.cells[key]??base.energy[key];if(key==='content'){for(let i=0;i<data.length;i++)assert.ok(Math.abs(data[i]-expected.values[i])<=3e-7);}else assert.equal(ArrayBuffer.isView(data)?hash(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)):await storeHash(data),expected.sha256,key);}
  assert.equal(base.decoded_bgr8_sha256,ref.decoded_bgr8_sha256);assert.equal(base.metrics.preview.recompressions,0);await provider.dispose();const before=budget.total();assert.ok(before>0,'Published result retains its buffers after provider closes');await result.release();result=null;
 }finally{await result?.release();await provider.dispose();await surface.dispose();}assert.equal(budget.total(),0);assert.equal(budget.resourceSnapshot().domains['array-buffer'].materializedBytes,0);
});
