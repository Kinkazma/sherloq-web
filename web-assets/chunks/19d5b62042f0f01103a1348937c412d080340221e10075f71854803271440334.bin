import "../../runtime-context.js?v=0.25.0";
import {allocateOwnedTypedArray,allocateWasmMemory,wasmAllocationFailure} from './allocation.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {ssgResizeCoefficients} from './ssg-full-input.js';
import {requireValue,checkAbort,EngineError,controlCheckpoint} from './errors.js';

async function factory(options){const url=new URL(options.ssgShared?'../vendor/ssg-strict/localization-shared.mjs':'../vendor/ssg-strict/localization.mjs',import.meta.url);return(await import(url.href)).default({...options,mainScriptUrlOrBlob:globalThis.process?.versions?.node?decodeURIComponent(url.pathname):url.href});}
async function workspace(bytes,{budget,profile,signal,moduleFactory=factory},body){
 const maximum=Math.ceil((bytes+64*1024**2)/65536)*65536;if(!Number.isSafeInteger(maximum)||maximum>2*1024**3)throw new EngineError('MEMORY_LIMIT','SSG observed-support workspace exceeds its native wasm32 arena.',{details:{requestedBytes:maximum,allocationKind:'wasm'}});
 const shared=globalThis.crossOriginIsolated===true&&typeof SharedArrayBuffer==='function'&&profile.maxWorkers>1;let release,lease,runtime,primary,failed=false;const pointers=[];
 try{checkAbort(signal);release=budget.reserve(maximum);const memory=allocateWasmMemory({initial:512,maximum:maximum/65536,...(shared?{shared:true}:{})},{label:'SSG strict native global workspace'});runtime=await moduleFactory({wasmMemory:memory,maximumHeapBytes:maximum,ssgShared:shared,workerCount:shared?profile.maxWorkers-1:1});
  const allocate=bytes=>{if(!bytes)return 0;const p=runtime._malloc(bytes);if(!p)throw wasmAllocationFailure(runtime,'SSG strict native input allocation failed.',bytes);pointers.push(p);return p;},put=(array,Type)=>{const p=allocate(array.byteLength);if(p)new Type(runtime.HEAPU8.buffer,p,array.length).set(array);return p;},checked=(status,label)=>{if(status===-2)throw wasmAllocationFailure(runtime,'SSG '+label+' native allocation failed.');requireValue(status===0,'Invalid SSG '+label+' native status.');checkAbort(signal);};
  lease=await getExecutionScheduler(budget,{maxWorkers:profile.maxWorkers}).acquire({cpu:shared?profile.maxWorkers:1,signal,label:'ssg-strict-global-localization',resourceOwner:'ssg'});runtime._ssg_full_set_team(shared?profile.maxWorkers:1);checkAbort(signal);
  return await body({runtime,allocate,put,checked,maximum,heapBytes:memory.buffer.byteLength,cpuTeam:shared?profile.maxWorkers:1});
 }catch(error){failed=true;primary=error;throw error;}finally{const errors=[];for(const action of[...pointers.map(p=>()=>runtime?._free(p)),()=>runtime?._ssg_full_shutdown(),()=>lease?.release(),()=>release?.()])try{await action();}catch(error){errors.push(error);}if(errors.length){if(failed){if(primary&&typeof primary==='object'&&Object.isExtensible(primary))primary.ssgNativeCleanupErrors=errors;}else throw new AggregateError(errors,'SSG strict native workspace retirement failed.');}}
}
export async function ssgStrictSalience(fields,features,p,options){
 const{budget,signal}=options,count=features.count,owner=allocateOwnedTypedArray(Float64Array,count,{budget,owner:'ssg-strict-salience',label:'global native salience weights'});let success=false;
 try{if(!count){success=true;return{weights:owner.data,release:()=>owner.release()};}
  const radius=Math.ceil(3*Math.sqrt(1/(2*p.salienceSigma)));await workspace(fields.width*fields.height*48+features.points.byteLength+count*8+radius*32,options,async({runtime:m,allocate,put,checked})=>{const edge=put(fields.edgeMap,Float32Array),known=put(fields.edgeKnown,Uint8Array),points=put(features.points,Float64Array),out=allocate(count*8);checked(m._ssg_strict_salience(edge,known,points,count,fields.width,fields.height,p.salienceSigma,out),'observed Gaussian salience');owner.data.set(m.HEAPF64.subarray(out/8,out/8+count));});checkAbort(signal);success=true;return{weights:owner.data,release:()=>owner.release()};
 }finally{if(!success)owner.release();}
}
export async function ssgStrictLocalize(fields,features,pairs,groups,models,p,options){
 const{budget,signal,onProgress,domain}=options,n=fields.width*fields.height;let out,supportOut,candidateOwner,success=false,metadata;
 try{
  out=allocateOwnedTypedArray(Uint8Array,fields.originalWidth*fields.originalHeight,{budget,owner:'ssg-strict-mask',label:'Original-coordinate SSG mask'});supportOut=allocateOwnedTypedArray(Uint8Array,out.data.length,{budget,owner:'ssg-strict-support',label:'Original-coordinate direct SSIM support'});
  candidateOwner=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'ssg-strict-candidates',label:'native candidate domain in common grid'});let population=0;for(let y=0;y<fields.height;y++)for(let x=0;x<fields.width;x++){const rawX=Math.min(fields.originalWidth-1,Math.floor((x+.5)/fields.scaleX)),rawY=Math.min(fields.originalHeight-1,Math.floor((y+.5)/fields.scaleY)),id=y*fields.width+x;candidateOwner.data[id]=fields.known[id]&&(!domain||domain.containsOriginal(rawX+fields.origin[0],rawY+fields.origin[1]))?1:0;population+=candidateOwner.data[id];}
  const admitted=(x,y)=>!domain||domain.containsOriginal(x+fields.origin[0],y+fields.origin[1]),base={boundingPixels:n,admittedPixels:population,rgbContextPixels:fields.metadata.admittedPixels,minimumAreaFraction:p.minimumArea,effectiveMinimumArea:population*p.minimumArea,excludedPolicy:'unknown taps omitted upstream; exclusions bound components and hole filling',scriptParity:false};
  if(!groups.length)metadata={...base,empty:true,evaluationStatus:'no accepted native geometric model; no SSIM score claimed',directSsimPixels:0};
  else await workspace(n*220+features.points.byteLength+pairs.byteLength*3+Math.ceil(3*p.ssimRadius)*32,options,async({runtime:m,allocate,put,checked,maximum,heapBytes,cpuTeam})=>{
   const gray=put(fields.gray,Float64Array),known=put(fields.known,Uint8Array),candidates=put(candidateOwner.data,Uint8Array),blur=allocate(n*8),blurKnown=allocate(n),roi=allocate(n*8),points=put(features.points,Float64Array),matches=put(pairs,Uint32Array),matrix=allocate(48),support=allocate(Math.max(16,pairs.length*2*8)),mask=allocate(n),direct=allocate(n);let union,directUnion;
   try{
    union=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'ssg-strict-mask',label:'native common-grid mask union'});directUnion=allocateOwnedTypedArray(Uint8Array,n,{budget,owner:'ssg-strict-support',label:'native common-grid SSIM support union'});
    checked(m._ssg_strict_blur(gray,known,blur,blurKnown,fields.width,fields.height,7,2,0),'observed gray preprocessing');checked(m._ssg_full_roi(points,features.count,matches,pairs.length/2,fields.width,fields.height,p.salienceSigma,p.roiRadius,roi),'native counted ROI');
    requireValue(groups.length===models.length,'SSG groups/model ownership mismatch.');
    for(let j=0;j<groups.length;j++){await controlCheckpoint(signal);const matrixValue=models[j].matrix,flat=[matrixValue[0][0],matrixValue[0][1],matrixValue[0][2]+1-matrixValue[0][0]-matrixValue[0][1],matrixValue[1][0],matrixValue[1][1],matrixValue[1][2]+1-matrixValue[1][0]-matrixValue[1][1]],xy=[];for(const i of groups[j])for(const k of[0,1]){const at=pairs[i*2+k]*3;xy.push(features.points[at],features.points[at+1]);}requireValue(xy.length*8<=Math.max(16,pairs.length*2*8),'SSG support indices exceed their native input.');m.HEAPF64.set(flat,matrix/8);m.HEAPF64.set(xy,support/8);checked(m._ssg_strict_localize(blur,known,roi,matrix,support,xy.length/2,fields.width,fields.height,p.maskThreshold,p.minimumArea,p.ssimRadius,p.ssimOpening,mask,direct,candidates),'observed SSIM and native morphology');for(let i=0;i<n;i++){union.data[i]|=m.HEAPU8[mask+i];directUnion.data[i]|=m.HEAPU8[direct+i];}onProgress?.((j+1)/groups.length);}
    if(fields.width===fields.originalWidth&&fields.height===fields.originalHeight){out.data.set(union.data);supportOut.data.set(directUnion.data);}else{
     const free=budget.reserve((fields.originalWidth+fields.originalHeight)*768);try{const xs=ssgResizeCoefficients(fields.width,fields.originalWidth),ys=ssgResizeCoefficients(fields.height,fields.originalHeight);for(let y=0;y<fields.originalHeight;y++){await controlCheckpoint(signal);for(let x=0;x<fields.originalWidth;x++){
      if(!admitted(x,y))continue;let value=0,weight=0,supported=0,all=true;for(let j=0;j<ys[y].ids.length;j++)for(let i=0;i<xs[x].ids.length;i++){const id=ys[y].ids[j]*fields.width+xs[x].ids[i],w=ys[y].weights[j]*xs[x].weights[i];if(candidateOwner.data[id]){value+=union.data[id]*w;weight+=w;supported+=directUnion.data[id]*Math.abs(w);}else all=false;}out.data[y*fields.originalWidth+x]=(all?value:Math.abs(weight)>1e-14?value/weight:0)>.5?1:0;supportOut.data[y*fields.originalWidth+x]=supported>0?1:0;
     }}}finally{free();}
    }
    // Geometry certification is additional to, never a substitute for, all
    // the strict upstream reads and native observed-support operators above.
    if(domain)for(let y=0;y<fields.originalHeight;y++)for(let x=0;x<fields.originalWidth;x++)if(!admitted(x,y)){out.data[y*fields.originalWidth+x]=0;supportOut.data[y*fields.originalWidth+x]=0;}
    metadata={...base,directSsimPixels:supportOut.data.reduce((a,b)=>a+b,0),workspaceMaximumBytes:maximum,heapBytes,cpuTeamAdmitted:cpuTeam,physicalCpuMeasured:false,ssim:{radius:p.ssimRadius,exponents:[3,1,2],dynamicRange:1,gaussianSupport:'joint observed 3-sigma; native replicate physical outer padding'},ROI:'unchanged native counted strict disks/grayscale dilation/radial FFT',morphology:'unchanged four-line native footprint over observed scalar taps; domain barriers for components/fill-holes'};
   }finally{union?.release();directUnion?.release();}
  });
  checkAbort(signal);success=true;let released=false;return{mask:out.data,directSsimSupport:supportOut.data,metadata,release(){if(released)return;released=true;out.release();supportOut.release();}};
 }finally{candidateOwner?.release();if(!success){out?.release();supportOut?.release();}}
}
