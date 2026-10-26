import "../../runtime-context.js?v=0.25.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {fetchM3Asset} from './m3-asset.js';
import {RESEARCH_POST_WASM} from './research-post-assets.js';
import {cachedPreviewGeometry,reservePreview,sampleCachedSource,previewUnavailable} from './cached-parameter-preview.js';
import {renderResearch} from './research-view.js';
const MiB=1024**2,HEAP_BYTES=32*MiB;
/** Native proposal features are immutable. Draft clustering uses a declared
 * deterministic subset; no encoder/decoder, model load or native-map mutation. */
export function createSafireParameterPreview(budget,{moduleFactory}={}){
 let module,loading,running=false,closed=false,heapOwned=false;
 const drop=()=>{if(running||loading)return;module=null;if(heapOwned){heapOwned=false;budget.retained-=HEAP_BYTES;}};
 const unregister=budget.registerReclaimer?.(drop,{allocationKind:'wasm',label:'idle-safire-preview'});
 async function ready(signal){
  if(module)return {module,cold:false,setupMs:0};const start=performance.now();
  if(!loading){const release=reservePreview(budget,HEAP_BYTES);loading=(async()=>{try{const create=moduleFactory??(await import('../vendor/research-post/post.js')).default,wasmBinary=moduleFactory?undefined:await fetchM3Asset(new URL('../vendor/research-post/post.wasm',import.meta.url),RESEARCH_POST_WASM,signal),m=await create({wasmBinary,wasmMemory:allocateWasmMemory({initial:256,maximum:HEAP_BYTES/65536})});checkAbort(signal);requireValue(m.HEAPU8.byteLength<=HEAP_BYTES,'SAFIRE draft heap exceeded admission.');if(closed)throw new EngineError('DISPOSED','SAFIRE draft disposed.');release();budget.retain(HEAP_BYTES);heapOwned=true;module=m;return m;}finally{release();}})().finally(()=>{loading=null;});}
  const m=await loading;checkAbort(signal);return {module:m,cold:true,setupMs:performance.now()-start};
 }
 return {
  async render(image,proposals,params,view={},preview={}, {signal}={}){
   checkAbort(signal);if(closed)throw new EngineError('DISPOSED','SAFIRE draft disposed.');requireValue(!running,'SAFIRE draft is busy.');
   const n=proposals?.confidence?.length;if(!n)previewUnavailable('Native SAFIRE proposals are not retained.');
   requireValue(n<=1024&&proposals.features instanceof Float32Array&&proposals.features.length===n*256&&proposals.lowMasks instanceof Float32Array&&proposals.lowMasks.length===n*65536&&proposals.areas?.length===n,'Invalid retained SAFIRE proposals.');
   if(preview.maxWorkingBytes!==undefined&&preview.maxWorkingBytes<HEAP_BYTES+MiB)throw new EngineError('MEMORY_LIMIT','The SAFIRE draft budget cannot admit its bounded postprocessing heap.');checkAbort(signal);running=true;let release;const allocated=[];
   try{
    const {module:m,cold,setupMs}=await ready(signal),descriptor=image.surface?.descriptor??image.pixels,g=cachedPreviewGeometry(descriptor.width,descriptor.height,{...preview,maxWorkingBytes:(preview.maxWorkingBytes??128*MiB)-HEAP_BYTES},budget,{bytesPerPixel:96,fixedBytes:Math.max(4*MiB,Math.max(descriptor.width,descriptor.height)*32)});release=reservePreview(budget,g.reservedBytes);
    const count=Math.min(n,Math.max(params.binary?2:params.groups,Math.min(1024,g.width>g.height?g.width:g.height))),ids=Int32Array.from({length:count},(_,i)=>Math.min(n-1,Math.floor((i+.5)*n/count))),features=new Float32Array(count*256);
    for(let i=0;i<count;i++)features.set(proposals.features.subarray(ids[i]*256,(ids[i]+1)*256),i*256);
    const alloc=bytes=>{const p=m._malloc(Math.max(8,bytes));if(!p)throw wasmAllocationFailure(m,'SAFIRE draft clustering allocation failed.',bytes);allocated.push(p);return p;},fp=alloc(features.byteLength),lp=alloc(count*4);m.HEAPF32.set(features,fp/4);
    const minimum=Math.max(1,Math.round(params.minimum*count/n));checkAbort(signal);const iterations=params.kind==='kmeans'?m._safire_kmeans(fp,count,params.binary?2:params.groups,lp):m._safire_dbscan(fp,count,params.eps,minimum,lp);checkAbort(signal);
    if(params.kind==='kmeans'&&!iterations)previewUnavailable('The sampled SAFIRE grouping did not converge.');const assignments=m.HEAP32.slice(lp/4,lp/4+count),best=new Map();
    for(let i=0;i<count;i++){const label=assignments[i],id=ids[i];if(label>=0&&(!best.has(label)||proposals.confidence[id]>proposals.confidence[best.get(label)]))best.set(label,id);}
    const chosen=[...best.values()].sort((a,b)=>a-b);if(!chosen.length)previewUnavailable('The sampled SAFIRE grouping has no supported source region.');if(chosen.length>64)previewUnavailable('The sampled SAFIRE grouping exceeds64 supported source groups.');
    const map=new Float32Array(g.pixels),labels=new Uint8Array(g.pixels),front=chosen.length>1&&proposals.areas[chosen[0]]>proposals.areas[chosen[1]]?1:0,back=1-front,logits=new Float64Array(chosen.length);
    const maskValue=(id,x,y)=>{const sx=Math.max(0,.25*(x+.5)-.5),sy=Math.max(0,.25*(y+.5)-.5),x0=Math.min(255,Math.floor(sx)),x1=Math.min(255,x0+1),y0=Math.min(255,Math.floor(sy)),y1=Math.min(255,y0+1),lx=sx-x0,ly=sy-y0,at=id*65536,a=proposals.lowMasks[at+y0*256+x0]*(1-lx)+proposals.lowMasks[at+y0*256+x1]*lx,b=proposals.lowMasks[at+y1*256+x0]*(1-lx)+proposals.lowMasks[at+y1*256+x1]*lx;return a*(1-ly)+b*ly;};
    for(let y=0;y<g.height;y++){if(y%16===0)await controlCheckpoint(signal);const sy=Math.min(1023,Math.floor(y*g.step*1024/g.h));for(let x=0;x<g.width;x++){const sx=Math.min(1023,Math.floor(x*g.step*1024/g.w)),at=y*g.width+x;let maximum=-Infinity,bestLabel=0;for(let c=0;c<chosen.length;c++){const value=logits[c]=maskValue(chosen[c],sx,sy);if(value>maximum){maximum=value;bestLabel=c;}}let sum=0;for(let c=0;c<chosen.length;c++)sum+=Math.exp(logits[c]-maximum);labels[at]=bestLabel;map[at]=params.binary?(1/(1+Math.exp(-logits[front]))+(chosen.length>1?1-1/(1+Math.exp(-logits[back])):0))/(chosen.length>1?2:1):1/sum;}}
    const source=await sampleCachedSource(image,g,{signal}),answer=await renderResearch(source,{map,source_labels:labels,metadata:{method:'safire',binary:params.binary,sources:chosen.length,native_shape:[g.height,g.width]}},view,{signal,reserveMemory:()=>()=>{},includeLegend:false});checkAbort(signal);
    return{pixels:{...answer.pixels,logicalWidth:g.w,logicalHeight:g.h},exact:false,metrics:{cacheOnly:true,nativeAnalysisCalls:0,inferenceCalls:0,scientificFinalChanged:false,admittedPreviewBytes:g.bytes+HEAP_BYTES,sampleDimensions:[g.width,g.height],cold,setupMilliseconds:setupMs,sampledProposalCount:count,nativeProposalCount:n,clusteringIterations:params.kind==='kmeans'?iterations:null},preview:{provisional:true,approximation:'deterministic subset of retained native proposal features; sampled mask interpolation and provisional display only',sampledProposalCount:count,nativeProposalCount:n,subsetPromptIds:Array.from(ids,id=>proposals.validIds?.[id]??id),requestedMinimum:params.minimum,effectiveMinimum:minimum,requestedGroups:params.groups,chosenPromptIds:chosen.map(id=>proposals.validIds?.[id]??id),targetMs:200}};
   }finally{if(module)for(const p of allocated)module._free(p);release?.();running=false;if(closed)drop();}
  },
  async dispose(){closed=true;unregister?.();try{await loading;}catch{}drop();},
  get state(){return{running,loaded:!!module,retainedBytes:heapOwned?HEAP_BYTES:0};}
 };
}
