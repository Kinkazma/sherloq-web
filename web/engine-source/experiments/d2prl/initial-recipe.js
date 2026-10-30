import {reserveNativeMpsCalendars} from './paired-random.js';
import {fillNativeMpsSource} from './random-mps.js';
import {initialOffsets} from './candidates.js';
import {preserveConvolutionPrimary} from './convolution-retirement.js';
import {requireValue,checkAbort,normalizeResourceError} from '../../src/errors.js';

// Only this module can certify a recipe. It is never a materialized host frame.
const recipes=new WeakMap();
export function borrowInitialRecipe(recipe){
 const entry=recipes.get(recipe);requireValue(entry,'Private initial recipe required');return entry.borrow();
}

export async function createInitialRecipe({budget,random,adoptOwner,side=448}={}){
 requireValue(budget?.reserve&&typeof adoptOwner==='function'&&side===448,'Whole448 initial recipe parent required');
 const n=side*side,life=new AbortController(),readers=new Set(),replays=new Set(),errors=[];
 let fee,ticket,accepted=false,closed=false,retired=false,closing,accepting,materializing,cached,finishConstruction;
 const constructed=new Promise(resolve=>finishConstruction=resolve),stats={materializations:0,detachedSourceFills:0};
 const recipe=Object.freeze({kind:'d2prl-private-initial-four-source-recipe/1',side});
 const remember=error=>{if(errors.length<64&&!errors.some(x=>Object.is(x,error)))errors.push(error);};
 const retireReplay=async record=>{
  if(record.backing){await record.backing();record.backing=null;}
  if(record.fee){await record.fee();record.fee=null;}
  record.data=null;replays.delete(record);
 };
 const drain=async()=>{let failed=false,primary;for(const row of await Promise.allSettled([...replays].map(retireReplay)))if(row.status==='rejected'){
  remember(row.reason);if(!failed){failed=true;primary=row.reason;}else preserveConvolutionPrimary(primary,row.reason);
 }if(failed)throw primary;};
 const owner={
  get recipe(){requireValue(accepted&&!closed,'Accepted open initial recipe required');return recipe;},
  get accepted(){return accepted;},get retired(){return retired;},get retirementErrors(){return[...errors];},get stats(){return{...stats};},
  snapshots(){requireValue(ticket,'Initial calendar prepared');return ticket.snapshots;},
  releaseMaterialized(){requireValue(!materializing&&replays.size===0,'H0 replay ACK before caller reuses its checkpoint');cached=null;},
  accept({operation=(_label,work)=>work(),signal}={}){
   requireValue(!closed&&!accepting,'Initial acceptance available');const selected=AbortSignal.any([signal,life.signal].filter(Boolean));checkAbort(selected);
   if(accepted)return Promise.resolve(recipe);
   const task=(async()=>{const value=await operation('patchmatch:initial-offsets',async()=>{checkAbort(selected);return recipe;});checkAbort(selected);
    requireValue(value===recipe,'Operation accepts its original recipe');ticket.commitPrefix(1);accepted=true;return recipe;
   })();accepting=task;void task.finally(()=>{if(accepting===task)accepting=null;}).catch(()=>{});return task;
  },
  // Error replay only. The caller already owns a disjoint 4N host checkpoint.
  // One N scratch is admitted before any write; refusal leaves the recipe live.
  materialize(output,{signal}={}){
   requireValue(!closed&&accepted&&!materializing&&output instanceof Float32Array&&output.length===4*n,'One caller-owned H0 checkpoint required');
   const selected=AbortSignal.any([signal,life.signal].filter(Boolean));checkAbort(selected);
   const task=(async()=>{
    await drain();checkAbort(selected);
    if(cached){requireValue(cached.output===output,'Retry uses the same H0 owner');return cached.pairs;}
    const record={fee:null,backing:null,data:null};replays.add(record);let primary,failed=false;
    try{
     record.fee=budget.reserve(4*n+1024);checkAbort(selected);
     try{record.data=new Float32Array(n);}catch(error){throw normalizeResourceError(error,{requestedBytes:4*n,allocationKind:'array-buffer',allocation:'initial-recipe-replay-scratch'});}
     record.backing=budget.registerBacking?.('array-buffer',4*n,{owner:'d2prl',label:'initial-recipe-replay-scratch',identity:record.data.buffer});
     let sourceIndex=0,planeIndex=0;const calendar=ticket.calendars[0];
     const pairs=await initialOffsets(side,{async values(count){requireValue(count===n&&sourceIndex<4,'Four initial sources in native order');const source=calendar.sources[sourceIndex++];
      await fillNativeMpsSource({counter:source.counter,key:calendar.key,output:record.data},{signal:selected});stats.detachedSourceFills++;return record.data;
     }},{signal:selected,allocate:count=>{requireValue(count===n&&planeIndex<4,'Four admitted offset planes');return output.subarray(planeIndex++*n,planeIndex*n);}});
     requireValue(sourceIndex===4&&planeIndex===4,'Complete native initial replay');checkAbort(selected);cached={output,pairs};stats.materializations++;return pairs;
    }catch(error){failed=true;primary=error;throw error;}
    finally{try{await retireReplay(record);}catch(cleanup){remember(cleanup);if(failed)preserveConvolutionPrimary(primary,cleanup);else throw cleanup;}}
   })();materializing=task;void task.finally(()=>{if(materializing===task)materializing=null;}).catch(()=>{});return task;
  },
  dispose(){
   if(retired)return Promise.resolve();if(closing)return closing;closed=true;life.abort();
   const task=(async()=>{await constructed;await accepting?.catch(()=>{});await materializing?.catch(()=>{});await Promise.all([...readers].map(r=>r.done));
    await drain();ticket?.rollback();await fee?.();fee=null;cached=null;recipes.delete(recipe);retired=true;
   })().catch(error=>{remember(error);throw error;});closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;
  }
 };
 recipes.set(recipe,{borrow(){
  requireValue(accepted&&!closed,'Accepted live initial recipe');let finish,released=false;const reader={done:new Promise(resolve=>finish=resolve)};readers.add(reader);
  const calendar=ticket.calendars[0];return Object.freeze({side,count:n,sources:calendar.sources,key:calendar.key,
   release(){if(released)return;released=true;readers.delete(reader);finish();}});
 }});
 let failed=false,primary;
 try{adoptOwner(owner);checkAbort(life.signal);fee=budget.reserve(16384);ticket=reserveNativeMpsCalendars(random,[[n,n,n,n]]);checkAbort(life.signal);}
 catch(error){failed=true;primary=error;}finally{finishConstruction();}
 if(failed){try{await owner.dispose();}catch(cleanup){preserveConvolutionPrimary(primary,cleanup);}throw primary;}
 return owner;
}
