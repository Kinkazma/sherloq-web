import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {createSegmentedBytes} from './segmented-bytes.js';
// Full fields remain available. This store contains only the native display
// sampling, after global reciprocal-link suppression and rank selection.
export async function samplePagedDenseLinks(field,limit,{budget,storage='auto',temporarySession,getTemporarySession,threshold=.3,pageBytes=4096,cachePages=64,signal}={}){
 const n=field.width*field.height;
 requireValue(Number.isSafeInteger(n)&&n>0&&n<=0x7fffffff&&Number.isSafeInteger(limit)&&limit>0&&limit<=0x7fffffff&&field.targets?.byteLength===n*4&&field.distancesSquared?.byteLength===n*4&&field.selected?.byteLength===n&&Number.isFinite(threshold)&&threshold>=0,'Invalid stored link fields.');
 requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%8===0&&Number.isSafeInteger(cachePages)&&cachePages>0,'Invalid stored link cache.');
 const workspace=16*1024**2+[n*4,n*4,n,Math.min(limit,n)*4].reduce((sum,l)=>sum+Math.min(cachePages,Math.ceil(l/pageBytes))*(pageBytes+32),0);
 if(workspace>120*1024**2)throw new EngineError('MEMORY_LIMIT','Link cache exceeds the native allowance.');
 checkAbort(signal);const release=budget.reserve(workspace),pointers=[];let m,rows,success=false;
 try{
  rows=await createSegmentedBytes(Math.min(n,limit)*4,{budget,storage,temporarySession,getTemporarySession,signal});const stores=[field.targets,field.distancesSquared,field.selected,rows],{default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();let last=performance.now();
  m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-last>=20){await controlCheckpoint(signal);last=performance.now();}};
  m.pageIO=async(id,offset,length,pointer,write)=>{checkAbort(signal);const bytes=m.HEAPU8.subarray(pointer,pointer+length);if(write)await stores[id].write(bytes,offset);else await stores[id].readInto(bytes,offset);if(performance.now()-last>=20)await m.checkpoint();};
  const alloc=bytes=>{const p=m._malloc(bytes);if(!p)throw new EngineError('MEMORY_LIMIT','Link metadata allocation failed.');pointers.push(p);return p;},stats=alloc(12),error=alloc(1024),values=[n,limit,threshold*threshold,pageBytes,cachePages,stats,error];
  const code=await m.ccall('dense_paged_links','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);await rows.flush();
  const [total,count,denseCount]=m.HEAPU32.slice(stats/4,stats/4+3);success=true;
  return {rows,total,count,denseCount,metrics:{workspaceBytes:workspace,heapBytes:m.HEAPU8.byteLength},dispose:()=>rows.dispose()};
 }finally{if(m){for(const p of pointers)m._free(p);m.pageIO=null;m.checkpoint=null;}if(!success)await rows?.dispose();release();}
}

// Sparse gathers are bounded by the caller's display/geometry reservation.
// Read each required byte page once, preserving caller order in the result.
export async function gatherDenseValues(store,indices,Type,{signal,pageBytes=4096}={}){
 requireValue([Int32Array,Uint8Array,Float32Array,Float64Array].includes(Type)&&indices instanceof Int32Array&&Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%Type.BYTES_PER_ELEMENT===0,'Invalid dense gather.');
 const bytes=Type.BYTES_PER_ELEMENT,count=store.byteLength/bytes;
 requireValue(indices.every(v=>v>=0&&v<count),'Dense gather index outside plane.');
 const values=new Type(indices.length),order=Array.from(indices,(_,i)=>i).sort((a,b)=>indices[a]-indices[b]),scratch=new Uint8Array(pageBytes);let at=0,last=performance.now();
 while(at<order.length){checkAbort(signal);if(performance.now()-last>=20){await controlCheckpoint(signal);last=performance.now();}const first=at,page=Math.floor(indices[order[at]]*bytes/pageBytes);while(at<order.length&&Math.floor(indices[order[at]]*bytes/pageBytes)===page)at++;
  const offset=indices[order[first]]*bytes,length=(indices[order[at-1]]+1)*bytes-offset,part=scratch.subarray(0,length);await store.readInto(part,offset);const typed=new Type(part.buffer,part.byteOffset,length/bytes);
  for(let j=first;j<at;j++)values[order[j]]=typed[indices[order[j]]-offset/bytes];
 }
 checkAbort(signal);return values;
}
