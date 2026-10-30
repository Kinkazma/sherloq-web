import "../../runtime-context.js?v=0.30.0";
import {createRetainedSparseTraceCommands} from './retained-sparse-trace-commands.js';
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,countedDenseOwner} from './dense-owner-retirement.js';
import {copyTypedArray} from './allocation.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';

const bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const equal=(a,b)=>{if(!ArrayBuffer.isView(a)||!ArrayBuffer.isView(b)||a.constructor!==b.constructor||a.byteLength!==b.byteLength)return false;const x=bytes(a),y=bytes(b);return x.every((v,i)=>v===y[i]);};
const identityKey=x=>JSON.stringify(x);
// A parent is adopted by the existing published-surface owner before capture.
// It holds only immutable selector inputs, never the public transferred arrays.
export function createRetainedSparseTraceParent({result,identity,budget,onOwner,signal,headroomBytes=0}){
 requireValue(typeof onOwner==='function','Trace snapshot must be adopted before construction.');checkAbort(signal);
 const groups=result?.groups;
 requireValue((result?.points instanceof Float64Array||result?.points instanceof Float32Array)&&result.pairs instanceof Float64Array&&result.colors instanceof Uint8Array&&Array.isArray(groups)&&groups.every(g=>g instanceof Uint32Array),'Complete Native trace tables are required.');
 // No completed selection can be reused here. Preserve the literal empty
 // presentation, without creating an optional zero-byte backing owner.
 if(!result.points.byteLength||!result.pairs.byteLength||!result.colors.byteLength||!groups.some(g=>g.length))return null;
 const charge=result.points.byteLength+result.pairs.byteLength+result.colors.byteLength+groups.reduce((n,g)=>n+g.byteLength,0)+4096+groups.length*128;
 requireValue(Number.isSafeInteger(charge),'Trace snapshot size');
 requireValue(Number.isSafeInteger(headroomBytes)&&headroomBytes>=0,'Historical frame headroom required.');
 if(budget.recovering||budget.limit-budget.total()<charge+headroomBytes)return null;
 let snapshot,credit,commands,retiring=false,disabled=false,finish;
 const constructed=new Promise(resolve=>finish=resolve),arrays=[];
 const drop=onceDenseRetirement(async()=>{
  if(commands)await commands.dispose();
  await retireDenseOwners(arrays.map(record=>async()=>{await acknowledgeDenseRetirement(()=>record.backing?.());record.backing=null;record.data=null;}));
  snapshot=null;await acknowledgeDenseRetirement(()=>credit?.());credit=null;
 });
 const references=countedDenseOwner(async()=>{retiring=true;await constructed;await drop();});
 const owner={
  dispose:()=>references.release(),
  retain(){requireValue(!retiring&&!disabled,'Trace snapshot is retiring.');references.retain();return{dispose:onceDenseRetirement(()=>owner.dispose())};},
  matches(native,actualIdentity){return !retiring&&!disabled&&!!snapshot&&identityKey(actualIdentity)===identityKey(identity)&&equal(native?.points,snapshot.points)&&equal(native?.pairs,snapshot.pairs)&&equal(native?.colors,snapshot.colors)&&Array.isArray(native?.groups)&&native.groups.length===snapshot.groups.length&&native.groups.every((g,i)=>equal(g,snapshot.groups[i]));},
  async prepareFrame(requiredBytes){requireValue(Number.isSafeInteger(requiredBytes)&&requiredBytes>=0,'Complete historical admission bound required.');if(retiring)throw new EngineError('DISPOSED','Trace snapshot is retiring.');if(disabled){await drop();return;}if(budget.limit-budget.total()<requiredBytes){disabled=true;await drop();return;}await commands.prepareFrame(requiredBytes);},
  async select(native,selectedGroups,view,options){requireValue(!retiring&&!disabled&&snapshot,'Trace snapshot is unavailable.');requireValue(equal(native.points,snapshot.points)&&equal(native.pairs,snapshot.pairs),'Native trace inputs changed.');return commands.select(snapshot,selectedGroups,view,options);},
  get stats(){return{retiring,disabled,references:references.references,snapshotBytes:credit?charge:0,...(commands?commands.stats:{})};}
 };
 onOwner(owner);
 try{
  // Capture the identity as bytes/values before it can be changed by its caller.
  identity=structuredClone(identity);credit=budget.reserve(charge);
  const capture=(input,label)=>{const record={data:null,backing:null};arrays.push(record);record.data=copyTypedArray(input,{label});if(record.data.byteLength)record.backing=budget.registerBacking('array-buffer',record.data.byteLength,{owner:'retained-sparse-trace',label,identity:record.data.buffer});return record.data;};
  snapshot={points:capture(result.points,'private Native trace points'),pairs:capture(result.pairs,'private Native trace pairs'),colors:capture(result.colors,'private Native trace colors'),groups:groups.map(g=>capture(g,'private Native trace group'))};
  commands=createRetainedSparseTraceCommands({result:snapshot,budget});checkAbort(signal);return Object.freeze(owner);
 }finally{finish();}
}

// Strong pre-publication adoption uses the same registry already drained by
// engine run/unload/dispose. A surface takes this reference before the registry
// callback becomes a no-op; neither failure nor a primitive rejection loses it.
export async function borrowRetainedSparseTraceParent({previous,result,identity,budget,signal,headroomBytes=0}){
 const pool=new WaveletStripPool(budget,{workerFactory:null,resourceOwner:'ssg'}),constructionOwners=new Set();let parent,reference,attached,transferred=false,retireRequested=false;
 const registered=pool.ownCleanup(async()=>{if(!transferred){retireRequested=true;await retireDenseOwners([...constructionOwners,...(attached?[()=>attached.dispose()]:[]),()=>reference?.dispose()]);}});
 const current=()=>{checkAbort(signal);requireValue(!retireRequested,'Trace construction owner is retiring.');};
 try{
  if(previous){await previous.prepareFrame(headroomBytes);current();if(previous.matches(result,identity)){parent=previous;reference=parent.retain();}}
  if(!parent)parent=createRetainedSparseTraceParent({result,identity,budget,signal,headroomBytes,onOwner:value=>{parent=value;reference=value;}});
  if(!parent){await registered.retire();return null;}
  const api={parent,
   adopt(owner){current();requireValue(owner&&typeof owner.dispose==='function','Construction owner required before allocation.');constructionOwners.add(owner);},
   async attach(surface){
    current();requireValue(!attached&&!transferred&&surface&&typeof surface.dispose==='function','One trace parent per published surface required.');
    if(parent.stats.disabled){await registered.retire();return null;}
    requireValue(parent.matches(result,identity),'Exact trace parent changed before publication.');
    const original=surface.dispose.bind(surface),held=reference;
    surface.dispose=onceDenseRetirement(()=>retireDenseOwners([original,()=>held.dispose()]));
    attached=surface;return parent;
   },
   async commit(){current();requireValue(attached&&!transferred,'The real published surface registry must first adopt the attached disposer.');transferred=true;await registered.retire();},
   async publish(surface){const value=await api.attach(surface);if(value)await api.commit();return value;},
   dispose:()=>registered.retire()
  };return Object.freeze(api);
 }catch(primary){try{await registered.retire();}catch{}throw primary;}
}
