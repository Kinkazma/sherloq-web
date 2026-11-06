// Private standalone entry: frozen-v2 resident solver when its graph is compact,
// bounded implicit solver for fragmented images. All owners share one budget.
import {createResident7C} from './engine/src/sherloq7c-resident.js';
import {createResidentMemoryPolicy,createResidentRgb16} from './engine/src/sherloq7c-resident-memory.js';
import {createResidentPng16} from './engine/src/sherloq7c-resident-png-source.js';
import {createBounded7C} from './experiments/resident-bounded-engine.mjs';
import {createBoundedGpuInitializer} from './experiments/resident-bounded-gpu-initializer.mjs';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const memoryFailures=new Set(['GRAPH_TARGET_LIMIT','GRAPH_MATERIALIZATION_LIMIT','MEMORY_LIMIT','MEMORY_ALLOCATION']);
function selection(source,requested){
 if(requested!=='auto')return{path:requested,reason:'explicit-selection'};
 const {width,height}=source,N=width*height;
 if(N<4*1024**2)return{path:'resident',reason:'small-image'};
 // Sampling only chooses between two certified solvers. It never replaces the
 // native graph, statistics or final numerical certificate. Avoid constructing
 // a manifestly expensive materialized graph before trying the bounded path.
 const count=Math.min(N,32768);let isolated=0;
 for(let k=0;k<count;k++){
  const i=Math.floor((k+.5)*N/count),x=i%width,y=Math.floor(i/width),v=source.maxAt(i);let equal=false;
  for(let dy=-1;dy<=1&&!equal;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height&&source.maxAt(i+dy*width+dx)===v){equal=true;break;}
  if(!equal)isolated++;
 }
 const fraction=isolated/count,estimatedIsolated=N*fraction;
 return{path:fraction>=.5&&estimatedIsolated*352+8*1024**2>2**31?'bounded':'resident',reason:'sampled-isolated-pixels',sampledPixels:count,isolatedFraction:fraction,estimateOnly:true};
}
export function createMemory7C(options={}){
 const policy=createResidentMemoryPolicy({...options,memoryBudgetBytes:options.memoryBudgetBytes??options.budget?.limit}),budget=policy.budget;
 let resident,bounded,closed=false,busy=false;
 const open=()=>{if(closed)throw fail('DISPOSED','Memory engine is closed.');};
 const config=()=>({budget,memoryBudgetBytes:budget.limit,ceilingBytes:options.ceilingBytes??4*1024**3,segmentBytes:policy.segmentBytes,gpu:options.gpu!==false});
 const makeInitializer=required=>{
  if(options.gpu===false)return undefined;
  const settings={...options.gpuInitializer,...(required?{mode:'required'}:{})};
  const general=createBoundedGpuInitializer(settings),palette=createBoundedGpuInitializer({...settings,iterations:settings.iterations??512});
  return args=>args.smallPalette&&args.micro===1&&args.precision==='1e-2'&&settings.iterations===undefined&&(settings.seedMode===undefined||settings.seedMode==='schwarz')?palette(args):general(args);
 };
 const initialize=makeInitializer(false),requiredInitialize=makeInitializer(true);
 const boundedEngine=()=>bounded??=createBounded7C(config());
 const residentEngine=()=>resident??=createResident7C(config());
 return{
  budget,
  createSource(input,opts={}){open();return createResidentRgb16(input,{...opts,budget,segmentBytes:policy.segmentBytes});},
  createPngSource(input,opts={}){open();return createResidentPng16(input,{...opts,budget,segmentBytes:policy.segmentBytes});},
  updateResourceHints:hints=>policy.updateResourceHints(hints),
  memory:()=>({closed,busy,policy:policy.snapshot(),resources:budget.resourceSnapshot(),resident:resident?.memory()??null,bounded:bounded?.memory()??null}),
  async run(source,{path='auto',...params}={},hooks={}){
   open();if(busy)throw fail('BUSY','Await the current memory engine operation.');
   const {micro=0,revelation=0,precision='reference',backend='auto'}=params;
   if(!['auto','resident','bounded'].includes(path)||!source?.immutable||typeof source.maxAt!=='function'||typeof source.retain!=='function'||source.nativeBitDepth!==16||!(micro>=0&&micro<=1&&revelation>=0&&revelation<=1)||!['reference','1e-2','1e-4','1e-7'].includes(precision)||!['cpu','auto','webgpu'].includes(backend))throw fail('INVALID_INPUT','Native immutable RGB16 source and valid 7C parameters/execution path required.');
   if(options.gpu===false&&backend==='webgpu')throw fail('INVALID_INPUT','WebGPU was requested while GPU use is disabled.');
   if(hooks.signal?.aborted)throw fail('CANCELLED','Memory engine operation cancelled.');busy=true;const started=performance.now();
   try{
    let picked=selection(source,path),output;
    if(picked.path==='resident'){
     try{output=await residentEngine().run(source,params,hooks);}
     catch(error){
      if(path!=='auto'||!memoryFailures.has(error?.code)||error.cleanupError||error.cleanupErrors?.length||error.retryCleanup||hooks.signal?.aborted)throw error;
      // Retirement is acknowledged before admitting another heap. Older public
      // outputs retain their own reservations and may still prevent admission.
      try{await resident.dispose();}catch(cleanupError){error.cleanupError=cleanupError;throw error;}resident=null;
      if(hooks.signal?.aborted)throw fail('CANCELLED','Memory engine operation cancelled during resident retirement.');
      picked={...picked,path:'bounded',reason:'resident-memory-refusal',fallbackCode:error.code};
     }
    }
    if(!output){
     await resident?.clearCache();
     if(hooks.signal?.aborted)throw fail('CANCELLED','Memory engine operation cancelled during cache retirement.');
     output=await boundedEngine().run(source,params,{...hooks,initialize:hooks.initialize??(params.backend==='cpu'?undefined:params.backend==='webgpu'?requiredInitialize:initialize)});
    }
    output.metrics=Object.freeze({...output.metrics,executionPath:picked.path,selection:Object.freeze(picked),memoryEngineElapsedMs:performance.now()-started});return output;
   }finally{busy=false;}
  },
  async clearCache(){open();if(busy)throw fail('BUSY','Await the current memory engine operation.');busy=true;try{await resident?.clearCache();}finally{busy=false;}},
  async dispose(){if(busy)throw fail('BUSY','Await cancellation before closing the memory engine.');closed=true;busy=true;try{const errors=[];for(const owner of [resident,bounded])try{await owner?.dispose();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Memory engine retirement remains pending.');}finally{busy=false;}}
 };
}
