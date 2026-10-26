import "../../runtime-context.js?v=0.25.0";
import {requireValue} from './errors.js';

// The reached disposal/release interfaces succeed with void/Promise<void>.
// Preserve primitive rejections. A resolved 0/false is not a valid void ACK;
// this is not used for GPU reclaimers, whose false result is meaningful.
export async function acknowledgeDenseRetirement(retire){
 const result=await retire();if(result===0||result===false)throw result;return result;
}
export function onceDenseRetirement(retire){
 let done=false,pending;return()=>{if(done)return;if(pending)return pending;pending=Promise.resolve().then(()=>acknowledgeDenseRetirement(retire)).then(()=>{done=true;});pending.catch(()=>{pending=null;});return pending;};
}
export async function retireDenseOwners(owners){
 const outcomes=await Promise.allSettled(owners.map(owner=>acknowledgeDenseRetirement(typeof owner==='function'?owner:()=>owner?.dispose()))),failure=outcomes.find(v=>v.status==='rejected');if(failure)throw failure.reason;
}
export function countedDenseOwner(retire){
 let references=1,closing=false;const close=onceDenseRetirement(retire);
 return{retain(){requireValue(references>0&&!closing,'Dense native owner already retired or retiring.');references++;},release(){if(references>1){references--;return;}if(references===0)return;closing=true;return Promise.resolve(close()).then(()=>{references=0;},error=>{closing=false;throw error;});},get references(){return references;}};
}

// Strong metadata owners for failed pre-publication cleanup. This ledger stores
// references only; it never clones native arrays or starts a computation.
export function createDenseRetirementLedger(budget){
 const held=new Map(),funding=[];let capacity=0,live=0,releaseRequested=false;
 const maybeFree=()=>{if(!releaseRequested||held.size||live)return;for(const free of funding)free();funding.length=0;capacity=0;};
 const forget=owner=>{held.delete(owner);maybeFree();};
 const hold=owner=>{if(!owner)return()=>{};if(!held.has(owner)){requireValue(held.size<capacity,'Dense retirement metadata exceeds its pre-admitted capacity.');held.set(owner,true);}return()=>forget(owner);};
 const retire=async owners=>{const unique=[...new Set(owners.filter(Boolean))];for(const owner of unique)hold(owner);const outcomes=await Promise.allSettled(unique.map(owner=>acknowledgeDenseRetirement(typeof owner==='function'?owner:()=>owner.dispose())));for(let i=0;i<outcomes.length;i++)if(outcomes[i].status==='fulfilled')forget(unique[i]);const failure=outcomes.find(v=>v.status==='rejected');if(failure)throw failure.reason;};
 return{prepare(slots){requireValue(Number.isSafeInteger(slots)&&slots>0&&!held.size,'Dense cleanup must complete before another analysis.');const free=budget.reserve(slots*256);funding.push(free);capacity+=slots;releaseRequested=false;},hold,retire,counted(close){live++;return countedDenseOwner(async()=>{await acknowledgeDenseRetirement(close);live--;maybeFree();});},drain:async()=>{for(const owner of [...held.keys()].reverse())await retire([owner]);},release(){requireValue(!held.size,'Dense retirement owners still require ACK.');releaseRequested=true;maybeFree();},get size(){return held.size;}};
}
export function denseConstructionOwner(owners,{onRetirementOwner}={},finish=()=>retireDenseOwners(owners)){
 let forget;const detach=()=>{forget?.();forget=null;};const owner={dispose:onceDenseRetirement(async()=>{await finish();detach();}),publish:detach};forget=onRetirementOwner?.(owner);return owner;
}
export async function cleanupDenseOwners(retire,{failed=false,primary}={}){
 try{await acknowledgeDenseRetirement(retire);}catch(error){if(!failed)throw error;if(primary&&typeof primary==='object'){try{primary.details={...primary.details,denseRetirementPending:true};}catch{}}}
}
