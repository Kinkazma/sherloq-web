import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createEnergyStatisticsRuntime,ENERGY_STATISTICS_RUNTIME_BYTES,ENERGY_STATISTICS_RUNTIME_INITIALIZATION_BYTES} from './energy-statistics-runtime.js';

// Private, native-grid preparation inputs. No array is exposed through the
// borrowed UI facade; every score result still owns its scope/low/high arrays.
const contexts=new WeakMap(),VERSION='energy-raw-preparation/1';
export function readEnergyPreparationContext(handle){const state=contexts.get(handle);requireValue(state?.ready&&!state.closed&&!state.retiring,'A live native Energy preparation context is required.');return state;}
export function retainEnergyPreparationContext(handle){const state=readEnergyPreparationContext(handle);requireValue(!state.retiring,'Native Energy preparation context is retiring.');const pins=[];try{for(const row of state.backings)if(!row.closed){const pin=row.release?.pin?.();if(pin)pins.push(pin);}}catch(error){for(const free of pins)free();throw error;}state.refs++;let freed=false;return()=>{if(!freed){freed=true;for(const free of pins)free();state.refs--;}};}
export function energyPreparationContextVersion(){return VERSION;}

// Overlapping native panels select before the final scope is overwritten. The
// UI selects against that final scope. Reuse is admitted only when the two
// memberships are provably identical, rather than silently changing either.
export function energyPreparationContextPlan(width,height,planeCount,polygons){
 const n=width*height;if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096||n>=2**31||![1,3].includes(planeCount)||!Array.isArray(polygons)||!polygons.length)return null;
 let area=0,maximumArea=0;const boxes=[];for(const p of polygons){if(!Array.isArray(p)||p.length!==4||p.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isInteger)))return null;const [[x0,y0],b,[x1,y1],d]=p;if(x0<0||y0<0||x1>=width||y1>=height||x0>x1||y0>y1||b[0]!==x1||b[1]!==y0||d[0]!==x0||d[1]!==y1)return null;const box=[x0,y0,x1+1,y1+1];if(boxes.some(a=>a[0]<box[2]&&box[0]<a[2]&&a[1]<box[3]&&box[1]<a[3]))return null;boxes.push(box);const pixels=(x1-x0+1)*(y1-y0+1);area+=pixels;maximumArea=Math.max(maximumArea,pixels);}
 const bytes=n*(planeCount*4+5)+area*planeCount*8+8192+polygons.length*4096,workingBytes=maximumArea*4+2048;
 return{width,height,planeCount,n,boxes,bytes,workingBytes};
}

