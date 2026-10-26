import {createSegmentedBytes} from './segmented-bytes.js';
import {checkAbort} from './errors.js';

// Worker-owned output banks can be archived after their useful search, while
// shared input descriptors stay hot for subsequent searches. Copy each byte
// once in bounded sequential chunks; publication occurs only after completion.
export async function storeColdDenseField(field,options){
 if(options.storage!=='temporary')return field;
 const names=['targets','distancesSquared',...(field.ownsAllowed?['allowed']:[])],owned=[];let success=false;
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
  if(!owned.length){success=true;return field;}
  const replacedAll=owned.length===names.length;if(replacedAll)await field.dispose();
  let disposed=false;success=true;return {...field,...replacements,async dispose(){if(disposed)return;disposed=true;await Promise.all(owned.map(store=>store.dispose()));if(!replacedAll)await field.dispose();}};
 }finally{if(!success)await Promise.allSettled(owned.map(store=>store.dispose()));}
}
