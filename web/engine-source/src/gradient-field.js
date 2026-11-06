import {EngineError,requireValue,checkAbort,createCooperator,normalizeResourceError} from './errors.js';
import {gradientFieldIdentity,gradientFieldRadius,gradientFieldCostIdentity} from './gradient-field-parameters.js';
import {grayInput,prefilter,derivativeBlock,coherenceBlock,angleInto,gradientKernel,gradientComponentStats,accumulateGradientComponents,componentInto} from './gradient-field-math.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {createRamByteCache,ramByteCacheBytes} from './ram-byte-cache.js';
import {gradientCacheStore} from './gradient-cache.js';
import {createPixelStoreCache} from './pixel-store-cache.js';
import {gradientToneLut} from './segmented-gradient.js';
import {Budget} from './cache.js';
import {contiguousSurface} from './image-sources.js';
import {getGradientFieldGpu} from './gradient-field-gpu.js';
import {retireCompositeOwners} from './composite-owner-release.js';

const MiB=1024**2;
export const gradientFieldSemantics=p=>`${p.method} signed luminance field; ${p.view==='native'?'historical RGB components and magnitude':p.view==='angle'?'HSV orientation (hue=angle; saturation=magnitude/max, value=(127+128*magnitude/max)/255; zero vector RGB127)':`structure-tensor coherence, Gaussian ${p.tensorSize} sigma ${p.tensorSigma}`}; ${p.luma}; excluded taps omitted BEFORE derivatives, prefilter and tensor; ${p.border} physical borders.`;
export function gradientFieldHeadroom(width,height,p,{runtimeBytes=0,transportBytes=0}={}){
 const halo=Math.max(gradientFieldRadius(p),p.view==='coherence'?(p.tensorSize-1)/2:0),rows=Math.min(height,Math.max(1,Math.floor(65536/width))),window=width*Math.min(height,rows+2*halo);
 return{bytes:runtimeBytes+width*height*42+window*400+16*MiB+transportBytes*12,completeResidentAlternative:true,parallelWorkers:0,gradientField:true};
}
export async function gradientFieldSurface(image,p,options={}){
 const gpu=getGradientFieldGpu(options.budget);
 try{return await executeGradientFieldSurface(image,p,options);}catch(error){
  if((options.backend??'auto')==='auto'&&!options.signal?.aborted&&gpu.mayFallback(error)){
   const result=await executeGradientFieldSurface(image,p,{...options,backend:'cpu'});
   gpu.observeGpuFailure(image,gradientFieldCostIdentity(p),error);result.metrics.gradientGpuFallback=error.code;return result;
  }throw error;
 }
}
async function executeGradientFieldSurface(image,p,{budget,signal,onProgress,rowsPerBlock,cacheKey,backend='auto',domain,view}={}){
 const source=domain?view:image.surface,d=source.descriptor,w=d.width,h=d.height,n=w*h,cooperate=createCooperator(signal),started=performance.now();
 requireValue(budget&&Number.isSafeInteger(n*16)&&['cpu','auto','webgpu'].includes(backend),'Invalid gradient field execution.');
 const radius=gradientFieldRadius(p),tensorRadius=p.view==='coherence'?(p.tensorSize-1)/2:0,halo=Math.max(radius,tensorRadius),windowLimit=source.maxReadPixels??1024*1024;
 const gpu=getGradientFieldGpu(budget),policy=gradientFieldIdentity(p),gpuPolicy=gradientFieldCostIdentity(p),effectiveBackend=gpu.shouldRun(image,backend,gpuPolicy)?'webgpu':'cpu';
 const maxWindowRows=Math.floor(windowLimit/w),available=budget.limit-budget.total(),windowRows=Math.min(maxWindowRows,Math.floor((available-8*MiB)/(w*400)));
 // Physical image boundaries clip the resident halo. If the complete short
 // frame fits, a support wider than that frame needs no nonexistent rows.
 const maxRows=h<=windowRows?h:windowRows-2*halo;
 const rows=Math.min(h,rowsPerBlock??Math.max(1,Math.floor((effectiveBackend==='webgpu'?262144:65536)/w)),maxRows);
 if(rows<1)throw new EngineError('MEMORY_LIMIT','The requested gradient support cannot fit one native row and its complete halo.');
 const stagingBytes=w*Math.min(h,rows+2*halo)*400+MiB;
 const key=cacheKey&&cacheKey+'/field-v1/'+policy+'/'+effectiveBackend,cacheBytes=ramByteCacheBytes(n*16,512),existing=key&&(image.pixelStoreCaches?.get('gradient-field')?.key===key?image.pixelStoreCaches.get('gradient-field'):budget.get(key));
 let cached=existing,cacheLease,base=cached?.value,pending,slopes,output,scope,staging,published=false,surface,scopeSurface,cacheReady=!!cached,failed=false,primary;let componentStats=cached?.value?.componentStats?Float64Array.from(cached.value.componentStats):gradientComponentStats();let sourceReads=0,derivativeMs=0,renderMs=0,gpuJobs=0;const histogram=new Float64Array(768),analysed=domain?.countIncluded??n;
 function mask(top,count){const M=new Uint8Array(w*count);if(!domain)M.fill(1);else for(let y=0;y<count;y++)for(const[a,b]of domain.rowIntervals(top+y))M.fill(1,y*w+a,y*w+b);return M;}
 function store(){return createSegmentedBytes(n*3,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});}
 try{
  if(cached&&cached.byteLength){budget.remove(key);cacheLease=budget.reserve(cached.byteLength);}
  staging=budget.reserve(stagingBytes);
  output=await store();if(domain)scope=await createSegmentedBytes(n,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal});
  if(!base&&key&&cacheBytes<=budget.limit-budget.total()){cacheLease=budget.reserve(cacheBytes);base=createRamByteCache(n*16);}
  if(!base&&key&&(image.session||image.ensureTemporarySession)){pending=await createPixelStoreCache(image,'gradient-field',key,n*16,{}, {budget,signal});base=pending.record.value;}
  slopes=base?.store??(base?gradientCacheStore(base,budget):await createSegmentedBytes(n*16,{budget,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,signal}));
  if(!cached){const at=performance.now();for(let y=0;y<h;y+=rows){await cooperate();checkAbort(signal);const count=Math.min(rows,h-y),top=Math.max(0,y-radius),bottom=Math.min(h,y+count+radius),rect={x:0,y:top,width:w,height:bottom-top},lease=await (domain?source.readMaskedWindow(rect,{signal}):source.readWindow(rect,{signal}));sourceReads++;
    try{const prepared=grayInput(lease.pixels.data,lease.pixels.membership,p),L=prefilter(prepared.L,prepared.M,w,bottom-top,p);let field;
     if(effectiveBackend==='webgpu'){const answer=await gpu.run({L,M:prepared.M,width:w,height:bottom-top,start:y-top,rows:count,params:p,kernel:gradientKernel(p)},{signal,backend});field=answer.slopes;gpuJobs+=answer.gpuJobs;}
     else field=derivativeBlock(L,prepared.M,w,bottom-top,p,{start:y-top,rows:count});
     accumulateGradientComponents(componentStats,field,prepared.M.subarray((y-top)*w,(y-top+count)*w));
     await slopes.write(new Uint8Array(field.buffer,field.byteOffset,field.byteLength),y*w*16);
    }finally{await lease.release();}onProgress?.(.6*(y+count)/h);
   }await slopes.flush();derivativeMs=performance.now()-at;if(effectiveBackend==='cpu')gpu.observeCpu(image,derivativeMs,gpuPolicy);
  }
  if(!cached&&base)base.componentStats=Array.from(componentStats);
  if(p.view==='native'&&p.mode===3&&p.method!=='krawetz'){
   for(let y=0;y<h;y+=rows){await cooperate();const count=Math.min(rows,h-y),bytes=new Uint8Array(w*count*16);if(base&&!base.store)base.read(bytes,y*w*16);else await slopes.readInto(bytes,y*w*16);const field=new Float64Array(bytes.buffer),M=mask(y,count),rgb=new Uint8Array(3);for(let i=0;i<M.length;i++)if(M[i]){componentInto(rgb,0,field[2*i],field[2*i+1],{...p,mode:0},componentStats);const v=Math.hypot(rgb[0],rgb[1]);componentStats[4]=Math.min(componentStats[4],v);componentStats[5]=Math.max(componentStats[5],v);}}
  }
  const at=performance.now();for(let y=0;y<h;y+=rows){await cooperate();checkAbort(signal);const count=Math.min(rows,h-y),top=Math.max(0,y-tensorRadius),bottom=Math.min(h,y+count+tensorRadius),bytes=new Uint8Array(w*(bottom-top)*16);if(base&&!base.store)base.read(bytes,top*w*16);else await slopes.readInto(bytes,top*w*16);const field=new Float64Array(bytes.buffer),M=mask(top,bottom-top),coherence=p.view==='coherence'?coherenceBlock(field,M,w,bottom-top,p):null,rendered=new Uint8Array(w*count*3);
   if(domain){const original=await image.surface.readWindow({x:domain.origin[0],y:domain.origin[1]+y,width:w,height:count},{signal});try{rendered.set(original.pixels.data);}finally{await original.release();}}
   const coreMask=mask(y,count);for(let i=0;i<w*count;i++)if(coreMask[i]){const at=((y-top)*w+i);if(coherence)rendered[3*i]=rendered[3*i+1]=rendered[3*i+2]=Math.round(coherence[at]*255);else if(p.view==='native')componentInto(rendered,3*i,field[2*at],field[2*at+1],p,componentStats);else angleInto(rendered,3*i,field[2*at],field[2*at+1],p.invert,componentStats[6]);for(let c=0;c<3;c++)histogram[256*c+rendered[3*i+c]]++;}
   await output.write(rendered,y*w*3);if(scope)await scope.write(coreMask,y*w);onProgress?.(.6+.3*(y+count)/h);
  }renderMs=performance.now()-at;
  if(p.equalize||p.intensity>0){const lut=gradientToneLut(histogram,analysed,p);for(let y=0;y<h;y+=rows){await cooperate();const count=Math.min(rows,h-y),bytes=new Uint8Array(w*count*3),M=mask(y,count);await output.readInto(bytes,y*w*3);for(let i=0;i<M.length;i++)if(M[i])for(let c=0;c<3;c++)bytes[3*i+c]=lut[256*c+bytes[3*i+c]];await output.write(bytes,y*w*3);onProgress?.(.9+.1*(y+count)/h);}}
  await output.flush();await scope?.flush();onProgress?.(1);checkAbort(signal);
  if(!base)await slopes.dispose();slopes=null;await pending?.publish();cacheReady=true;cacheLease?.();cacheLease=null;if(base&&!base.store&&key)budget.put(key,{value:base,byteLength:cacheBytes},[]);
  surface=createRgbSurface(output,{width:w,height:h,budget});if(scope)scopeSurface=createMaskSurface(scope,{width:w,height:h,budget,range:[0,1],semantics:'1=admitted gradient/tensor centre; 0=display-only original background.'});published=true;
  return{surface,...(scopeSurface?{maskRecords:{analysis_scope:{surface:scopeSurface}}}:{}),semantics:gradientFieldSemantics(p),metrics:{backend:effectiveBackend,gradientMethod:p.method,gradientView:p.view,componentStats:Array.from(componentStats).slice(0,4),maximumGradientMagnitude:componentStats[6],gradientField:true,derivativeBackend:effectiveBackend,tensorBackend:'cpu',precision:effectiveBackend==='webgpu'?'float32 derivative kernel; float64 tensor and CPU HSV':'float64',gpuJobs,sourceReads,analysisCacheHit:!!cached,derivativeCacheBytes:base?n*16:0,derivativeCacheStorage:base?.store?'temporary':base?'memory':null,storage:output.storage,rowsPerBlock:rows,halo:radius,selectedPixels:analysed,analysedPixels:analysed,unanalysablePixels:0,derivativeMs,renderMs,totalMs:performance.now()-started}};
 }catch(error){failed=true;primary=normalizeResourceError(error);throw primary;}finally{
  await retireCompositeOwners([
   ()=>cacheLease?.(),
   ()=>{if(base&&cacheReady&&!base.store&&key&&!budget.get(key))budget.put(key,{value:base,byteLength:cacheBytes},[]);},
   ()=>pending?.cleanup(),
   ()=>slopes&&!base?.store?slopes.dispose():undefined,
   ()=>!published?(surface?.dispose()??output?.dispose()):undefined,
   ()=>!published?(scopeSurface?.dispose()??scope?.dispose()):undefined,
   ()=>staging?.()
  ],failed?{primary}:{});
 }
}
export async function contiguousGradientField(pixels,p,hooks={}){
 const budget=new Budget(Math.max(128*MiB,pixels.width*pixels.height*64+32*MiB)),image={surface:contiguousSurface(pixels,budget)};let result;
 try{result=await gradientFieldSurface(image,p,{budget,signal:hooks.signal,onProgress:hooks.onProgress,backend:'cpu'});const lease=await result.surface.readWindow();try{return{pixels:{...lease.pixels,data:lease.pixels.data.slice()},semantics:result.semantics,engineMetrics:result.metrics};}finally{await lease.release();}}
 finally{await result?.surface.dispose();await image.surface.dispose();}
}
