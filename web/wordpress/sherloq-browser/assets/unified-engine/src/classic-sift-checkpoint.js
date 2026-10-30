import "../../runtime-context.js?v=0.30.0";
import {requireValue,normalizeResourceError} from './errors.js';
import {classicSiftRetirement,classicSiftRetireAll} from './classic-sift-retirement.js';
let sequence=0;
// Same append/publication order as SiftPointPages, with acknowledged owners.
export class ClassicSiftPointPages{
 constructor(Type,width,account,{pageRows=16384}={}){Object.assign(this,{Type,width,account,pageRows});this.pages=[];this.orphans=[];this.length=0;}
 push(...row){requireValue(row.length===this.width,'Invalid SIFT point width');let page=this.pages.at(-1);if(!page||page.used===page.capacity){let capacity=this.pageRows,release;for(;;){try{release=this.account(capacity*this.width*this.Type.BYTES_PER_ELEMENT+128);break;}catch(error){if(error?.code!=='MEMORY_LIMIT'||capacity===1)throw error;capacity=Math.max(1,Math.floor(capacity/2));}}const item={data:null,capacity,used:0,start:this.length,release,backing:null};this.orphans.push(item);item.data=new this.Type(capacity*this.width);item.backing=this.account.backing?.(item.data,'sift-point-page');this.orphans.pop();page=item;this.pages.push(page);}page.data.set(row,page.used*this.width);page.used++;this.length++;}
 append(array){requireValue(array instanceof this.Type&&array.length%this.width===0,'Invalid SIFT point page');const length=this.length,count=this.pages.length,used=this.pages.at(-1)?.used;try{for(let i=0;i<array.length;i+=this.width)this.push(...array.subarray(i,i+this.width));}catch(error){this.orphans.push(...this.pages.splice(count));if(count)this.pages[count-1].used=used;this.length=length;throw normalizeResourceError(error,{allocationKind:'array-buffer',requestedBytes:array.byteLength});}}
 async finish(){const bytes=this.length*this.width*this.Type.BYTES_PER_ELEMENT;this.account(bytes);const output=new this.Type(this.length*this.width);for(const page of this.pages)output.set(page.data.subarray(0,page.used*this.width),page.start*this.width);this.account.backing?.(output,'sift-ranked-raw');await this.dispose();return output;}
 async dispose(){await classicSiftRetireAll([...this.orphans,...this.pages].map(page=>async()=>{await page.backing?.();page.backing=null;await page.release?.();page.release=null;page.data=null;const list=this.pages.includes(page)?this.pages:this.orphans;const i=list.indexOf(page);if(i>=0)list.splice(i,1);}));}
}
export function createClassicSiftCheckpoint(){
 const state={id:++sequence,stores:new Map(),frees:[],backings:[],units:new Set(),values:new Map(),pending:new Map(),metrics:null};
 let closing;state.dispose=()=>{state.retiring=true;if(closing)return closing;const task=(async()=>{await classicSiftRetireAll([...state.stores].map(([key,store])=>async()=>{await store.dispose();state.stores.delete(key);}));await state.pages?.dispose();state.pages=null;await classicSiftRetireAll(state.backings.map(free=>async()=>{await free();const i=state.backings.indexOf(free);if(i>=0)state.backings.splice(i,1);}));await classicSiftRetireAll(state.frees.map(free=>async()=>{await free();const i=state.frees.indexOf(free);if(i>=0)state.frees.splice(i,1);}));await classicSiftRetireAll([...state.pending].map(([key,owned])=>async()=>{await owned.release?.();state.pending.delete(key);}));await state.freeResult?.();state.freeResult=null;state.values.clear();state.units.clear();state.bases=[];state.raw=null;state.selected=null;state.descriptors=null;state.descriptorBacking=null;})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;};return state;
}
export async function runClassicSiftCheckpointStage(state,pool,label,jobs,make,accept){
 const units=jobs.map((job,index)=>({job,key:label+':'+index})).filter(unit=>!state.units.has(unit.key));
 const publish=async(result,unit)=>{let owned=state.pending.get(unit.key);if(!owned){owned={result,release:result.retainOwnership?.(),accepted:false};state.pending.set(unit.key,owned);}if(!owned.accepted){await accept(result,unit.job);owned.accepted=true;}await owned.release?.();state.units.add(unit.key);state.pending.delete(unit.key);};
 for(const unit of units){const owned=state.pending.get(unit.key);if(owned)await publish(owned.result,unit);}
 await pool.run(units.filter(unit=>!state.units.has(unit.key)),(unit,hooks)=>make(unit.job,hooks),publish);
}
// The original continuation publication order is kept; only its releases await.
export async function acceptClassicSiftContinuationBatch(round,groupIndex,group,result,pages,frees){
 let record=round.groups.get(groupIndex);if(!record){requireValue(result.statuses.length===group.indices.length&&result.states.length===group.indices.length*4&&result.offsets.length===group.indices.length+1,'Invalid SIFT continuation shape');record={result,remaining:group.indices.length,release:result.retainOwnership?.()};round.groups.set(groupIndex,record);const retire=classicSiftRetirement([()=>record.release?.()],()=>{record.result=null;record.release=null;});record.retire=retire;frees.push(retire);for(let local=0;local<group.indices.length;local++)round.slots[group.indices[local]]={record,local};}
 if(record.remaining===0)await record.retire();
 while(round.published<round.count){const slot=round.slots[round.published];if(!slot)break;const{record,local}=slot,value=record.result,status=value.statuses[local];if(status===1)round.again.push({state:Array.from(value.states.subarray(local*4,local*4+4))});else pages.append(value.points.subarray(value.offsets[local],value.offsets[local+1]));round.slots[round.published++]=null;if(--record.remaining===0)await record.retire();}
}
