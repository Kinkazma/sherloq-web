import {EngineError,requireValue,checkAbort,checkpoint} from './errors.js';
import {DEFAULT_ELA_PARAMS,DEFAULT_ENERGY_PROFILE,validateParams,validatePixels,elaBase,elaRender} from './ela.js';
import {jpegCodec,JPEG_OPTIONS} from './jpeg.js';
import {toneTable,fusedCpu} from './ela-lut.js';
import {LutPool} from './lut-pool.js';
import {resolveComputeProfile} from './profiles.js';
export {COMPUTE_PROFILES,resolveComputeProfile} from './profiles.js';
import {Budget} from './cache.js';
export {EngineError,DEFAULT_ELA_PARAMS,DEFAULT_ENERGY_PROFILE};
const VERSION='0.2.0-b1',RUNTIME_RESERVE=32*1024**2;
const copyPixels=p=>({...p,data:p.data.slice()});
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
export function createEngine({memoryBudgetBytes,codec=jpegCodec,cpuKernel='auto',computeProfile='aggressive',resourceHints}={}) {
 const profile=resolveComputeProfile(computeProfile,resourceHints);memoryBudgetBytes??=profile.memoryBudgetBytes;
 requireValue(Number.isSafeInteger(memoryBudgetBytes)&&memoryBudgetBytes>0,'Positive memory budget required.');
 requireValue(['auto','single','reference'].includes(cpuKernel),'Invalid CPU kernel.');
 const budget=new Budget(memoryBudgetBytes),images=new Map(),pool=new LutPool(budget,profile);let busy=false,disposed=false;
 function alive(){if(disposed)throw new EngineError('DISPOSED','Engine disposed.');}
 function idle(){alive();if(busy)throw new EngineError('BUSY','Another engine task is active.');}
 function image(id){alive();const im=images.get(id);if(!im)throw new EngineError('NOT_FOUND','Image not loaded.');return im;}
 function identity(id){requireValue(typeof id==='string'&&id.length>0&&id.length<=128&&!id.includes('\0'),'Invalid id.');}
 return {
  capabilities(){return {version:VERSION,operations:[{id:'ela.classic',status:'partial',backends:['cpu'],regions:['full-frame'],kernelParity:'bit-exact on 40 native fixture outputs',codecParity:codec.parity??'unverified'}],formats:['image/jpeg (8-bit, no APP1/APP2, no CMYK)','explicit rgb8 with provenance'],unavailable:['ela.energy','ela.biomes','ela.ghosts','tiff','webgpu','onnx'],energyProfile:DEFAULT_ENERGY_PROFILE,memory:budget.snapshot(),workerThreads:pool.selected??1,calculationProfile:profile.id,resourceProfile:profile,concurrencyReason:'One codec thread; kernels at >=1 MP immediately use admitted workers, adapting only from useful batches; no calibration.'};},
  async load(input,{signal}={}) {
   idle();identity(input?.id);requireValue(input.bytes instanceof Uint8Array&&input.bytes.length>0,'Original bytes required.');
   requireValue(!images.has(input.id),'Unload an image before reusing its id.');
   if(input.pixels)validatePixels(input.pixels);
   const shape=input.pixels??codec.inspect(input.bytes);const n=shape.width*shape.height;
   const release=budget.reserve(RUNTIME_RESERVE+input.bytes.length*3+n*24);busy=true;
   try {
    await checkpoint(signal);const start=performance.now(),bytes=input.bytes.slice();
    const pixels=input.pixels?copyPixels(input.pixels):await codec.decode(bytes,{signal});
    validatePixels(pixels);requireValue(pixels.width===shape.width&&pixels.height===shape.height,'Decoded dimensions differ.');
    const hash=await sha(bytes);checkAbort(signal);
    const provenance=input.pixels ? {decoder:'caller',parity:'unverified',...structuredClone(input.provenance??{})} : {decoder:codec.id,orientation:'identity (APP1 refused)',icc:'not applied (APP2 refused)',depth:8,alpha:'absent',interpolation:'none'};
    const record={bytes,pixels,provenance,sha256:hash};
    // Release temporary reservation before converting its retained part.
    release();budget.retain(bytes.byteLength+pixels.data.byteLength);images.set(input.id,record);
    return {id:input.id,width:pixels.width,height:pixels.height,format:pixels.format,sha256:hash,provenance,metrics:{preparationMs:performance.now()-start,memory:budget.snapshot()}};
   } catch(error) {releaseOnce();throw error;} finally {busy=false;}
   // The success path releases first; errors before that must release once.
   function releaseOnce(){if(budget.active>0)release();}
  },
  async run(task,{signal,onProgress}={}) {
   idle();identity(task?.id);if(task.operation!=='ela.classic')throw new EngineError('UNSUPPORTED_OPERATION','Operation unavailable.');
   if(task.backend && !['cpu','auto'].includes(task.backend))throw new EngineError('UNSUPPORTED_BACKEND','Requested backend unavailable.');
   if(task.regions && (!Array.isArray(task.regions)||task.regions.length))throw new EngineError('UNSUPPORTED_REGION','This operation currently supports the full image only.');
   const p=validateParams(task.params),im=image(task.imageId),n=im.pixels.data.length;
   const release=budget.reserve(RUNTIME_RESERVE+n*16);busy=true;
   const start=performance.now(),prefix=task.imageId+'\0',qkey=prefix+'q'+p.quality,bkey=qkey+'/'+p.linear;
   const fused=cpuKernel!=='reference'&&n>=786432;
   const tableKey=prefix+'lut/'+p.scale+'/'+p.contrast+'/'+p.linear;
   const rkey=bkey+'/'+p.scale+'/'+p.contrast+'/'+p.grayscale;
   const metrics={codecMs:0,kernelMs:0,cache:{recompressed:false,base:false,result:false}};
   const progress=(phase,fraction)=>onProgress?.({id:task.id,phase,fraction});
   let compressed,base,result,table;
   try {
    await checkpoint(signal);result=budget.get(rkey);metrics.cache.result=!!result;
    if(!result && fused){
     compressed=budget.get(qkey);metrics.cache.recompressed=!!compressed;
     if(!compressed){progress('jpeg',0);const t=performance.now();const decoded=await codec.recompress(im.pixels,p.quality,{signal});validatePixels(decoded);requireValue(decoded.width===im.pixels.width&&decoded.height===im.pixels.height,'Codec changed dimensions.');compressed=decoded.data;metrics.codecMs=performance.now()-t;}
     const t=performance.now();table=budget.get(tableKey);metrics.cache.table=!!table;if(!table)table=await toneTable(p,{signal});
     if(n>=3145728&&cpuKernel==='auto'){const run=await pool.run(im.pixels.data,compressed,p,table,{signal});result=run.data;metrics.workers=run.workers;metrics.calibration=run.calibration;metrics.calibrationMs=0;metrics.scheduling=run.scheduling;}else{result=await fusedCpu(im.pixels.data,compressed,p,table,{signal});metrics.workers=1;}metrics.kernelMs=performance.now()-t;metrics.kernel='cpu-lookup';
    } else if(!result) {
     metrics.kernel='cpu-reference';
     base=budget.get(bkey);metrics.cache.base=!!base;
     if(!base) {
      compressed=budget.get(qkey);metrics.cache.recompressed=!!compressed;
      if(!compressed){progress('jpeg',0);const t=performance.now();const decoded=await codec.recompress(im.pixels,p.quality,{signal});validatePixels(decoded);requireValue(decoded.width===im.pixels.width&&decoded.height===im.pixels.height,'Codec changed dimensions.');compressed=decoded.data;metrics.codecMs=performance.now()-t;}
      const t=performance.now();base=await elaBase(im.pixels.data,compressed,p.linear,{signal,onProgress:f=>progress('base',f)});metrics.kernelMs+=performance.now()-t;
     }
     const t=performance.now();result=await elaRender(base,p,{signal,onProgress:f=>progress('render',f)});metrics.kernelMs+=performance.now()-t;
    }
    checkAbort(signal);
    const pixels={width:im.pixels.width,height:im.pixels.height,format:'rgb8',data:result.slice()};
    const provenance={engine:VERSION,operation:'ela.classic',params:p,backend:'cpu',originalSha256:im.sha256,decode:structuredClone(im.provenance),codec:{id:codec.id,options:{...JPEG_OPTIONS,quality:p.quality},parity:codec.parity??'unverified'},kernelParity:'bit-exact on synthetic native reference; see fixtures/reference.json',semantics:'JPEG residual visualization; not a detection or authenticity verdict'};
    progress('complete',1);metrics.totalMs=performance.now()-start;
    release();if(table)budget.put(tableKey,table);if(compressed)budget.put(qkey,compressed);if(base)budget.put(bkey,base);budget.put(rkey,result);
    metrics.memory={...budget.snapshot(),codecHeapCapacityBytes:codec.memoryBytes?.()??null};
    return {id:task.id,imageId:task.imageId,operation:task.operation,status:'ok',pixels,layers:[{id:'ela',name:'ELA classique',kind:'rgb',origin:[0,0],range:[0,255]}],provenance,metrics};
   } finally {if(budget.active>0)release();busy=false;}
  },
  imagePixels(id){return copyPixels(image(id).pixels);},
  original(id){return image(id).bytes.slice();},
  unload(id){idle();const im=image(id);images.delete(id);budget.retained-=im.bytes.byteLength+im.pixels.data.byteLength;budget.clearPrefix(id+'\0');},
  dispose(){idle();pool.dispose();images.clear();budget.clear();disposed=true;}
 };
}
