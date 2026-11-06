// Preserved full-scratch certificate variant; shared source/output lifecycle fixes remain in use.
// Separate experimental selector: one extrema/source pass, one selected native heap.
import {createNativeMemoryTarget as createGeneralTarget,nativeMemoryTargetPlan} from './target-memory-edgecert-general.mjs';
import {createNativeMemoryTarget as createPaletteTarget} from './target-memory-edgecert.mjs';
import {createResidentMemoryPolicy,createResidentRgb16,createResidentOutput,createResidentArray} from '../engine/src/sherloq7c-resident-memory.js';
import {createResidentPng16} from '../engine/src/sherloq7c-resident-png-source.js';
import {cooperator} from '../engine/src/sherloq7c-math.js';
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});
export function createBounded7C(options={}){
 const factories=options.nativeFactories??{general:createGeneralTarget,palette:createPaletteTarget};
 if(typeof factories.general!=='function'||typeof factories.palette!=='function')throw fail('INVALID_INPUT','General and palette native factories are required.');
 // Snapshot the function references: later mutation of an options object must
 // not change the selected implementation while a run is in progress.
 const generalFactory=factories.general,paletteFactory=factories.palette;
 const policy=createResidentMemoryPolicy({...options,memoryBudgetBytes:options.memoryBudgetBytes??options.budget?.limit}),budget=policy.budget,pending=new Set(),outputs=new Set();let closed=false,busy=false;
 const open=()=>{if(closed)throw fail('DISPOSED','Bounded engine is closed.');};
 return{
  budget,plan:nativeMemoryTargetPlan,
  createSource(input,opts={}){open();return createResidentRgb16(input,{...opts,budget,segmentBytes:policy.segmentBytes});},
  createPngSource(input,opts={}){open();return createResidentPng16(input,{...opts,budget,segmentBytes:policy.segmentBytes});},
  updateResourceHints:hints=>policy.updateResourceHints(hints),
  memory:()=>({closed,busy,retainedOutputs:outputs.size,pendingRetirements:pending.size,policy:policy.snapshot(),resources:budget.resourceSnapshot()}),
  async run(source,{micro=0,revelation=0,precision='reference'}={},hooks={}){
   open();if(busy)throw fail('BUSY','Await the current bounded operation.');
   const threshold={reference:null,'1e-2':.002,'1e-4':.00002,'1e-7':.00000002}[precision];
   if(!(micro>=0&&micro<=1)||!(revelation>=0&&revelation<=1)||threshold===undefined||!source?.immutable||typeof source.retain!=='function'||source.nativeBitDepth!==16)throw fail('INVALID_INPUT','Native immutable RGB16 source and supported 7C parameters required.');
   const {signal,onProgress,initialize}=hooks,pause=cooperator(signal),started=performance.now(),N=source.width*source.height;
   const timings={};let native,packed,projected,initialization,constructionCleanup,selectorBank,selectorMask,releaseSource=source.retain(),published=false;busy=true;
   const retireSelector=()=>{selectorMask=null;if(selectorBank){selectorBank.dispose();selectorBank=null;}};
   const cleanup=async()=>{const errors=[];for(const retire of [retireSelector,async()=>{if(constructionCleanup){await constructionCleanup();constructionCleanup=null;}},()=>{if(projected){projected.dispose();projected=null;native=null;}else if(native){native.dispose();native=null;}},async()=>{if(initialization){await initialization.release();initialization=null;}},()=>{if(packed){packed.release();packed=null;}},()=>{if(releaseSource){releaseSource();releaseSource=null;}}])try{await retire();}catch(error){errors.push(error);}if(errors.length)throw errors[0];pending.delete(cleanup);};
   try{
    await pause();let minimum=65535,maximum=0,distinct=0,inspectedPixels=0,selectorRefusal=null;
    const needsTarget=!(micro===0&&revelation===0);
    if(needsTarget){
     try{selectorBank=await createResidentArray(Uint8Array,8192,{budget,segmentBytes:8192,signal,label:'bounded target level selector'});selectorMask=selectorBank.segments[0];}
     catch(error){
      const optional=error?.code==='MEMORY_LIMIT'||error?.code==='MEMORY_ALLOCATION'&&error?.details?.allocationKind==='array-buffer';
      if(!optional||signal?.aborted||error.cleanupError||error.cleanupErrors?.length||error.retryCleanup)throw error;
      selectorRefusal=error.code;
     }
    }
    for(let first=0;first<N;first+=65536){
     const end=Math.min(N,first+65536);let i=first;
     if(selectorMask&&distinct<=16){
      for(;i<end&&distinct<=16;i++){
       const value=source.maxAt(i);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
       const index=value>>>3,bit=1<<(value&7);if(!(selectorMask[index]&bit)){selectorMask[index]|=bit;distinct++;}
      }
      inspectedPixels=i;
     }
     // After the17th level, the rest of this chunk and all later chunks use
     // the original extrema-only loop: no mask access/check inside the loop.
     for(;i<end;i++){const value=source.maxAt(i);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}
     await pause();
    }
    const isBaseline=!needsTarget||minimum===maximum;
    const nativeSelection={variant:isBaseline?'baseline':selectorMask&&distinct<=16?'palette':'general',reason:isBaseline?'linear-baseline':selectorRefusal?'selector-memory-refusal':distinct>16?'more-than-16-levels':'at-most-16-levels',distinctLevels:selectorMask&&distinct<=16?distinct:null,atLeastLevels:distinct>16?17:null,inspectedPixels,sourcePasses:1,maskBytes:selectorMask?8192:0,refusalCode:selectorRefusal};
    retireSelector();
    timings.extremaMs=performance.now()-started;let scalar,metrics;
    if((micro===0&&revelation===0)||minimum===maximum){const lo=minimum/65535,span=maximum/65535-lo;scalar=i=>span?(source.maxAt(i)/65535-lo)/span:lo;metrics={backend:'bounded-linear-baseline',graphAllocated:false,maxErrorBound:0};}
    else{
     let at=performance.now();native=await (nativeSelection.variant==='palette'?paletteFactory:generalFactory)(source,{reserve:n=>budget.reserve(n),registerBacking:budget.registerBacking.bind(budget),signal,onProgress});timings.prepareMs=performance.now()-at;at=performance.now();
     if(initialize)initialization=await initialize({source,preparation:native.preparation,budget,micro,precision,signal,onProgress,smallPalette:nativeSelection.variant==='palette'});timings.initializationMs=performance.now()-at;
     let initial=initialization?.initial;const initialMetrics=initialization?.metrics;if(initialization&&initial===undefined){await initialization.release();initialization=null;}
     at=performance.now();await native.solve(micro,{maxError:threshold,signal,onProgress,initial,onInitialConsumed:initialization?async()=>{initial=null;await initialization.release();initialization=null;}:undefined});initial=null;timings.targetMs=performance.now()-at;
     const targetMetrics=native.metrics;
     if(revelation===1){scalar=i=>native.scalarAt(i);metrics={...targetMetrics,initialization:initialMetrics};}
     else if(micro===0){const lo=minimum/65535,span=maximum/65535-lo;scalar=i=>(1-revelation)*(source.maxAt(i)/65535-lo)/span+revelation*native.scalarAt(i);metrics={...targetMetrics,maxErrorBound:revelation*targetMetrics.maxErrorBound,initialization:initialMetrics};}
     else{
      at=performance.now();packed=await native.exportTarget({budget,levelSource:source,signal});timings.packingMs=performance.now()-at;at=performance.now();
      await native.replaceTarget(0,{maxError:threshold,signal,onProgress,initial:i=>packed.scalarAt(i)});const zeroMetrics=native.metrics;timings.zeroTargetMs=performance.now()-at;at=performance.now();
      projected=await native.projectWithPacked(packed,{revelation,precision,signal,onProgress});timings.projectionMs=performance.now()-at;packed.release();packed=null;scalar=i=>projected.scalarAt(i);metrics={...projected.metrics,targets:[targetMetrics,zeroMetrics],initialization:initialMetrics};
     }
    }
    metrics={...metrics,timings,nativeSelection,version:'7C-bounded-selector-experimental',micro,revelation,requestedPrecision:precision,workingPrecision:'float64',resolution:'native',maxErrorBoundFloat:metrics.maxErrorBound,maxErrorBoundRGB16:metrics.maxErrorBound+.5/65535,sourceBytes:source.byteLength,budgetPeak:budget.peak,elapsedMs:performance.now()-started,temporaryDiskBytes:0};
    let output;output=createResidentOutput(source,scalar,{budget,metrics,releaseState:cleanup});const retireOutput=output.release;output.release=async()=>{await retireOutput();outputs.delete(output);};outputs.add(output);published=true;return output;
   }catch(error){if(typeof error?.retryCleanup==='function'&&error.retryCleanup!==cleanup)constructionCleanup=error.retryCleanup;let primary=error;try{await cleanup();}catch(cleanupError){pending.add(cleanup);if(!primary||typeof primary!=='object'||!Object.isExtensible(primary))primary=Object.assign(new AggregateError([error,cleanupError],'Bounded operation and retirement failed.',{cause:error}),{code:error?.code??'CLEANUP_FAILED'});primary.cleanupError=cleanupError;primary.retryCleanup=cleanup;}throw primary;}finally{busy=false;if(!published&&native)pending.add(cleanup);}
  },
  async dispose(){if(busy)throw fail('BUSY','Await cancellation before closing the bounded engine.');closed=true;const errors=[];for(const cleanup of [...pending])try{await cleanup();}catch(error){errors.push(error);}if(errors.length)throw errors[0];}
 };
}
