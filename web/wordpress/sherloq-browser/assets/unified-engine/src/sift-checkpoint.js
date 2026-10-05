import "../../runtime-context.js?v=0.14.5";
import {TypedPages} from './m3-typed-pages.js';
import {normalizeResourceError} from './errors.js';

// An append is one publication: allocation failure cannot expose a prefix and
// duplicate it when the same already-computed native tile is consumed again.
export class SiftPointPages extends TypedPages{
 finish(){const bytes=this.length*this.width*this.Type.BYTES_PER_ELEMENT,release=this.account(bytes);let output;try{output=new this.Type(this.length*this.width);for(const page of this.pages)output.set(page.data.subarray(0,page.used*this.width),page.start*this.width);}catch(error){release?.();throw normalizeResourceError(error,{allocationKind:'array-buffer',requestedBytes:bytes});}this.account.backing?.(output,'sift-ranked-raw');for(const page of this.pages){page.data=null;page.backing?.();page.release?.();}this.pages=[];return output;}
 append(array){
  const length=this.length,count=this.pages.length,used=this.pages.at(-1)?.used;
  try{super.append(array);for(const page of this.pages)page.backing??=this.account.backing?.(page.data,'sift-point-page');}catch(error){
   for(const page of this.pages.splice(count)){page.data=null;page.backing?.();page.release?.();}
   if(count)this.pages[count-1].used=used;this.length=length;
   throw normalizeResourceError(error,{allocationKind:'array-buffer',requestedBytes:array.byteLength});
  }
 }
}
let nextCheckpoint=0;
export function createSiftCheckpoint(){
 return {id:++nextCheckpoint,stores:new Map(),frees:[],units:new Set(),values:new Map(),pending:new Map(),metrics:null,
  async dispose(){for(const store of this.stores.values())await store.dispose();this.stores.clear();this.pages?.dispose();this.pages=null;for(const free of this.frees)free();this.frees=[];for(const value of this.pending.values())value.release?.();this.pending.clear();this.values.clear();this.units.clear();this.bases=[];this.raw=null;this.selected=null;this.descriptors=null;this.descriptorBacking=null;this.freeResult?.();this.freeResult=null;}
 };
}
export async function runSiftCheckpointStage(state,pool,label,jobs,make,accept){
 const units=jobs.map((job,index)=>({job,key:label+':'+index})).filter(unit=>!state.units.has(unit.key));
 const publish=async(result,unit)=>{if(!state.pending.has(unit.key))state.pending.set(unit.key,{result,release:result.retainOwnership?.()});await accept(result,unit.job);state.units.add(unit.key);const owned=state.pending.get(unit.key);state.pending.delete(unit.key);owned.release?.();};
 // A terminal publication refusal retains its already-computed native output.
 // An explicit resume consumes that owner before dispatching any new work.
 for(const unit of units){const owned=state.pending.get(unit.key);if(owned)await publish(owned.result,unit);}
 await pool.run(units.filter(unit=>!state.units.has(unit.key)),(unit,hooks)=>make(unit.job,hooks),publish);
}
