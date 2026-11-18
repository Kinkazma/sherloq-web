import "../../runtime-context.js?v=0.33.3";
import {allocateTypedArray} from './allocation.js';
import {EngineError,checkAbort,createCooperator,requireValue} from './errors.js';
import {displayGeometry} from './display-sampling.js';

const MiB=1024*1024,MAX_WINDOW_BYTES=64*MiB,BASIS_BYTES_PER_PIXEL=22;
const fullRange=value=>Array.isArray(value)&&value.length===2&&value[0]===0&&value[1]===1;
const optionalMemoryFailure=error=>(error?.code==='MEMORY_LIMIT'||error?.code==='MEMORY_ALLOCATION'&&error?.details?.allocationKind==='array-buffer')&&!error.cleanupError&&!error.cleanupErrors?.length&&!error.retryCleanup;
const optionalCacheFailure=error=>(optionalMemoryFailure(error)||error?.code==='BUSY')&&!error.cleanupError&&!error.cleanupErrors?.length&&!error.retryCleanup;

// Only representations whose public scalar expression is known are admitted.
// In particular, equal component endpoints have a shortcut which the packed
// pixel projection does not have. Those expressions must not be interchanged.
function expressionFor(result,params){
 const m=result?.metrics,micro=params.micro??m?.micro;
 if(!m||!Number.isFinite(micro)||micro<0||micro>1)return null;
 if(micro===0){
  if(m.backend==='bounded-linear-baseline'||!m.preparedTargets?.length)return null;
  return 'zero-micro';
 }
 if(!fullRange(m.certifiedRevelationRange)&&!fullRange(m.preparedRevelationRange))return null;
 if(m.backend==='native-component-target-projection')return 'component';
 if(m.backend==='native-compact-target-forest-arena')return 'pixel';
 return null;
}

function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}

function familyParameters(params){
 const {revelation:ignored,...rest}=params;
 return JSON.stringify(canonical(rest));
}

function cleanupFailure(primary,errors){
 if(!errors.length)return primary;
 const failure=new AggregateError(primary?[primary,...errors]:errors,'SHERLOQ revelation cache retirement failed.',primary?{cause:primary}:undefined);
 failure.code=primary?.code??'CLEANUP_FAILED';failure.cleanupErrors=errors;return failure;
}

/** Optional, budget-backed RGB8 reconstruction from immutable frozen endpoints.
 * It never supplies scalar or RGB16 exports and never changes the frozen core.
 */
