import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {contiguousSurface} from '../src/image-sources.js';
import {segmentedNoisesnifferStatistics} from '../src/segmented-noisesniffer-statistics.js';
import {segmentedNoisesnifferSelection} from '../src/segmented-noisesniffer-selection.js';
import {pagedNoisesnifferSelection} from '../src/noisesniffer-paged-selection.js';
import {segmentedNoisesniffer} from '../src/segmented-noisesniffer.js';
import {noisesnifferStreamMath,noisesnifferStreamHeapBytes} from '../src/noisesniffer-stream-math.js';

const p={blockSize:3,cellSize:10,samplesPerBin:100,lowFrequencyFraction:.7,lowNoiseFraction:.5,view:'regions'};
async function fixture(){
 const width=31,height=21,budget=new Budget(256*1024**2),image={surface:contiguousSurface({width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>23+(i*73+Math.floor(i/11)*19)%210)},budget)},stats=await segmentedNoisesnifferStatistics(image,p.blockSize,{budget});
 await noisesnifferStreamMath();
 return{budget,image,stats,async close(){await stats.dispose();await image.surface.dispose();assert.equal(budget.total(),0);}};
}
async function controlledClock(fn,{now=()=>0,onTimer}={}){
 const prior=Object.getOwnPropertyDescriptor(performance,'now'),timer=globalThis.setTimeout,callbacks=[];
 Object.defineProperty(performance,'now',{configurable:true,value:now});
 globalThis.setTimeout=function(callback,delay,...args){
  if(typeof callback!=='function'||Number(delay??0)!==0)return timer.call(globalThis,callback,delay,...args);
  const stack=new Error().stack??'',origin=stack.split('\n').find(line=>line.includes('/src/')&&!line.includes('/errors.js'))??'';callbacks.push(origin);
  return timer.call(globalThis,function(...values){onTimer?.(origin);return callback.apply(this,values);},delay,...args);
 };
 try{return await fn(callbacks);}finally{globalThis.setTimeout=timer;if(prior)Object.defineProperty(performance,'now',prior);else delete performance.now;}
}
async function collect(selection){
 const output={};for(const k of ['selected','low_noise','flags']){output[k]=new Uint8Array(selection[k].byteLength);await selection[k].readInto(output[k]);}
 return{...output,selectedCount:selection.selectedCount,lowCount:selection.lowCount,all:selection.all_blocks.slice(),low:selection.low_noise_blocks.slice()};
}
for(const [label,execute,module]of[
 ['RAM',segmentedNoisesnifferSelection,'segmented-noisesniffer-selection.js'],
 ['paged',pagedNoisesnifferSelection,'noisesniffer-paged-selection.js']
]){
 test(label+' selection does not enqueue a timer before its 8ms work budget',async()=>{
  const h=await fixture();let result;
  try{await controlledClock(async callbacks=>{result=await execute(h.image,p,h.stats,{budget:h.budget,storage:'memory'});assert.equal(callbacks.filter(line=>line.includes('/'+module+':')).length,0,'Small transactions should not pay a timer per row, channel or bin');assert(result.selectedCount>0);});}finally{await result?.dispose();await h.close();}
 });
 test(label+' selection yields after budget expiry and observes cancellation during that yield',async()=>{
  const h=await fixture(),controller=new AbortController();let current=0,reads=0,yields=0;const read=h.stats.means.read.bind(h.stats.means);h.stats.means.read=async(...args)=>{const value=await read(...args);reads++;current+=9;return value;};
  try{await controlledClock(async()=>{await assert.rejects(execute(h.image,p,h.stats,{budget:h.budget,signal:controller.signal,storage:'memory'}),error=>error.code==='CANCELLED');},{now:()=>current,onTimer:origin=>{if(origin.includes('/'+module+':')){yields++;controller.abort();}}});assert(reads>0);assert.equal(yields,1);}finally{await h.close();}
 });
 test(label+' fast cooperative await still checks cancellation before the next source read',async()=>{
  const h=await fixture(),controller=new AbortController();let ticks=0,reads=0;const valid=h.stats.valid.readInto.bind(h.stats.valid);h.stats.valid.readInto=async(...args)=>{reads++;return valid(...args);};
  try{await controlledClock(async()=>{await assert.rejects(execute(h.image,p,h.stats,{budget:h.budget,signal:controller.signal,storage:'memory'}),error=>error.code==='CANCELLED');},{now:()=>{if(++ticks===2)queueMicrotask(()=>controller.abort());return 0;}});assert.equal(reads,0);}finally{await h.close();}
 });
}
test('cooperative RAM and paged paths preserve exact global IDs, bin order, flags and counts',async()=>{
 const h=await fixture();let ram,paged;
 try{ram=await segmentedNoisesnifferSelection(h.image,p,h.stats,{budget:h.budget});paged=await pagedNoisesnifferSelection(h.image,p,h.stats,{budget:h.budget,storage:'memory'});assert.deepEqual(await collect(paged),await collect(ram));}finally{await ram?.dispose();await paged?.dispose();await h.close();}
});
test('segmented distribution and view rendering avoid unconditional timers and preserve cached A/B/A pixels',async()=>{
 const h=await fixture();let a,b,back,cache;
 try{await controlledClock(async callbacks=>{
  a=await segmentedNoisesniffer(h.image,p,{budget:h.budget,cache:{stats:h.stats},accountedHeapBytes:noisesnifferStreamHeapBytes()});cache=a.noisesnifferCache;
  const rect={x:0,y:0,width:31,height:21},first=await a.surface.readWindow(rect),pixels=first.pixels.data.slice();await first.release();
  b=await segmentedNoisesniffer(h.image,{...p,view:'mask'},{budget:h.budget,cache,accountedHeapBytes:noisesnifferStreamHeapBytes()});cache=b.noisesnifferCache;
  back=await segmentedNoisesniffer(h.image,p,{budget:h.budget,cache,accountedHeapBytes:noisesnifferStreamHeapBytes()});cache=back.noisesnifferCache;const last=await back.surface.readWindow(rect);try{assert.deepEqual(last.pixels.data,pixels);}finally{await last.release();}
  assert.equal(callbacks.filter(line=>line.includes('/segmented-noisesniffer.js:')).length,0);assert.equal(b.metrics.analysisCached,true);assert.equal(back.metrics.analysisCached,true);
 });}finally{await a?.surface.dispose();await b?.surface.dispose();await back?.surface.dispose();await cache?.dispose();await h.close();}
});
test('segmented renderer yields on an expired budget and cancels without replacing an accepted cache',async()=>{
 const h=await fixture(),controller=new AbortController();let accepted,cache,current=0,yields=0;
 try{accepted=await segmentedNoisesniffer(h.image,p,{budget:h.budget,cache:{stats:h.stats},accountedHeapBytes:noisesnifferStreamHeapBytes()});cache=accepted.noisesnifferCache;
  await controlledClock(async()=>{await assert.rejects(segmentedNoisesniffer(h.image,{...p,view:'mask'},{budget:h.budget,cache,signal:controller.signal,accountedHeapBytes:noisesnifferStreamHeapBytes()}),error=>error.code==='CANCELLED');},{now:()=>{current+=9;return current;},onTimer:origin=>{if(origin.includes('/segmented-noisesniffer.js:')){yields++;controller.abort();}}});assert.equal(yields,1);assert(cache.analysis);const frame=await accepted.surface.readWindow({x:0,y:0,width:31,height:21});await frame.release();
 }finally{await accepted?.surface.dispose();await cache?.dispose();await h.close();}
});
