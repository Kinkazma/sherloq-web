import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {EngineError} from '../src/errors.js';
import {createFloatPlane} from '../src/segmented-float-plane.js';
import {segmentedDft} from '../src/segmented-dft.js';
import {segmentedFrequency} from '../src/segmented-frequency.js';
import {contiguousSurface} from '../src/image-sources.js';
import {frequencyStreamMath} from '../src/frequency-stream-math.js';
const bits=a=>new Uint32Array(a.buffer,a.byteOffset,a.length);
function temporarySession(){
 const metrics={reads:0,writes:0,readBytes:0,writeBytes:0,smallReads:0,smallWrites:0,maximumRead:0,maximumWrite:0,live:0,created:0},session={backend:'opfs',async create(length){const data=new Uint8Array(length);metrics.live++;metrics.created++;let disposed=false;return{async readInto(out,offset){await Promise.resolve();assert.equal(disposed,false);metrics.reads++;metrics.readBytes+=out.length;metrics.maximumRead=Math.max(metrics.maximumRead,out.length);if(out.length<4096)metrics.smallReads++;out.set(data.subarray(offset,offset+out.length));},async write(src,offset){await Promise.resolve();assert.equal(disposed,false);metrics.writes++;metrics.writeBytes+=src.length;metrics.maximumWrite=Math.max(metrics.maximumWrite,src.length);if(src.length<4096)metrics.smallWrites++;data.set(src,offset);},flush(){},dispose(){assert.equal(disposed,false);disposed=true;metrics.live--;}};}};
 return{session,metrics};
}
const parallelPool={async run(spec){let next=0,failure;await Promise.all(Array.from({length:3},async()=>{while(next<spec.count&&!failure){const i=next++;try{await spec.consume(await spec.local(await spec.prepare(i)),i);}catch(error){failure??=error;}}}));if(failure)throw failure;}};
async function transform({rowSlabBytes=1024**2,storage='temporary',refuseScratch=false,cancel=false}={}){
 const width=64,height=2304,budget=new Budget(32*1024**2),values=Float32Array.from({length:width*height},(_,i)=>(i*509+Math.floor(i/11)*71)%65536),source=await createFloatPlane(width,height,{budget,ArrayType:Float32Array,storage:'memory'});await source.write(values,0,0,width,height);const baseline=budget.total(),{session,metrics}=temporarySession(),math=await frequencyStreamMath();let output,blocked=0;
 if(refuseScratch){const reserve=budget.reserve.bind(budget);budget.reserve=bytes=>{if(bytes===1024**2){blocked++;throw new EngineError('MEMORY_LIMIT','Refused optional1MiB scratch.');}return reserve(bytes);};}
 if(storage==='auto')budget.isBackingUnderPressure=()=>true;
 const controller=new AbortController();try{
  const work=segmentedDft(source,{budget,storage,temporarySession:session,blockPixels:4096,pool:parallelPool,temporaryTileSize:0,...(rowSlabBytes===undefined?{}:{rowSlabBytes}),signal:controller.signal,onProgress:event=>{if(cancel&&event.phase==='dft-columns'&&event.completed)controller.abort();}});
  if(cancel){await assert.rejects(work,{code:'CANCELLED'});assert.equal(metrics.live,0);assert.equal(budget.total(),baseline);}
  else{output=await work;const actual=new Float32Array(width*height*2);for(let y=0;y<height;y+=32)actual.set(await output.read(0,y,width,Math.min(32,height-y)),y*width*2);assert.deepEqual(bits(actual),bits(math.full(values,width,height)),'full reference DFT bits');await output.dispose();output=null;assert.equal(metrics.live,0);assert.equal(budget.total(),baseline);}
  return{...metrics,blocked};
 }finally{await output?.dispose();await source.dispose();assert.equal(budget.total(),0);}
}
test('temporary DFT can explicitly use bounded1MiB row slabs and drastically reduces tiny column IO',async t=>{
 const direct=await transform({rowSlabBytes:0}),slabs=await transform();assert.ok(slabs.reads<direct.reads/20,JSON.stringify({direct,slabs}));assert.ok(slabs.writes<direct.writes/20,JSON.stringify({direct,slabs}));assert.ok(slabs.smallReads<direct.smallReads/20);assert.ok(slabs.smallWrites<direct.smallWrites/20);assert.ok(slabs.maximumRead<=1024**2);assert.ok(slabs.maximumWrite<=1024**2);t.diagnostic(JSON.stringify({direct,slabs}));
});
test('automatic temporary DFT backing also activates bounded slabs',async()=>{const automatic=await transform({storage:'auto'});assert.ok(automatic.reads<1000);assert.ok(automatic.writes<1000);assert.equal(automatic.maximumRead,1024**2);});
test('optional temporary DFT scratch refusal falls back to exact bounded strided transfers',async()=>{const fallback=await transform({refuseScratch:true});assert.ok(fallback.blocked>0);assert.ok(fallback.smallReads>1000);assert.ok(fallback.smallWrites>1000);});
test('temporary DFT cancellation drains queued slab writes and releases every store and reservation',async()=>{await transform({cancel:true});});
test('temporary full frequency pipeline uses the same slabs without changing four presentation views',async t=>{
 const width=71,height=67,budget=new Budget(64*1024**2),pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*13)%256)},image={surface:contiguousSurface(pixels,budget)},params={smooth:3,threshold:37,filter:2},results=[];
 try{for(const rowSlabBytes of[0,1024**2]){const {session,metrics}=temporarySession(),result=await segmentedFrequency({...image,session},params,{budget,storage:'temporary',rowSlabBytes,temporaryTileSize:0,blockPixels:512});results.push({result,metrics});assert.equal(result.metrics.temporaryComplexRowSlabBytes,rowSlabBytes);}
  const frames=r=>[r.surface,...Object.values(r.rgbRecords).map(v=>v.surface)];for(let i=0;i<4;i++){const a=await frames(results[0].result)[i].readWindow(),b=await frames(results[1].result)[i].readWindow();try{assert.deepEqual(b.pixels.data,a.pixels.data,'frequency view'+i);}finally{a.release();b.release();}}
  assert.equal(results[1].result.data.zeroPercent,results[0].result.data.zeroPercent);assert.ok(results[1].metrics.reads<results[0].metrics.reads);assert.ok(results[1].metrics.writes<results[0].metrics.writes);t.diagnostic(JSON.stringify({direct:results[0].metrics,slabs:results[1].metrics}));
 }finally{for(const {result,metrics}of results){await Promise.all([result.surface,...Object.values(result.rgbRecords).map(v=>v.surface),result.tableRecords.mask.surface].map(v=>v.dispose()));await result.frequencyCache.dispose();assert.equal(metrics.live,0);}}assert.equal(budget.total(),0);
});
