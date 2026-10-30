import "../../runtime-context.js?v=0.30.0";
import {createSsgWordCooperator} from './ssg-word-task-checkpoint.js';
import {WaveletStripPool,appendWaveletCleanup} from './wavelet-strip-pool.js';
import {checkAbort,requireValue,EngineError} from './errors.js';

// Source-local lifetime only. The task cadence/ports/4KiB admission remain in
// the common SSG checkpoint helper; this parent owns its existing pending set.
const settle=async actions=>{let failed=false,primary;const rows=await Promise.allSettled(actions.map(async run=>run()));for(const row of rows)if(row.status==='rejected'){if(!failed){failed=true;primary=row.reason;}else appendWaveletCleanup(primary,row.reason);}if(failed)throw primary;};
export function createSsgSourceTaskOwner({budget,signal}={}){
 requireValue(budget?.reserve&&budget?.registerReclaimer,'Source task parent requires its actual budget');
 const pool=new WaveletStripPool(budget,{workerFactory:null,resourceOwner:'ssg'}),pendingOwners=new Set(),jobs=new Set(),loans=new Set(),life=new AbortController();
 let sealed=false,sealConstruction,retireSource,closed=false,retired=false,parent;
 const constructed=new Promise(resolve=>sealConstruction=resolve),selected=AbortSignal.any([signal,life.signal].filter(Boolean));
 const drainTasks=({all=false}={})=>settle([...pendingOwners].filter(owner=>all||owner.retiring).map(owner=>()=>owner.dispose()));
 const loan=value=>{
  let requested=false,done=false,pending,finish;const acknowledged=new Promise(resolve=>finish=resolve);
  const entry={published:false,get requested(){return requested;},get done(){return done;},acknowledged,
   release(){if(done)return pending;if(pending)return pending;requested=true;const task=Promise.resolve().then(()=>value.release()).then(()=>{done=true;loans.delete(entry);finish();});pending=task;void task.finally(()=>{if(!done&&pending===task)pending=null;}).catch(()=>{});return task;}
  };loans.add(entry);return{entry,value:{...value,release:entry.release}};
 };
 const close=async()=>{
  closed=true;life.abort();await constructed;
  await Promise.all([...jobs].map(job=>job.catch(()=>{})));
  await settle([()=>drainTasks({all:true}),...([...loans].map(entry=>()=>entry.requested?entry.release():entry.published?entry.acknowledged:entry.release()))]);
  if(retireSource){await retireSource();retireSource=null;}retired=true;
 };
 const api={
  signal:selected,
  installSource(retire){requireValue(!sealed&&typeof retire==='function'&&!retireSource,'One source disposer before construction seal');retireSource=retire;},
  seal(){if(sealed)return;sealed=true;sealConstruction();},
  cooperator(readSignal){return createSsgWordCooperator(readSignal,{budget,pendingOwners});},
  async read(readSignal,run){
   requireValue(typeof run==='function'&&sealed,'One unchanged source read after construction seal required');if(closed)throw new EngineError('DISPOSED','SSG source parent is retiring');
   const combined=AbortSignal.any([selected,readSignal].filter(Boolean));checkAbort(combined);let finish,held;const job=new Promise(resolve=>finish=resolve);jobs.add(job);
   try{await drainTasks();checkAbort(combined);const value=await run(combined);held=loan(value);checkAbort(combined);held.entry.published=true;return held.value;}
   catch(primary){if(held)try{await held.entry.release();}catch(cleanup){appendWaveletCleanup(primary,cleanup);}throw primary;}
   finally{jobs.delete(job);finish();}
  },
  dispose(){return parent.retire();},
  get snapshot(){return{closed,retired,sealed,activeReads:jobs.size,borrows:loans.size,pendingTasks:pendingOwners.size};}
 };
 // The existing budget registry keeps this callback strongly before Source can
 // allocate metadata, await construction, publish a borrow or create any port.
 parent=pool.ownCleanup(close);return Object.freeze(api);
}
