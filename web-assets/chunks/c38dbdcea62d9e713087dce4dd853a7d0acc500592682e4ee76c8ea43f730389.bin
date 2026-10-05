import "../../runtime-context.js?v=0.14.5";
import {createFrequencyGpu} from './frequency-gpu-kernel.js';
import {cvFrequencyMask} from './opencv.js';
import {EngineError,checkAbort} from './errors.js';
const DEVICE_RESERVE=32*1024**2;
export class FrequencyGpu {
 constructor(budget,profile){this.budget=budget;this.profile=profile;this.gpu=null;this.charged=0;this.qualification=null;this.failure=null;}
 dispose(){this.gpu?.dispose();this.gpu=null;this.budget.retained-=this.charged;this.charged=0;this.qualification=null;this.failure=null;}
 async prepare(signal){
  if(this.gpu)return;
  if(this.failure)throw new EngineError('UNSUPPORTED_BACKEND',this.failure);
  if(!globalThis.navigator?.gpu)throw new EngineError('UNSUPPORTED_BACKEND','WebGPU is unavailable.');
  checkAbort(signal);this.budget.retain(DEVICE_RESERVE);this.charged=DEVICE_RESERVE;
  try{
   // Create only the device and pipeline needed for the requested mask.
   // Numerical corpus checks and timings belong to development qualification.
   this.gpu=await createFrequencyGpu();checkAbort(signal);
   this.qualification={source:'offline-synthetic-corpus',initMs:this.gpu.initMs,preflightExecutions:0,scope:'Exact mask and final-view corpus on documented development adapters. Other adapters remain unverified; no runtime parity claim.'};
  }catch(error){this.dispose();if(error.code!=='CANCELLED'&&error.code!=='MEMORY_LIMIT')this.failure=error.message;throw error;}
 }
 async mask(width,height,p,{signal,required=false}={}){
  const kernel=2*Math.trunc(Math.hypot(width,height)/2*p.smooth/100)+1;
  if(!required&&(kernel===1||width*height*kernel<1048576))return {mask:null,metrics:{backend:'cpu',reason:'Small mask uses the CPU reference.'}};
  let release;const abort=()=>this.dispose();signal?.addEventListener('abort',abort,{once:true});
  try{
   checkAbort(signal);release=this.budget.reserve(width*height*16+kernel*4+32+4*1024**2);await this.prepare(signal);checkAbort(signal);
   const t=performance.now(),input=await cvFrequencyMask(width,height,p.split,p.smooth,0,{signal}),weights=await cvFrequencyMask(width,height,p.split,p.smooth,1,{signal}),preparationMs=performance.now()-t,r=await this.gpu.run(input,width,height,weights);checkAbort(signal);
   if(r.data.some(x=>!Number.isFinite(x)||x<0||x>1.0001))throw new EngineError('UNSUPPORTED_BACKEND','Invalid GPU frequency mask.');
   return {mask:r.data,metrics:{backend:'webgpu',kernel:'frequency-gpu-mask+cpu-dft',gpu:{preparationMs,...r.metrics,qualification:this.qualification},workers:1}};
  }catch(error){checkAbort(signal);const reason=error.message;this.dispose();if(error.code!=='MEMORY_LIMIT')this.failure=reason;if(required)throw new EngineError(error.code??'UNSUPPORTED_BACKEND',reason);return {mask:null,metrics:{backend:'cpu',reason:error.code==='MEMORY_LIMIT'?'GPU exceeds the shared memory budget.':'GPU unavailable or requested computation failed.'}};
  }finally{signal?.removeEventListener('abort',abort);release?.();}
 }
}
