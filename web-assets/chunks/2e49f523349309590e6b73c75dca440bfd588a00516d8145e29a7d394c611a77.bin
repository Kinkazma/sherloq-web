import "../../runtime-context.js?v=0.33.3";
import {magnifierParams,magnifierRegion,magnifierLayout,magnifierLuts,magnifierMetadataBytes} from './magnifier.js';
import {equalizationPlan} from './equalization-settings.js';
import {displayGeometry} from './display-sampling.js';
import {allocateTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {gray,roundEven} from './pixel-utils.js';

const BLOCK_PIXELS=262144;
function parameters(input){const e=Object.hasOwn(input??{},'equalization')?equalizationPlan('inspection.magnifier',input):null;if(e?.post)throw new EngineError('UNSUPPORTED_PRECISION','Compose additional equalizers outside the prepared base magnifier.');return magnifierParams(e?.base??input);}
const ack=async action=>{const value=await action();if(value===false||value===0)throw new EngineError('BUSY','Prepared magnifier resource retirement was not acknowledged.');return value;};
function cacheIdentity(d,bounds,binding,prefix){return prefix?prefix+'prepared-magnifier-hist/1/'+JSON.stringify([d.id,d.revision,d.format,binding?.sourceSha256??null,bounds]):null;}
function metadata(d,p,binding){return{color:d.color??null,provenance:d.provenance??null,parameters:p,sourceBinding:binding??null,sourceSurfaceId:d.id,sourceRevision:d.revision};}
function basePlan(d,input,{sourceBinding,blockPixels=BLOCK_PIXELS}={}){
 requireValue(d&&['rgb8','rgb16'].includes(d.format)&&Number.isSafeInteger(d.width*d.height*6)&&d.width>0&&d.height>0&&Number.isSafeInteger(blockPixels)&&blockPixels>0,'A typed RGB magnifier source and bounded block are required.');
 const p=parameters(input),layout=magnifierLayout(d),region=magnifierRegion(d,p),n=region.width*region.height,tables=p.mode==='equalize'||p.mode==='identity'||p.channel?3:1;
 const metadataBytes=n?magnifierMetadataBytes({color:metadata(d,p,sourceBinding),provenance:null}):0,lutBytes=n?tables*layout.bins*layout.sampleBytes:0,histogramBytes=n&&p.mode!=='identity'?layout.histogramBytes:0,blockWidth=Math.min(region.width,blockPixels),rows=n?Math.min(region.height,Math.max(1,Math.floor(blockPixels/blockWidth))):0;
 const sourceWindowBytes=blockWidth*rows*3*layout.sampleBytes,sourceRowScratchBytes=n&&!((d.orientation??1)===1&&region.bounds[0]===0&&blockWidth===(d.sourceWidth??d.width))?((d.orientation??1)>=5?rows:blockWidth)*3*layout.sampleBytes:0;
 return{p,layout,...region,observations:n,blockPixels,blockWidth,rows,metadataBytes,lutBytes,histogramBytes,sourceWindowBytes,sourceRowScratchBytes,retainedBytes:metadataBytes+lutBytes};
}
export function preparedMagnifierPlan(d,input,options={}){
 const p=basePlan(d,input,options),key=cacheIdentity(d,p.bounds,options.sourceBinding,options.cacheKey),hit=!!(p.histogramBytes&&key&&options.budget?.cache?.get(key)?.value?.schema==='prepared-magnifier-hist/1'),protectedHistogramBytes=hit?p.histogramBytes:0;
 const coldWorkspace=p.histogramBytes?Math.max(p.histogramBytes+p.sourceWindowBytes+p.sourceRowScratchBytes,key?2*p.histogramBytes:0):0,additionalPreparationBytes=p.retainedBytes+(hit?0:coldWorkspace),preparationBytes=additionalPreparationBytes+protectedHistogramBytes;
 return{known:true,inputDepth:p.layout.depth,format:d.format,bounds:p.bounds,width:p.width,height:p.height,observations:p.observations,blockPixels:p.blockPixels,blockWidth:p.blockWidth,rows:p.rows,metadataBytes:p.metadataBytes,lutBytes:p.lutBytes,histogramBytes:p.histogramBytes,protectedHistogramBytes,retainedBytes:p.retainedBytes,additionalPreparationBytes,preparationBytes,sourceWindowBytes:p.histogramBytes&&!hit?p.sourceWindowBytes:0,sourceRowScratchBytes:p.histogramBytes&&!hit?p.sourceRowScratchBytes:0,outputBytes:0,prepared:true};
}
export function preparedMagnifierReadPlan(d,input,request={},options={}){
 const p=basePlan(d,input,options),pixelBytes=3*p.layout.sampleBytes,orientation=d.orientation??1,hasSampler=!!(p.layout.native?options.nativeSampler:options.sampler);let pixels,sourceLoanPixels,scratchPixels;
 if(request.maximumPixels!==undefined){
  requireValue(Number.isSafeInteger(request.maximumPixels)&&request.maximumPixels>0,'A maximum read population is required.');pixels=Math.min(p.observations,request.maximumPixels);
  sourceLoanPixels=hasSampler?Math.min(p.blockPixels,pixels):Math.max(Math.min(p.blockPixels,pixels),pixels>1?p.width:pixels);
  scratchPixels=hasSampler?(pixels>1?(orientation>=5?p.height:p.width):pixels):orientation>=5?Math.min(p.height,pixels):pixels>1?p.width:pixels;
 }else{
  const rect=request.rect??{x:0,y:0,width:p.width,height:p.height},g=request.tile?displayGeometry({width:p.width,height:p.height},request.tile):{x:rect.x??0,y:rect.y??0,w:rect.width??p.width,h:rect.height??p.height,width:rect.width??p.width,height:rect.height??p.height,step:1};
  requireValue([g.x,g.y,g.w,g.h].every(Number.isSafeInteger)&&g.x>=0&&g.y>=0&&g.w>0&&g.h>0&&g.x<=p.width-g.w&&g.y<=p.height-g.h,'Prepared read is outside the ROI.');pixels=g.width*g.height;
  const cols=Math.min(g.width,p.blockPixels),rows=Math.min(g.height,Math.max(1,Math.floor(p.blockPixels/cols))),span=(cols-1)*g.step+1;
  if(g.step===1&&options.readWindowInto&&!request.into){sourceLoanPixels=0;scratchPixels=orientation===1&&p.bounds[0]+g.x===0&&g.w===(d.sourceWidth??d.width)?0:orientation>=5?g.h:g.w;}
  else{sourceLoanPixels=g.step>1&&!hasSampler?span:cols*rows;scratchPixels=g.step>1&&hasSampler?orientation>=5?(rows-1)*g.step+1:span:orientation>=5?rows:span;}
 }
 const nativeBytes=pixels*pixelBytes,outputBytes=request.into?0:nativeBytes,sourceLoanBytes=sourceLoanPixels*pixelBytes,sourceRowScratchBytes=scratchPixels*pixelBytes,displayBytes=request.display&&p.layout.native?pixels*3:0;
 return{pixels,outputBytes,sourceLoanBytes,sourceRowScratchBytes,displayBytes,retainedBytes:p.retainedBytes,additionalBytes:Math.max(outputBytes+sourceLoanBytes+sourceRowScratchBytes,outputBytes+displayBytes),prepared:true};
}
function freezeRecord(value,seen=new WeakSet()){if(value&&typeof value==='object'&&!seen.has(value)&&!ArrayBuffer.isView(value)){seen.add(value);for(const item of Object.values(value))freezeRecord(item,seen);Object.freeze(value);}return value;}

function owned(Type,length,budget,label){
 const bytes=length*Type.BYTES_PER_ELEMENT,fee=budget.reserve(bytes);let data,backing,closed=false;
 try{data=allocateTypedArray(Type,length,{label});backing=budget.registerBacking?.('array-buffer',bytes,{owner:'prepared-magnifier',label,identity:data.buffer});}catch(error){fee();throw error;}
 return{data,release(){if(closed)return;const retired=backing?.();if(retired===false)throw new EngineError('BUSY','Prepared buffer backing is still borrowed.');backing=null;fee();data=null;closed=true;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??bytes);}};
}
// Separate arithmetic feedback by storage type; one unchanged CDF/LUT recipe.
function histogram8(v,h){const r=h[0],g=h[1],b=h[2],l=h[3];for(let i=0;i<v.length;i+=3){const a=v[i],c=v[i+1],d=v[i+2];r[a]++;g[c]++;b[d]++;l[gray(a,c,d)]++;}}
function histogram16(v,h){const r=h[0],g=h[1],b=h[2],l=h[3];for(let i=0;i<v.length;i+=3){const a=v[i],c=v[i+1],d=v[i+2];r[a]++;g[c]++;b[d]++;l[gray(a,c,d)]++;}}
function map8(v,luts){const a=luts[0],b=luts[1],c=luts[2];for(let i=0;i<v.length;i+=3){v[i]=a[v[i]];v[i+1]=b[v[i+1]];v[i+2]=c[v[i+2]];}}
function map16(v,luts){const a=luts[0],b=luts[1],c=luts[2];for(let i=0;i<v.length;i+=3){v[i]=a[v[i]];v[i+1]=b[v[i+1]];v[i+2]=c[v[i+2]];}}

