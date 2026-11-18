import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface} from './rgb-surface.js';
import {plotsStreamMath,plotsStreamHeapBytes} from './plots-stream-math.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {allocateTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// Presentation sidecar only. Native table/CSV never consume these bytes.
// The existing SDR8 pyrDown kernel, halos, row order and same level are reused;
// this is neither nearest sampling nor normalization of working RGB16 codes.
export function attachPlotDisplayColors(table,{source,binding,budget,isCurrent,temporarySession,getTemporarySession,profile={},blockPixels=65536,storage='auto'}={}){
 const original=source,d=source?.descriptor,t=table?.descriptor,scale=t?.scale;
 requireValue(d?.format==='rgb8'&&t?.format==='float32-table'&&typeof isCurrent==='function'&&binding?.sourceSurfaceId===d.id&&binding.sourceRevision===d.revision&&typeof binding.sourceSha256==='string'&&Number.isInteger(scale)&&scale>=0&&scale<=30&&t.gridWidth===Math.ceil(d.width/2**scale)&&t.gridHeight===Math.ceil(d.height/2**scale),'An actual canonical SDR pyrDown partner is required.');
 const descriptor=Object.freeze({...t,presentationColors:Object.freeze({schema:'sherloq.plot-display-colors/1',format:'rgb8',method:'canonical-sdr-native-pyrDown',scale,gridWidth:t.gridWidth,gridHeight:t.gridHeight,sourceBinding:Object.freeze({...binding})})});
 const pages=new Set(),basePages=new Set(),pending=new Set(),refused=new Set();let current=source,owned,previous,prefixStore,pool,cleanup,workspace,opening,closing=false,closed=false,disposal,tableClosed=false;
 const ack=value=>{if(value===false||value===0)throw new EngineError('BUSY','Plot display color retirement was not acknowledged.');};
 const check=signal=>{checkAbort(signal);if(closing||closed||source!==original||source.descriptor.id!==d.id||source.descriptor.revision!==d.revision||!isCurrent())throw new EngineError('SOURCE_CHANGED','The canonical plot display source changed.');};
 async function closeWorkers(){if(cleanup){try{await cleanup.retire({endpoints:true,retryEndpoints:true});cleanup=null;pool=null;}catch(primary){refused.add(cleanup);throw primary;}}if(workspace){workspace();workspace=null;}}
 async function retirePrefix(skip=new Set()){let rejected=false,first;if(cleanup&&skip.has(cleanup)){rejected=true;first=new EngineError('BUSY','Plot display worker retirement remains pending.');}else try{await closeWorkers();}catch(primary){rejected=true;first=primary;}if(rejected)throw withRetirementOwner(first,wrapper,first);for(const [key,value]of [['previous',previous],['owned',owned],['prefixStore',prefixStore]]){if(!value)continue;if(skip.has(value)){rejected=true;first??=new EngineError('BUSY','Plot display prefix retirement remains pending.');continue;}try{ack(await value.dispose());if(key==='previous')previous=null;else if(key==='owned')owned=null;else prefixStore=null;}catch(primary){refused.add(value);rejected=true;first??=primary;}}if(rejected)throw withRetirementOwner(first,wrapper,first);current=source;}
 async function open(signal){if(opening)return opening;check(signal);const task=(async()=>{
  if(scale===0)return;
  const room=budget.limit-budget.retained-budget.active,block=Math.min(blockPixels,Math.floor((room-12*1024**2-d.width*64)/128));if(block<d.width)throw new EngineError('MEMORY_LIMIT','The canonical plot pyrDown row does not fit.');workspace=budget.reserve(Math.max(8*1024**2,plotsStreamHeapBytes())+block*128+d.width*64);
  pool=new WaveletStripPool(budget,{...profile,workerHeapBytes:8*1024**2,workerPixelBytes:128,workerURL:new URL('./plots-strip-worker.js',import.meta.url),workerFactory:globalThis.Worker?()=>new Worker(new URL('./plots-strip-worker.js',import.meta.url),{type:'module'}):null});cleanup=pool.ownCleanup(()=>{});
  const options={budget,signal,storage:storage==='auto'&&getTemporarySession?'temporary':storage,temporarySession,getTemporarySession};
  for(let level=0;level<scale;level++){
   check(signal);const {width,height}=current.descriptor,w=Math.ceil(width/2),h=Math.ceil(height/2),rows=Math.max(1,Math.floor(block/(2*width)));
   prefixStore=await createSegmentedBytes(w*h*3,options);check(signal);const store=prefixStore,next=createRgbSurface(store,{width:w,height:h,budget});stores.set(next,store);prefixStore=null;previous=owned;owned=next;
   await pool.run({count:Math.ceil(h/rows),pixels:Math.min(height,2*rows+4)*width,key:`plots/pyr/${width}/${rows}`,signal,prepareBytes:width*(rows+1)*3,
    prepare:async i=>{const first=i*rows,n=Math.min(rows,h-first),top=Math.max(0,first*2-2),end=Math.min(height,2*(first+n-1)+3),part=await current.readWindow({x:0,y:top,width,height:end-top},{signal});try{check(signal);return{op:'pyrdown',rgb:part.pixels.data,width,height,top,first,rows:n};}finally{await part.release();}},
    local:async job=>(await plotsStreamMath()).run(job),consume:async(result,i)=>{check(signal);await nextStore(next).write(new Uint8Array(result.values.buffer,result.values.byteOffset,result.values.byteLength),i*rows*w*3);}});
   await nextStore(next).flush();check(signal);if(previous){try{ack(await previous.dispose());previous=null;}catch(primary){refused.add(previous);throw primary;}}current=next;
  }
  await closeWorkers();check(signal);
 })().catch(async primary=>{try{await retirePrefix(refused);}catch(cleanupError){throw withRetirementOwner(primary,wrapper,cleanupError);}opening=null;throw primary;});opening=task;return task;}
 // A store is adopted before surface construction; its reference follows that
 // exact surface, including a refused retirement, rather than a global cache.
 const stores=new WeakMap();function nextStore(surface){return stores.get(surface);}
 async function releaseBase(base){base.data=null;await base.release();basePages.delete(base);}
 async function colorPage(length){
  const p={data:null,credit:null,backing:null,windows:new Set(),published:false,flight:null,base:null};pages.add(p);
  p.release=()=>{p.published=false;if(p.flight)return p.flight;const task=Promise.resolve().then(async()=>{for(const part of [...p.windows]){ack(await part.release());p.windows.delete(part);}p.data=null;if(p.backing){const bytes=p.backing();p.backing=null;if(bytes!==0)budget.notifyBackingRelease?.('array-buffer',bytes);}if(p.credit){p.credit();p.credit=null;}if(p.base){p.base.data=null;await p.base.release();p.base=null;}pages.delete(p);}).catch(primary=>{throw withRetirementOwner(primary,wrapper,primary);});p.flight=task;void task.finally(()=>{if(p.flight===task)p.flight=null;}).catch(()=>{});return task;};
  try{p.credit=budget.reserve(length*3);p.data=allocateTypedArray(Uint8Array,length*3,{label:'plot-canonical-display-sidecar'});p.backing=budget.registerBacking?.('array-buffer',p.data.byteLength,{owner:'plot-display-colors',label:'bounded-display-page',identity:p.data.buffer});return p;}catch(primary){try{await p.release();}catch(cleanupError){throw withRetirementOwner(primary,wrapper,cleanupError);}throw primary;}
 }
 async function colors(offset,length,signal){await open(signal);check(signal);const p=await colorPage(length);let retirementRefused=false;try{
  const width=t.gridWidth;let at=0;
  while(at<length){check(signal);const ordinal=offset+at,x=ordinal%width,y=Math.floor(ordinal/width),remaining=length-at,w=Math.min(width-x,remaining),h=x===0&&w===width?Math.max(1,Math.floor(remaining/width)):1;const part=await current.readWindow({x,y,width:w,height:h},{signal});p.windows.add(part);check(signal);requireValue(part.pixels?.format==='rgb8'&&part.pixels.data instanceof Uint8Array&&part.pixels.data.length===w*h*3,'Canonical plot palette window differs.');p.data.set(part.pixels.data,at*3);try{ack(await part.release());p.windows.delete(part);}catch(primary){retirementRefused=true;throw primary;}at+=w*h;
  }return p;
 }catch(primary){if(retirementRefused)throw withRetirementOwner(primary,wrapper,primary);try{await p.release();}catch(cleanupError){throw withRetirementOwner(primary,wrapper,cleanupError);}throw primary;}}
 const wrapper={descriptor,
  readRows(request={},hooks={}){const task=(async()=>{check(hooks.signal);if(request.displayColors!==true)return table.readRows(request,hooks);let base,side;try{base=await table.readRows(request,hooks);basePages.add(base);check(hooks.signal);side=await colors(base.offset,base.length,hooks.signal);side.base=base;basePages.delete(base);const baseAnswer=base;base=null;check(hooks.signal);side.published=true;const answer={...baseAnswer,displayColors:side.data,displayColorSource:descriptor.presentationColors,release(){answer.data=answer.displayColors=null;return side.release();}};return answer;}catch(primary){if(side)try{await side.release();}catch(cleanupError){throw withRetirementOwner(primary,wrapper,cleanupError);}if(base){try{await releaseBase(base);base=null;}catch(cleanupError){throw withRetirementOwner(primary,wrapper,cleanupError);}}throw primary;}})();pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;},
  readCsv:(request,hooks)=>table.readCsv(request,hooks),
  dispose(){if(closed)return Promise.resolve();if(disposal)return disposal;closing=true;const task=Promise.resolve().then(async()=>{
   await Promise.allSettled([...pending,...(opening?[opening]:[])]);if([...pages].some(p=>p.published))throw new EngineError('BUSY','Plot palette still has a published page.');for(const p of [...pages])await p.release();for(const base of [...basePages])await releaseBase(base);
   if(!tableClosed){ack(await table.dispose());tableClosed=true;}await retirePrefix();source=current=null;closed=true;
  }).catch(primary=>{throw withRetirementOwner(primary,wrapper,primary);});disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;}
 };return wrapper;
}
