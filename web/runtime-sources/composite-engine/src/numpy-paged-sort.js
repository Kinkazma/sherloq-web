import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
// Destructive sort of paired keys/IDs, preserving NumPy's unstable ordering.
// Both stores are caller-owned; no global index or key array is reconstructed.
export async function numpyPagedSort(keys,ids,{budget,signal,onProgress,pageBytes=4096,cachePages}={}){
 const count=keys.byteLength/8;requireValue(Number.isSafeInteger(count)&&count<=0x7fffffff&&ids.byteLength===count*4&&typeof keys.write==='function'&&typeof ids.write==='function','Invalid external NumPy sort planes.');
 cachePages??=Math.max(1,Math.min(8192,Math.floor((budget.limit-budget.retained-budget.active-16*1024**2)*.75/(2*(pageBytes+32)))));requireValue(Number.isSafeInteger(pageBytes)&&pageBytes>=512&&pageBytes%8===0&&Number.isSafeInteger(cachePages)&&cachePages>0,'Invalid external sort cache.');
 const workspace=16*1024**2+[keys.byteLength,ids.byteLength].reduce((n,b)=>n+Math.min(cachePages,Math.ceil(b/pageBytes))*(pageBytes+32),0);requireValue(workspace<=120*1024**2,'External sort cache exceeds its module allowance.');
 const release=budget.reserve(workspace),stores=[keys,ids],metrics={workspaceBytes:workspace,reads:0,writes:0,readBytes:0,writeBytes:0};let m,error;
 try{
  checkAbort(signal);const {default:create}=await import('../vendor/dense-paged/dense-paged.js');m=await create();let stamp=performance.now();m.checkpoint=async()=>{checkAbort(signal);if(performance.now()-stamp>=20){onProgress?.({phase:'numpy-global-sort',...metrics});await controlCheckpoint(signal);stamp=performance.now();}};
  m.pageIO=(id,offset,length,pointer,write)=>{checkAbort(signal);const bytes=m.HEAPU8.subarray(pointer,pointer+length),finish=()=>{if(write){metrics.writes++;metrics.writeBytes+=length;}else{metrics.reads++;metrics.readBytes+=length;}checkAbort(signal);if(performance.now()-stamp>=20)return m.checkpoint();},result=write?stores[id].write(bytes,offset):stores[id].readInto(bytes,offset);return result&&typeof result.then==='function'?result.then(finish):finish();};
  error=m._malloc(1024);if(!error)throw new EngineError('MEMORY_LIMIT','External sort metadata allocation failed.');const values=[count,pageBytes,cachePages,error],code=await m.ccall('numpy_paged_sort','number',values.map(()=> 'number'),values,{async:true});if(m.ioError)throw m.ioError;if(code)throw new EngineError('NUMERIC_RANGE',m.UTF8ToString(error));checkAbort(signal);await keys.flush();await ids.flush();return {...metrics,heapBytes:m.HEAPU8.byteLength};
 }finally{if(m){if(error)m._free(error);m.pageIO=null;m.checkpoint=null;}release();}
}