/** One immutable complete-ROI mapping program, not a materialized image.
 * Source loans end before any frame is published. Returned frame releases are
 * synchronous and own only their copied destination, never Original. */
export async function prepareMagnifierSurface({surface:source},input,{budget,signal,onProgress,cacheKey,sourceBinding,isSourceCurrent,displayTransform,blockPixels=BLOCK_PIXELS}={}){
 const d=source?.descriptor,initial=basePlan(d,input,{sourceBinding,blockPixels}),p=initial.p,layout=initial.layout,{Type}=layout,{bounds,width,height,observations:n}=initial,[left,top]=bounds;
 requireValue(budget?.reserve&&typeof source.readWindow==='function'&&typeof isSourceCurrent==='function'&&sourceBinding&&/^[a-f0-9]{64}$/.test(sourceBinding.sourceSha256??''),'Prepared magnifier needs its real Original binding and budget.');
 const expectedId=layout.native?sourceBinding.nativeSurfaceId??sourceBinding.sourceSurfaceId:sourceBinding.sourceSurfaceId,expectedRevision=layout.native?sourceBinding.nativeRevision??sourceBinding.sourceRevision:sourceBinding.sourceRevision;
 requireValue(d.id===expectedId&&d.revision===expectedRevision,'Prepared input differs from its captured Original.');
 const binding=Object.freeze({...sourceBinding}),stop=new AbortController(),pending=new Set(),debts=new Set(),deferredOutputs=new Set(),backings=[];let closing=false,closed=false,flight,debtFlight,luts,meta,metaFee,lutFee,histFee,hist,cacheLoan;
 const stats={backend:'cpu',workers:n?1:0,inputDepth:layout.depth,outputDepth:layout.depth,preparedMagnifier:true,sourceReads:0,sourcePixelsRead:0,windowReads:0,sampledReads:0,mappedPixels:0,analysisCacheHit:false,retainedResultBytes:initial.retainedBytes,outputStorageBytes:0};
 const current=s=>{checkAbort(s);if(closing||closed)throw new EngineError('DISPOSED','Prepared magnifier is closing.');if(source.descriptor.id!==d.id||source.descriptor.revision!==d.revision||isSourceCurrent(binding)!==true)throw new EngineError('SOURCE_CHANGED','Prepared magnifier Original binding changed.');if(debts.size)throw withRetirementOwner(new EngineError('BUSY','A previous Source loan must retire before another read.'),retirementOwner);};
 const linked=s=>s?AbortSignal.any([s,stop.signal]):stop.signal;
 function track(task){pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;}
 async function releasePart(part,primary){try{await retireCompositeOwners([()=>ack(()=>part.release())],{requireAck:true});}catch(error){const owner=error.cleanupOwner;if(owner)debts.add(owner);throw withRetirementOwner(primary??error,retirementOwner,error);}}
 async function retireDebts(){if(debtFlight)return debtFlight;const task=(async()=>{while(debts.size)for(const owner of [...debts]){await ack(()=>owner.dispose());debts.delete(owner);}for(const owner of [...deferredOutputs]){owner.release();deferredOutputs.delete(owner);}})();debtFlight=task;void task.finally(()=>{if(debtFlight===task)debtFlight=null;}).catch(()=>{});try{return await task;}catch(error){throw withRetirementOwner(error,retirementOwner,error);}}
 const retirementOwner={dispose:retireDebts};
 function releaseOutput(owner,error){if(error?.cleanupOwner===retirementOwner&&debts.size)deferredOutputs.add(owner);else owner.release();}
 async function restoreHistogram(){if(!cacheLoan)return;const loan=cacheLoan;const restored=loan.restore();if(restored===false||restored===0)throw new EngineError('BUSY','Histogram cache transfer is not acknowledged.');cacheLoan=null;}
 async function dispose(){
  if(closed)return;if(flight)return flight;closing=true;stop.abort();
  const task=(async()=>{await Promise.allSettled([...pending]);await retireDebts();await restoreHistogram();
   for(const row of [...backings]){const retired=row.release?.();if(retired===false)throw new EngineError('BUSY','Prepared LUT backing retirement was not acknowledged.');backings.splice(backings.indexOf(row),1);if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??row.bytes);}
   lutFee?.();lutFee=null;histFee?.();histFee=null;metaFee?.();metaFee=null;luts=hist=meta=null;closed=true;})();flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});try{return await task;}catch(error){throw withRetirementOwner(error,api,error);}
 }
 const api={dispose};
 if(!n){current(signal);return{data:{bounds,empty:true},metrics:stats,dispose};}
 const cooperator=createCooperator(signal),key=cacheIdentity(d,bounds,binding,cacheKey);let prepared=false;
 try{
  current(signal);if(initial.histogramBytes&&key){const hit=budget.cache?.get(key);if(hit?.value?.schema==='prepared-magnifier-hist/1'&&hit.value.count===n){cacheLoan=budget.borrowCacheEntry(key);hist=cacheLoan.entry.value.hist;stats.analysisCacheHit=true;}}
  metaFee=budget.reserve(initial.metadataBytes);meta=freezeRecord(structuredClone(metadata(d,p,binding)));
  if(initial.histogramBytes){
   if(!hist){histFee=budget.reserve(initial.histogramBytes);hist=Array.from({length:4},()=>allocateTypedArray(Uint32Array,layout.bins,{label:'prepared-magnifier-histogram'}));
    for(let y=0;y<height;y+=initial.rows)for(let x=0;x<width;x+=initial.blockWidth){await cooperator();current(signal);const w=Math.min(initial.blockWidth,width-x),h=Math.min(initial.rows,height-y),part=await source.readWindow({x:left+x,y:top+y,width:w,height:h},{signal});let primary;
     try{current(signal);const v=part.pixels.data;requireValue(v instanceof Type&&v.length===w*h*3,'Original returned another sample representation.');(layout.native?histogram16:histogram8)(v,hist);stats.sourceReads++;stats.sourcePixelsRead+=w*h;}catch(error){primary=error;throw error;}finally{await releasePart(part,primary);}onProgress?.({phase:'magnifier-histogram',fraction:(y+h)/height});
    }
   }
  }
  current(signal);lutFee=budget.reserve(initial.lutBytes);luts=magnifierLuts(hist??[],n,p,layout);for(const buffer of new Set(luts.map(lut=>lut.buffer))){const bytes=buffer.byteLength;backings.push({bytes,release:budget.registerBacking?.('array-buffer',bytes,{owner:'prepared-magnifier',label:'immutable-magnifier-lut',identity:buffer})});}
  if(cacheLoan)await restoreHistogram();else if(hist&&key){budget.put(key,{value:{schema:'prepared-magnifier-hist/1',count:n,hist},byteLength:initial.histogramBytes},[binding.imageId]);}hist=null;histFee?.();histFee=null;current(signal);
  const id=crypto.randomUUID(),descriptor=Object.freeze({id,revision:1,width,height,format:d.format,depth:layout.depth,sourceDepth:d.sourceDepth??layout.depth,channels:3,channelOrder:'RGB',range:Object.freeze([0,layout.maximum]),byteOrder:layout.native?'little-endian':undefined,sourceWidth:width,sourceHeight:height,orientation:1,coordinates:'full-resolution',storage:'derived-readonly',color:meta.color,provenance:meta.provenance,preparedMagnifier:true});
  const map=layout.native?map16:map8;
  function rectGeometry(rect={}){const x=rect.x??0,y=rect.y??0,w=rect.width??width,h=rect.height??height;requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h,'Prepared window is outside its ROI.');return{x,y,w,h};}
  const pixels=(data,w,h)=>({width:w,height:h,format:d.format,depth:layout.depth,sourceDepth:d.sourceDepth??layout.depth,channels:3,range:[0,layout.maximum],color:meta.color,data});
  async function fillRect(g,out,s,externalInto=false,readMetrics={sourceBytes:0}){
   current(s);if(typeof source.readWindowInto==='function'&&!externalInto){
    const part=await source.readWindowInto({x:left+g.x,y:top+g.y,width:g.w,height:g.h},out,{signal:s});let primary;
    try{current(s);requireValue(part.pixels?.data instanceof Type&&part.pixels.data.length===out.length&&part.pixels.data.buffer===out.buffer&&part.pixels.data.byteOffset===out.byteOffset,'Original Into reader did not fill the owned destination.');map(out,luts);stats.sourceReads++;stats.sourcePixelsRead+=g.w*g.h;readMetrics.sourceBytes+=part.metrics?.sourceBytes??g.w*g.h*3*layout.sampleBytes;}catch(error){primary=error;throw error;}finally{await releasePart(part,primary);}return;
   }
   const cols=Math.min(g.w,blockPixels),rows=Math.max(1,Math.floor(blockPixels/cols));for(let y=0;y<g.h;y+=rows)for(let x=0;x<g.w;x+=cols){current(s);const w=Math.min(cols,g.w-x),h=Math.min(rows,g.h-y),part=await source.readWindow({x:left+g.x+x,y:top+g.y+y,width:w,height:h},{signal:s});let primary;
    try{current(s);const v=part.pixels.data;requireValue(v instanceof Type&&v.length===w*h*3,'Original changed its exact sample format.');for(let row=0;row<h;row++){const at=((y+row)*g.w+x)*3,target=out.subarray(at,at+w*3);target.set(v.subarray(row*w*3,(row+1)*w*3));map(target,luts);}stats.sourceReads++;stats.sourcePixelsRead+=w*h;readMetrics.sourceBytes+=part.metrics?.sourceBytes??w*h*3*layout.sampleBytes;}catch(error){primary=error;throw error;}finally{await releasePart(part,primary);}
   }
  }
  const frame=(data,g,release,readMetrics)=>({surfaceId:id,revision:1,origin:[g.x,g.y],pixels:pixels(data,g.w,g.h),release,metrics:readMetrics});
  const resultSurface={descriptor,
   readWindow(rect={},options={}){return track((async()=>{const s=linked(options.signal);current(s);const g=rectGeometry(rect),owner=owned(Type,g.w*g.h*3,budget,'prepared-window'),readMetrics={sourceBytes:0};try{await fillRect(g,owner.data,s,false,readMetrics);current(s);stats.windowReads++;stats.mappedPixels+=g.w*g.h;return frame(owner.data,g,owner.release,readMetrics);}catch(error){releaseOutput(owner,error);throw error;}})());},
   readWindowInto(rect,target,options={}){return track((async()=>{const s=linked(options.signal);current(s);const g=rectGeometry(rect);requireValue(target instanceof Type&&target.length>=g.w*g.h*3,'Prepared Into destination has the wrong sample type or extent.');const out=target.subarray(0,g.w*g.h*3),readMetrics={sourceBytes:0};await fillRect(g,out,s,true,readMetrics);current(s);stats.windowReads++;stats.mappedPixels+=g.w*g.h;return frame(out,g,()=>{},readMetrics);})());},
   readNativeSampledWindow(tile,options={}){return track((async()=>{const s=linked(options.signal);current(s);const g=displayGeometry(descriptor,tile),owner=owned(Type,g.width*g.height*3,budget,'prepared-native-sample'),readMetrics={sourceBytes:0};try{
    if(g.step===1)await fillRect({x:g.x,y:g.y,w:g.width,h:g.height},owner.data,s,false,readMetrics);
    else{const sampler=layout.native?source.readNativeSampledWindow:source.readSampledWindow,cols=Math.min(g.width,blockPixels),rows=Math.max(1,Math.floor(blockPixels/cols));for(let y=0;y<g.height;y+=rows)for(let x=0;x<g.width;x+=cols){current(s);const w=Math.min(cols,g.width-x),h=Math.min(rows,g.height-y);
     if(sampler){const part=await sampler.call(source,{x:left+g.x+x*g.step,y:top+g.y+y*g.step,w:(w-1)*g.step+1,h:(h-1)*g.step+1,step:g.step},{signal:s});let primary;
      try{current(s);const v=part.pixels.data;requireValue(v instanceof Type&&v.length===w*h*3,'Exact Source sampling returned another type.');for(let row=0;row<h;row++){const at=((y+row)*g.width+x)*3,target=owner.data.subarray(at,at+w*3);target.set(v.subarray(row*w*3,(row+1)*w*3));map(target,luts);}stats.sourceReads++;stats.sourcePixelsRead+=w*h;readMetrics.sourceBytes+=part.metrics?.sourceBytes??w*h*3*layout.sampleBytes;}catch(error){primary=error;throw error;}finally{await releasePart(part,primary);}
     }else for(let row=0;row<h;row++){const span=(w-1)*g.step+1,part=await source.readWindow({x:left+g.x+x*g.step,y:top+g.y+(y+row)*g.step,width:span,height:1},{signal:s});let primary;try{current(s);const v=part.pixels.data;requireValue(v instanceof Type&&v.length===span*3,'Original sampling fallback changed its exact type.');const target=owner.data.subarray(((y+row)*g.width+x)*3,((y+row)*g.width+x+w)*3);for(let col=0;col<w;col++)for(let c=0;c<3;c++)target[col*3+c]=v[col*g.step*3+c];map(target,luts);stats.sourceReads++;stats.sourcePixelsRead+=span;readMetrics.sourceBytes+=part.metrics?.sourceBytes??span*3*layout.sampleBytes;}catch(error){primary=error;throw error;}finally{await releasePart(part,primary);}}
    }}current(s);stats.sampledReads++;stats.mappedPixels+=g.width*g.height;return{surfaceId:id,revision:1,origin:[g.x,g.y],samplingStep:g.step,logicalRect:{x:g.x,y:g.y,width:g.w,height:g.h},pixels:pixels(owner.data,g.width,g.height),release:owner.release,metrics:{...readMetrics,nativePrecision:layout.depth}};
   }catch(error){releaseOutput(owner,error);throw error;}})());},
   readSampledWindow(tile,options={}){if(!layout.native)return resultSurface.readNativeSampledWindow(tile,options);return track((async()=>{const s=linked(options.signal);let native,output;try{native=await resultSurface.readNativeSampledWindow(tile,{signal:s});output=owned(Uint8Array,native.pixels.data.length,budget,'prepared-display-sample');if(displayTransform)await displayTransform(native.pixels,output.data,{...options,signal:s,budget});else{const color=meta.color;if(String(color?.primaries).toLowerCase()!=='srgb'||!['srgb','iec61966-2-1'].includes(String(color?.transfer).toLowerCase()))throw new EngineError('COLOR_TRANSFORM_REQUIRED','Prepared native16 presentation requires its captured color converter.');for(let i=0;i<output.data.length;i++)output.data[i]=roundEven(native.pixels.data[i]/257);}current(s);return{pixels:{width:native.pixels.width,height:native.pixels.height,format:'rgb8',data:output.data},release:output.release,metrics:{sourceBytes:native.metrics?.sourceBytes??0,presentationPrecision:8,nativePrecision:16}};}catch(error){output?.release();throw error;}finally{native?.release();}})());},
   dispose};
  Object.assign(api,resultSurface);prepared=true;return{surface:api,data:{bounds,empty:false},metrics:stats,semantics:'Immutable complete-region magnifier LUT; exact owned windows mapped lazily from the unchanged Original.',dispose};
 }catch(error){try{await dispose();}catch(cleanup){throw withRetirementOwner(error,api,cleanup);}throw error;}finally{if(!prepared)hist=null;}
}
