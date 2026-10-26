import "../../runtime-context.js?v=0.25.0";
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,denseConstructionOwner} from './dense-owner-retirement.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {checkAbort} from './errors.js';

// Worker-owned output banks can be archived after their useful search, while
// shared input descriptors stay hot for subsequent searches. Copy each byte
// once in bounded sequential chunks; publication occurs only after completion.
export async function storeColdDenseField(field,options){
 if(options.storage!=='temporary')return field;
 const names=['targets','distancesSquared',...(field.ownsAllowed?['allowed']:[])],owned=[],drops=new Map();let success=false;
 const retireStore=store=>{if(!drops.has(store))drops.set(store,onceDenseRetirement(()=>store.dispose()));return drops.get(store);},copies=denseConstructionOwner([],{onRetirementOwner:options.onRetirementOwner},()=>retireDenseOwners(owned.map(retireStore))),dropField=onceDenseRetirement(()=>field.dispose());
 try{
  const replacements={};
  for(const name of names){
   const source=field[name];if(source.storage==='temporary'){replacements[name]=source;continue;}
   if(source.spill){await source.spill({signal:options.signal});replacements[name]=source;continue;}
   const store=await createSegmentedBytes(source.byteLength,options);owned.push(store);const size=Math.min(1024**2,source.byteLength),release=options.budget.reserve(size);
   try{const bytes=new Uint8Array(size);for(let offset=0;offset<source.byteLength;offset+=size){checkAbort(options.signal);const part=bytes.subarray(0,Math.min(size,source.byteLength-offset));await source.readInto(part,offset);await store.write(part,offset);}await store.flush();}finally{release();}
   replacements[name]=store;
  }
  // Shared worker outputs have one common output reservation. The temporary
  // copies above replace all its owned planes together before dropping it.
  if(!owned.length){copies.publish();success=true;return field;}
  const replacedAll=owned.length===names.length;if(replacedAll)await dropField();
  copies.publish();success=true;return {...field,...replacements,dispose:onceDenseRetirement(async()=>{await copies.dispose();if(!replacedAll)await dropField();})};
 }finally{if(!success)await acknowledgeDenseRetirement(()=>copies.dispose());}
}
