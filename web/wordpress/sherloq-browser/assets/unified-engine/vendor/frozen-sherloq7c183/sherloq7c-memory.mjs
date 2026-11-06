import {createProxyController,readRowsForSource,canonicalMaxSide} from './experiments/proxy7c-core.mjs';
import {resampleSourceToU16} from './experiments/resample-rgb16.mjs';
// One native, budgeted engine for every image size. Legacy path values remain
// accepted as aliases; none selects a separate resident/materialized pipeline.
import {createResidentMemoryPolicy,createResidentRgb16} from './engine/src/sherloq7c-resident-memory.js';
import {createResidentPng16} from './engine/src/sherloq7c-resident-png-source.js';
import {createBounded7C} from './experiments/resident-bounded-engine.mjs';
import {createBoundedGpuInitializer} from './experiments/resident-bounded-gpu-initializer.mjs';
export {createInteractive7C} from './engine/src/sherloq7c-interactive.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
function createNativeMemory7C(options={}){
 const policy=createResidentMemoryPolicy({...options,memoryBudgetBytes:options.memoryBudgetBytes??options.budget?.limit}),budget=policy.budget;
 let native,closed=false,busy=false;
 const open=()=>{if(closed)throw fail('DISPOSED','Memory engine is closed.');};
 const config=()=>({budget,memoryBudgetBytes:budget.limit,ceilingBytes:Math.min(options.ceilingBytes??4_000_000_000,4_000_000_000),segmentBytes:policy.segmentBytes,gpu:options.gpu!==false,maxCachedPairs:options.maxCachedPairs,cacheZeroTargets:options.cacheZeroTargets??true,cacheZeroTargets16:options.cacheZeroTargets16??true,nativeFactories:options.nativeFactories});
 const makeInitializer=required=>{
  if(options.gpu===false)return undefined;
  const settings={...options.gpuInitializer,...(required?{mode:'required'}:{})};
  const general=createBoundedGpuInitializer(settings),palette=createBoundedGpuInitializer({...settings,iterations:settings.iterations??512});
  return args=>args.smallPalette&&args.micro===1&&args.precision==='1e-2'&&settings.iterations===undefined&&(settings.seedMode===undefined||settings.seedMode==='schwarz')?palette(args):general(args);
 };
 const initialize=makeInitializer(false),requiredInitialize=makeInitializer(true);
 const nativeEngine=()=>native??=createBounded7C(config());
 return{
  budget,
  get executionModel(){return 'unified-native';},
  async createSource(input,opts={}){open();if(busy)throw fail('BUSY','Await the current memory engine operation.');busy=true;try{await native?.clearCache();return await createResidentRgb16(input,{...opts,budget,segmentBytes:policy.segmentBytes});}finally{busy=false;}},
  async createPngSource(input,opts={}){open();if(busy)throw fail('BUSY','Await the current memory engine operation.');busy=true;try{await native?.clearCache();return await createResidentPng16(input,{...opts,budget,segmentBytes:policy.segmentBytes});}finally{busy=false;}},
  updateResourceHints:hints=>policy.updateResourceHints(hints),
  // Keep the old memory-inspection shape for adapters; resident is never built.
  memory:()=>({closed,busy,policy:policy.snapshot(),resources:budget.resourceSnapshot(),resident:null,bounded:native?.memory()??null}),
  async run(source,{path='auto',...params}={},hooks={}){
   open();if(busy)throw fail('BUSY','Await the current memory engine operation.');
   if(params.computationMode==='fast'&&params.precision===undefined)params={...params,precision:'1e-2'};
   const {micro=0,revelation=0,precision='reference',backend='auto',computationMode='precision'}=params;
   if(computationMode==='fast'&&params.prepareRevelationRange===undefined)params={...params,prepareRevelationRange:true};
   if(!['auto','resident','bounded'].includes(path)||!source?.immutable||typeof source.maxAt!=='function'||typeof source.retain!=='function'||source.nativeBitDepth!==16||!(micro>=0&&micro<=1&&revelation>=0&&revelation<=1)||!['fast','precision'].includes(computationMode)||!['reference','1e-2','1e-4','1e-7'].includes(precision)||!['cpu','auto','webgpu'].includes(backend))throw fail('INVALID_INPUT','Native immutable RGB16 source and valid 7C parameters required.');
   if(computationMode==='fast'&&precision==='reference')throw fail('INVALID_INPUT','Fast mode requires a finite projection tolerance.');
   if(options.gpu===false&&backend==='webgpu')throw fail('INVALID_INPUT','WebGPU was requested while GPU use is disabled.');
   if(hooks.signal?.aborted)throw fail('CANCELLED','Memory engine operation cancelled.');busy=true;const started=performance.now();
   try{
    const output=await nativeEngine().run(source,params,{...hooks,initialize:hooks.initialize??(backend==='cpu'?undefined:backend==='webgpu'?requiredInitialize:initialize)});
    output.metrics=Object.freeze({...output.metrics,version:'7C-unified-native',executionPath:'bounded',selection:Object.freeze({path:'bounded',reason:'unified-native-engine',requestedPath:path}),memoryEngineElapsedMs:performance.now()-started});return output;
   }finally{busy=false;}
  },
  async clearCache(){open();if(busy)throw fail('BUSY','Await the current memory engine operation.');busy=true;try{await native?.clearCache();}finally{busy=false;}},
  async dispose(){if(busy)throw fail('BUSY','Await cancellation before closing the memory engine.');closed=true;busy=true;try{await native?.dispose();}finally{busy=false;}}
 };
}

// Explicit input-domain reduction, with the complete retained native factory above.
export function createMemory7C(options={}){return createProxyController({...options,gpuInitializer:{seedMode:'conditioned',momentum:.99,...options.gpuInitializer}},{createEngine:createNativeMemory7C,createPolicy:createResidentMemoryPolicy,createResidentSource:createResidentRgb16,createPngSource:createResidentPng16,resample:resampleSourceToU16});}
export {createMemory7C as createProxy7C,createMemory7C as createMemory7CCompatible,readRowsForSource,canonicalMaxSide};