export function createEnergyPreparationContextOwner(budget,{statisticsRuntimeFactory=createEnergyStatisticsRuntime}={}){
 let current=null,closed=false,closing=false,active=0,disposing;const debts=new Set();
 const closeState=async state=>{if(state.closed)return;if(state.refs)throw new EngineError('BUSY','Borrowed Energy preparation context is active.');state.retiring=true;if(state.statisticsReducer){state.statisticsPin?.();state.statisticsPin=null;const retired=await state.statisticsReducer.dispose();if(retired===false||retired===0)throw new EngineError('BUSY','Energy statistics runtime retirement awaits ACK.');state.statisticsReducer=null;}for(const row of state.backings){if(row.closed)continue;const retired=await row.release?.();row.closed=true;row.data=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??row.bytes);}state.planes=state.valid=state.scope=null;state.panels.length=0;state.workRelease?.();state.release();state.closed=true;debts.delete(state);if(current===state)current=null;};
 const retire=async state=>{debts.add(state);await closeState(state);};
 const drain=async()=>retireCompositeOwners([...debts].map(state=>()=>retire(state)));
 const reclaimIdle=async()=>{if(active||current?.refs||closed)return 0;const before=budget.total();await drain();if(current)await retire(current);return Math.max(0,before-budget.total());};
 const unregister=budget.registerAsyncReclaimer?.(reclaimIdle,{owner:'energy-preparation-context',label:'idle-native-raw-preparation',allocationKind:'array-buffer'});
 const api={
  get empty(){return!current&&!debts.size;},
  reclaimIdle,
  lookup(key){if(closed||closing||current?.key!==key||!current.ready||current.retiring)return null;return current.handle;},
  find(identity){if(closed||closing||current?.handle.identity!==identity||!current.ready||current.retiring)return null;return current.handle;},
  async begin(key,width,height,planeCount,polygons,{signal,minimumHeadroom=0}={}){
   requireValue(!closed&&!closing&&typeof key==='string','A live native preparation owner and identity are required.');checkAbort(signal);
   active++;let state,handedOff=false,allocationFailure=null,admissionFailure=null;
   try{
    // A failed ACK is a live debt, never an optional cache miss that permits
    // unrelated preparation to allocate before its owner has retired.
    await drain();if(current?.key===key&&current.ready&&!current.retiring)return null;
    const plan=energyPreparationContextPlan(width,height,planeCount,polygons);if(!plan||budget.recovering||budget.isBackingUnderPressure?.('array-buffer'))return null;
    // Optional reuse never evicts useful native fields to force admission.
    if(budget.total()+plan.bytes+plan.workingBytes+minimumHeadroom>budget.limit)return null;
    if(current)await retire(current);checkAbort(signal);
    const handle=Object.freeze({identity:VERSION+'/'+crypto.randomUUID()});let release,workRelease;try{release=budget.reserve(plan.bytes);workRelease=budget.reserve(plan.workingBytes);}catch(error){release?.();if(error?.code==='MEMORY_LIMIT')admissionFailure=error;throw error;}state={...plan,key,handle,release,workRelease,backings:[],panels:[],ready:false,closed:false,retiring:false,refs:0};debts.add(state);
    const allocate=(Type,length,label)=>{let data;try{data=allocateTypedArray(Type,length,{label:'energy-preparation-context-'+label});}catch(error){if(error?.code==='MEMORY_ALLOCATION')allocationFailure=error;throw error;}const row={data,bytes:data.byteLength,closed:false};state.backings.push(row);row.release=budget.registerBacking?.('array-buffer',data.byteLength,{owner:'energy-preparation-context',label,identity:data.buffer});return data;};
    state.planes=allocate(Float32Array,plan.n*planeCount,'planes');state.valid=allocate(Uint8Array,plan.n,'valid');state.scope=allocate(Int32Array,plan.n,'scope');
    for(let i=0;i<polygons.length;i++){const box=plan.boxes[i],capacity=(box[2]-box[0])*(box[3]-box[1]),row={id:i+1,bbox:box,count:0,values:[],sorted:[]};for(let q=0;q<planeCount;q++){row.values.push(allocate(Float32Array,capacity,'raster-'+i+'-'+q));row.sorted.push(allocate(Float32Array,capacity,'sorted-'+i+'-'+q));}state.panels.push(row);}
    const scratch=allocate(Uint32Array,(plan.workingBytes-2048)/4,'sort-scratch'),hist=allocate(Uint32Array,256,'sort-histogram'),positions=allocate(Uint32Array,256,'sort-positions'),workRows=state.backings.slice(-3),cooperate=createCooperator(signal);
    const retireWork=async()=>{for(const row of workRows)if(!row.closed){const retired=await row.release?.();row.closed=true;row.data=null;if(retired!==0)budget.notifyBackingRelease?.('array-buffer',retired??row.bytes);}state.workRelease();state.workRelease=null;};
    // The optional reducer owns and funds its one Wasm page. Keep the same
    // native headroom and never make a valid RawCTX depend on SIMD availability.
    if(statisticsRuntimeFactory&&!budget.recovering&&!budget.isBackingUnderPressure?.('wasm')&&budget.total()+ENERGY_STATISTICS_RUNTIME_BYTES+ENERGY_STATISTICS_RUNTIME_INITIALIZATION_BYTES+minimumHeadroom<=budget.limit){
     state.statisticsReducer=await statisticsRuntimeFactory({budget,signal});
     requireValue(state.statisticsReducer==null||typeof state.statisticsReducer.reduce==='function'&&typeof state.statisticsReducer.dispose==='function','Invalid native Energy statistics runtime.');if(state.statisticsReducer)state.statisticsPin=state.statisticsReducer.pin?.();
    }
    let settled=false;const capture={
     get statisticsReducer(){return state.statisticsReducer;},
     planes(data,offset=0){state.planes.set(data,offset);},valid(data,offset=0){state.valid.set(data,offset);},scope(data,offset=0){state.scope.set(data,offset);},
     panel(index,count){state.panels[index].count=count;},
     values(index,q,data,offset=0){state.panels[index].values[q].set(data,offset);},
     async sorted(index,q){const row=state.panels[index],target=row.sorted[q].subarray(0,row.count);target.set(row.values[q].subarray(0,row.count));const words=new Uint32Array(target.buffer,target.byteOffset,target.length);let source=words,destination=scratch;
      // The same four unsigned radix passes as native prepareEnergy, with a
      // cooperative checkpoint every8192 samples instead of a blocking sort.
      for(let shift=0;shift<32;shift+=8){hist.fill(0);for(let i=0;i<row.count;i++){hist[(source[i]>>>shift)&255]++;if((i&8191)===0)await cooperate();}let total=0;for(let j=0;j<256;j++){positions[j]=total;total+=hist[j];}for(let i=0;i<row.count;i++){const word=source[i];destination[positions[(word>>>shift)&255]++]=word;if((i&8191)===0)await cooperate();}[source,destination]=[destination,source];}return target;},
     async finish(){checkAbort(signal);requireValue(!settled,'Native preparation capture already settled.');await retireWork();checkAbort(signal);settled=true;active--;state.panels=state.panels.filter(row=>row.count>=64);state.ready=true;contexts.set(handle,state);current=state;debts.delete(state);budget.notifyReclaimable?.();return handle;},
     async dispose(){if(!settled){settled=true;active--;await retire(state);}},
    };handedOff=true;return capture;
   }catch(error){if(state){let retired=false;await retireCompositeOwners([async()=>{await retire(state);retired=true;}],{primary:error});if(retired&&allocationFailure!==null&&error===allocationFailure&&!signal?.aborted)return null;}if(admissionFailure!==null&&error===admissionFailure&&!signal?.aborted)return null;throw error;}
   finally{if(!handedOff)active--;}
  },
  dispose(){if(closed)return Promise.resolve();if(disposing)return disposing;if(active)return Promise.reject(new EngineError('BUSY','Native Energy preparation capture is active.'));closing=true;const task=(async()=>{await drain();if(current)await retire(current);unregister?.();closed=true;})();disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task;},
 };
 return api;
}