export function createSherloqRevelationCache({budget,reclaimBudget=budget,maximumBytes=512*MiB}={}){
 requireValue(typeof budget?.reserve==='function'&&Number.isSafeInteger(maximumBytes)&&maximumBytes>=0,'A budget and nonnegative revelation cache size are required.');
 const sourceIds=new WeakMap(),families=new Map(),lru=new Map(),states=new Set();
 let nextSource=0,nextFamily=0,bytes=0,closed=false,endpointTail=Promise.resolve();

 function ownedArray(Type,length,label){
  const size=length*Type.BYTES_PER_ELEMENT,free=budget.reserve(size);let data,backing,closed=false;
  try{data=allocateTypedArray(Type,length,{label});backing=budget.registerBacking?.('array-buffer',size,{owner:'sherloq7c-revelation-cache',label,identity:data.buffer});}
  catch(error){try{free();}catch(cleanupError){throw cleanupFailure(error,[cleanupError]);}throw error;}
  const owner={data,release(){
   if(closed)return;
   // A failing backing acknowledgement keeps its owner and its reservation.
   if(backing){const retired=backing();backing=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??size);}
   free();owner.data=null;data=null;closed=true;
  }};return owner;
 }

 function sourceId(source){let id=sourceIds.get(source);if(id===undefined){id=++nextSource;sourceIds.set(source,id);}return id;}
 function releaseBasis(entry){
  if(entry.released||entry.pins){entry.retired=true;return 0;}
  entry.retired=true;
  while(entry.owners.length){entry.owners[0].release();entry.owners.shift();}
  entry.released=true;lru.delete(entry.key);entry.family.entries.delete(entry);
  const released=entry.bytes;bytes-=released;entry.zero=entry.one=entry.rgb=null;return released;
 }
 function trim(required=0,all=false){
  let freed=0;
  for(const entry of [...lru.values()]){
   if(!all&&bytes+required<=maximumBytes)break;
   if(!entry.pins)freed+=releaseBasis(entry);
  }
  return freed;
 }
 function invalidate(family){
  family.retired=true;
  for(const entry of [...family.entries])releaseBasis(entry);
  if(families.get(family.key)===family)families.delete(family.key);
 }
 function unpin(entry){entry.pins--;if(entry.retired&&!entry.pins)releaseBasis(entry);}
 function touch(entry){lru.delete(entry.key);lru.set(entry.key,entry);}
 function decline(){return closed||reclaimBudget?.recovering||reclaimBudget?.isBackingUnderPressure?.('array-buffer');}
 const unregister=reclaimBudget?.registerReclaimer?.(()=>trim(0,true),{owner:'sherloq7c-revelation-cache',label:'optional RGB8 endpoint basis',allocationKind:'array-buffer'});

 // A proxy core permits one run at a time. Pair acquisition is serialized;
 // its immutable output readers can then serve all rows of the same facade.
 function serializedEndpoints(fn){const work=endpointTail.then(fn);endpointTail=work.catch(()=>{});return work;}

 function wrap(result,{source,params={},prepareEndpoint,getPreparedSource}={}){
  requireValue(result&&typeof result.readWindow==='function'&&typeof result.release==='function','An immutable SHERLOQ result is required.');
  const expression=expressionFor(result,params),revelation=params.revelation??result.metrics?.revelation;
  const identified=source&&(typeof source==='object'||typeof source==='function');
  const key=identified?sourceId(source)+'/'+result.width+'x'+result.height+'/'+familyParameters(params):null;
  const eligible=identified&&typeof prepareEndpoint==='function'&&typeof getPreparedSource==='function'&&expression&&Number.isFinite(revelation)&&revelation>=0&&revelation<=1;
  let family=families.get(key);
  if(family&&(result.metrics?.reuse?.stateHit===false||family.expression!==expression)){invalidate(family);family=null;}
  if(!eligible||closed)return result;
  if(!family){family={key,id:++nextFamily,expression,entries:new Set(),building:new Map(),retired:false};families.set(key,family);}
  const state={family,result,source,params,revelation,expression,prepareEndpoint,getPreparedSource,pair:null,pairPromise:null,pending:0,waiters:[],retirements:new Set(),cacheDisabled:false,releaseRequested:false,released:false,retiring:null};
  states.add(state);

  function open(){if(state.released||state.releaseRequested)throw new EngineError('DISPOSED','SHERLOQ result is closed or retiring.');}
  function done(){state.pending--;if(!state.pending){for(const resolve of state.waiters.splice(0))resolve();}}
  const idle=()=>state.pending?new Promise(resolve=>state.waiters.push(resolve)):Promise.resolve();

  async function retire(values=[],primary){
   for(const value of values)if(value)state.retirements.add(value);
   const errors=[];
   for(const value of [...state.retirements])try{await value.release();state.retirements.delete(value);}catch(error){errors.push(error);}
   const failure=cleanupFailure(primary,errors);
   if(errors.length){failure.retryCleanup=()=>retire();throw failure;}
   if(primary)throw primary;
  }

  async function pair(signal){
   if(state.pair)return state.pair;
   const inherited=!!state.pairPromise;
   if(!state.pairPromise)state.pairPromise=serializedEndpoints(async()=>{
    let prepared,zero,one;
    try{
     checkAbort(signal);prepared=await state.getPreparedSource();checkAbort(signal);
     requireValue(prepared?.immutable===true&&prepared.nativeBitDepth===16&&prepared.width===result.width&&prepared.height===result.height&&typeof prepared.readRgb16Span==='function','Prepared SHERLOQ input does not match its output domain.');
     zero=await state.prepareEndpoint(0,{signal});checkAbort(signal);
     one=await state.prepareEndpoint(1,{signal});checkAbort(signal);
     for(const endpoint of [zero,one]){
      requireValue(endpoint?.width===result.width&&endpoint?.height===result.height&&expressionFor(endpoint,params)===expression,'SHERLOQ revelation endpoint representation changed.');
      const work=endpoint.metrics?.work;
      requireValue(!work||!work.sourcePasses&&!work.nativePreparations&&!work.targetSolves&&!work.initializerRuns&&!work.projections,'SHERLOQ revelation cache requires already prepared endpoints.');
     }
     state.pair={prepared,zero,one};prepared=zero=one=null;return state.pair;
    }catch(error){await retire([one,zero,prepared],error);}
   }).finally(()=>{state.pairPromise=null;});
   try{return await state.pairPromise;}catch(error){
    // A newer live read may have borrowed preparation started by an older
    // gesture. Cancellation belongs to that gesture, not to this reader.
    if(inherited&&error?.code==='CANCELLED'&&!signal?.aborted&&!error.cleanupError&&!error.cleanupErrors?.length&&!error.retryCleanup)return pair(signal);
    throw error;
   }
  }

  async function releasePair(){
   if(state.pairPromise)await state.pairPromise;
   const p=state.pair;if(!p)return;
   // Preserve failed owners for a later release attempt.
   const errors=[];
   for(const name of ['one','zero','prepared'])if(p[name])try{await p[name].release();p[name]=null;}catch(error){errors.push(error);}
   if(!p.one&&!p.zero&&!p.prepared)state.pair=null;
   if(errors.length)throw cleanupFailure(null,errors);
  }

  async function build(g,entryKey,signal){
   const pixels=g.width*g.height,needed=pixels*BASIS_BYTES_PER_PIXEL;
   if(decline()||state.cacheDisabled||family.retired||needed>maximumBytes)return null;
   trim(needed);if(bytes+needed>maximumBytes)return null;
   const owners=[];let entry,p,scratch;
   try{
    entry={key:entryKey,family,zero:null,one:null,rgb:null,owners,bytes:0,pins:1,retired:false,released:false};family.entries.add(entry);
    const zero=ownedArray(Float64Array,pixels,'revelation zero endpoint');owners.push(zero);entry.bytes+=zero.data.byteLength;bytes+=zero.data.byteLength;
    const one=ownedArray(Float64Array,pixels,'revelation full endpoint');owners.push(one);entry.bytes+=one.data.byteLength;bytes+=one.data.byteLength;
    const rgb=ownedArray(Uint16Array,3*pixels,'revelation prepared RGB16');owners.push(rgb);entry.bytes+=rgb.data.byteLength;bytes+=rgb.data.byteLength;
    // Account in-progress bases too: another window must not exceed the cap.
    entry.zero=zero.data;entry.one=one.data;entry.rgb=rgb.data;
    p=await pair(signal);checkAbort(signal);
    const cooperate=createCooperator(signal);
    if(g.step>1)scratch=ownedArray(Uint16Array,3*g.w,'revelation prepared RGB16 scanline');
    for(let row=0;row<g.height;row++){
     const target=entry.rgb.subarray(3*row*g.width,3*(row+1)*g.width),first=3*((g.y+row*g.step)*result.width+g.x);
     if(g.step===1)p.prepared.readRgb16Span(target,first);
     else{
      p.prepared.readRgb16Span(scratch.data,first);
      for(let col=0;col<g.width;col++)for(let c=0;c<3;c++)target[3*col+c]=scratch.data[3*col*g.step+c];
     }
     await cooperate();
    }
    if(scratch){await retire([scratch]);scratch=null;}
    for(const [endpoint,target] of [[p.zero,entry.zero],[p.one,entry.one]]){
     // The endpoint lease includes RGB8 plus Float64 scalar (11 bytes/pixel).
     // Its public reader remains bounded even when the optional basis is larger.
     const bandRows=g.step===1?Math.max(1,Math.floor(MAX_WINDOW_BYTES/(11*g.w))):1;
     for(let row=0;row<g.height;row+=bandRows){
      let window,primary;
      try{
       const rows=g.step===1?Math.min(bandRows,g.height-row):1;
       const rect={x:g.x,y:g.y+row*g.step,width:g.w,height:rows};
       window=await endpoint.readWindow(rect,{format:'rgb8',includeScalar:true,signal});checkAbort(signal);
       requireValue(window.scalar instanceof Float64Array&&window.scalar.length===g.w*rows,'Frozen SHERLOQ endpoint must expose exact Float64 scalars.');
       if(g.step===1)target.set(window.scalar,row*g.width);
       else for(let col=0;col<g.width;col++)target[row*g.width+col]=window.scalar[col*g.step];
      }catch(error){primary=error;}
      await retire([window],primary);
     }
    }
    checkAbort(signal);
    if(closed||state.cacheDisabled||family.retired){entry.retired=true;unpin(entry);return null;}
    lru.set(entryKey,entry);entry.pins--;reclaimBudget?.notifyReclaimable?.();return entry;
   }catch(error){
    const cleanup=[];
    if(scratch)try{await retire([scratch]);}catch(failure){cleanup.push(failure);}
    if(entry){entry.retired=true;try{unpin(entry);}catch(failure){cleanup.push(failure);}}
    const failure=cleanupFailure(error,cleanup);
    if(cleanup.length)failure.retryCleanup=async()=>{await retire();releaseBasis(entry);};
    if(!signal?.aborted&&optionalCacheFailure(failure))return null;
    throw failure;
   }
  }

  async function basis(g,signal){
   const entryKey=family.id+'/'+g.x+','+g.y+','+g.w+','+g.h+','+g.step;
   let entry=lru.get(entryKey);
   if(entry&&!entry.retired){touch(entry);entry.pins++;return entry;}
   let work=family.building.get(entryKey);
   const inherited=!!work;
   if(!work){work=build(g,entryKey,signal);family.building.set(entryKey,work);work.finally(()=>{if(family.building.get(entryKey)===work)family.building.delete(entryKey);}).catch(()=>{});}
   try{entry=await work;}catch(error){
    if(inherited&&error?.code==='CANCELLED'&&!signal?.aborted&&!error.cleanupError&&!error.cleanupErrors?.length&&!error.retryCleanup){if(family.building.get(entryKey)===work)family.building.delete(entryKey);return basis(g,signal);}
    throw error;
   }
   checkAbort(signal);
   if(!entry||entry.retired)return null;
   touch(entry);entry.pins++;return entry;
  }

  async function render(entry,width,height,signal){
   let output;
   try{
    output=ownedArray(Uint8Array,3*width*height,'revelation RGB8 window');
    const r=state.revelation,component=state.expression==='component',cooperate=createCooperator(signal);
    for(let first=0;first<width*height;first+=16384){
     const end=Math.min(width*height,first+16384);
     for(let at=first;at<end;at++){
      const z0=entry.zero[at],z1=entry.one[at];
      const z=r===0?z0:state.expression!=='zero-micro'&&(r===1||component&&z0===z1)?z1:(1-r)*z0+r*z1;
      const offset=3*at,a=entry.rgb[offset],b=entry.rgb[offset+1],c=entry.rgb[offset+2],v=Math.max(a,b,c)/65535,gain=v?z/v:0;
      output.data[offset]=Math.max(0,Math.min(255,Math.round(a*gain/257)));
      output.data[offset+1]=Math.max(0,Math.min(255,Math.round(b*gain/257)));
      output.data[offset+2]=Math.max(0,Math.min(255,Math.round(c*gain/257)));
     }
     await cooperate();
    }
    checkAbort(signal);let live=true;const owner=output;
    const window={width,height,format:'rgb8',data:output.data,scalar:null,byteLength:output.data.byteLength,release(){if(!live)return;owner.release();live=false;window.data=null;}};
    output=null;return window;
   }catch(error){
    if(output)await retire([output],error);
    throw error;
   }
  }

  async function readWindow(rect,options={}){
   open();const {format='rgb16',includeScalar=false,signal}=options;
   if(format!=='rgb8'||includeScalar||decline()||state.cacheDisabled||family.retired)return result.readWindow(rect,options);
   const {x=0,y=0,width,height}=rect??{};
   requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=result.width-width&&y<=result.height-height,'Invalid result window.');
   if(3*width*height>MAX_WINDOW_BYTES)return result.readWindow(rect,options);
   state.pending++;let entry;
   try{
    checkAbort(signal);entry=await basis({x,y,w:width,h:height,width,height,step:1},signal);
    if(!entry)return await result.readWindow(rect,options);
    return Object.assign(await render(entry,width,height,signal),{x,y});
   }catch(error){
    if(!signal?.aborted&&optionalMemoryFailure(error)){if(entry){unpin(entry);entry=null;}return await result.readWindow(rect,options);}
    throw error;
   }finally{if(entry)unpin(entry);done();}
  }

  async function sampleFrozen(g,signal){
   let output;
   try{
    output=ownedArray(Uint8Array,3*g.width*g.height,'revelation uncached RGB8 sample');let sourceBytes=0;
    for(let row=0;row<g.height;row++){
     checkAbort(signal);let part,primary;
     try{
      part=await result.readWindow({x:g.x,y:g.y+row*g.step,width:g.w,height:1},{format:'rgb8',signal});sourceBytes+=part.byteLength;
      for(let col=0;col<g.width;col++)for(let c=0;c<3;c++)output.data[3*(row*g.width+col)+c]=part.data[3*col*g.step+c];
     }catch(error){primary=error;}
     await retire([part],primary);
    }
    checkAbort(signal);const owner=output;let live=true;
    const sampled={pixels:{width:g.width,height:g.height,format:'rgb8',data:output.data},metrics:{sourceBytes},release(){if(!live)return;owner.release();live=false;sampled.pixels.data=null;}};
    output=null;return sampled;
   }catch(error){if(output)await retire([output],error);throw error;}
  }

  async function readSampledWindow(tile,{signal}={}){
   open();const g=displayGeometry(result,tile);
   if(g.step===1){const window=await readWindow({x:g.x,y:g.y,width:g.w,height:g.h},{format:'rgb8',signal});return {pixels:{width:g.width,height:g.height,format:'rgb8',data:window.data},release:window.release,metrics:{sourceBytes:window.byteLength}};}
   state.pending++;let entry;
   try{
    checkAbort(signal);
    if(!decline()&&!state.cacheDisabled&&!family.retired)entry=await basis(g,signal);
    if(!entry)return await sampleFrozen(g,signal);
    const window=await render(entry,g.width,g.height,signal);
    return {pixels:{width:g.width,height:g.height,format:'rgb8',data:window.data},release:window.release,metrics:{sourceBytes:g.width*g.height*BASIS_BYTES_PER_PIXEL}};
   }catch(error){
    if(!signal?.aborted&&optionalMemoryFailure(error)){if(entry){unpin(entry);entry=null;}return await sampleFrozen(g,signal);}
    throw error;
   }finally{if(entry)unpin(entry);done();}
  }

  async function release(){
   if(state.released)return;if(state.retiring)return state.retiring;
   if(state.pending)throw new EngineError('BUSY','Await active SHERLOQ result reads before releasing their state.');
   state.releaseRequested=true;
   state.retiring=(async()=>{await retire();await releasePair();await result.release();state.released=true;states.delete(state);})().finally(()=>{state.retiring=null;});
   return state.retiring;
  }
  state.clear=async()=>{state.cacheDisabled=true;await idle();await retire();await releasePair();};
  return Object.freeze({...result,readWindow,readSampledWindow,release});
 }

 async function clear(){
  for(const family of [...families.values()])invalidate(family);
  const errors=[];for(const state of [...states])try{await state.clear();}catch(error){errors.push(error);}
  if(errors.length)throw cleanupFailure(null,errors);
 }
 async function dispose(){closed=true;unregister?.();await clear();}
 return Object.freeze({wrap,clear,dispose,memory:()=>({bytes,entries:lru.size,families:families.size,maximumBytes,closed})});
}
