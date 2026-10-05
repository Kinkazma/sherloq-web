import {createTemporarySession} from '../src/temporary-storage.js';
const before=await navigator.storage.getDirectory(),id='job-'+crypto.randomUUID(),session=await createTemporarySession({id,backend:'opfs'}),cases=[];
try{
 for(const bytes of [3840012345,2**32+1024]){
  const store=await session.create(bytes),offsets=[0,1024**3-9,2*1024**3-9,3*1024**3-9,bytes-31];if(bytes>2**32)offsets.push(2**32-9);
  for(const at of offsets){const expected=Uint8Array.from({length:31},(_,i)=>(at+i)*73%251),actual=new Uint8Array(31);await store.write(expected,at);await store.flush();await store.readInto(actual,at);if(actual.some((x,i)=>x!==expected[i]))throw Error('Large OPFS seam differs '+at);}
  const zero=new Uint8Array(31);await store.readInto(zero,987654);if(zero.some(x=>x))throw Error('Implicit zeros differ');cases.push({bytes,offsets,storage:session.snapshot()});await store.dispose();if(session.snapshot().reservedBytes||session.snapshot().openFiles||session.snapshot().physicalFiles)throw Error('Array cleanup failed');
 }
 await session.dispose();const parent=await before.getDirectoryHandle('sherloq-temporary-v1');let absent=false;try{await parent.getDirectoryHandle(id);}catch(e){absent=e.name==='NotFoundError';}if(!absent)throw Error('Session cleanup failed');postMessage({done:true,result:{passed:true,cases,cleanup:true,scope:'Real sparse logical arrays and seam I/O beyond4GiB; full ZERO and energy scientific archives require separate end-to-end qualification'}});
}catch(e){postMessage({done:true,error:e.message});}finally{await session.dispose();}
