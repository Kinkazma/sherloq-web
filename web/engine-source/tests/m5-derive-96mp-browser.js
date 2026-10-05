import {createWorkerEngine} from '../src/worker-client.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
import {storageInventory} from './source-api-browser.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function hashBlob(blob){const hash=await createSHA256();for(let offset=0;offset<blob.size;offset+=1024**2)hash.update(new Uint8Array(await blob.slice(offset,offset+1024**2).arrayBuffer()));return hash.digest('hex');}
export async function testDerive96mp(){
 const reference=await(await fetch('/derive-reference')).json(),before=await storageInventory(),budgetBytes=256*1024**2,engine=createWorkerEngine({memoryBudgetBytes:budgetBytes}),started=performance.now(),times={};
 try{
  const blob=await(await fetch('/derive-original')).blob();let at=performance.now();const source=await engine.loadBlob({id:'derive96',blob,layout:'segmented'});times.loadMs=performance.now()-at;
  assert(source.width===12000&&source.height===8000&&source.sha256===reference.sha256,'Full original source identity');
  const patches=reference.patches.map(p=>({...p,bytes:Uint8Array.from(p.bytes)}));at=performance.now();const derived=await engine.deriveOriginal({imageId:'derive96',patches});times.deriveMs=performance.now()-at;
  assert(derived.sizeBytes===reference.derivedBytes&&same(derived.edits,reference.edits),'All original and shifted output coordinates');
  assert(derived.provenance.originalSha256===reference.sha256&&derived.metrics.sourceCopyBytes===0,'Original provenance and immutable Blob slicing');
  assert(await hashBlob(await engine.originalBlob('derive96'))===reference.sha256,'Every original byte unchanged');
  for(const patch of reference.patches){const offset=Math.max(0,patch.offset-7),length=Math.min(32,blob.size-offset);if(!length)continue;const window=await engine.run({id:'hex-'+offset,imageId:'derive96',operation:'file.hex',params:{offset,length}});const expected=new Uint8Array(await blob.slice(offset,offset+length).arrayBuffer());assert(window.data.bytes.length===expected.length&&window.data.bytes.every((v,i)=>v===expected[i]),'Original hex windows exact around edited offsets');}
  await engine.unload('derive96');at=performance.now();assert(await hashBlob(derived.blob)===reference.derivedSha256,'Every derived byte after source unload');times.readbackMs=performance.now()-at;
  const response=await fetch('/derived-output',{method:'POST',body:derived.blob});assert(response.ok,'Complete output delivery');
  const memory=(await engine.capabilities()).memory;assert(memory.retainedBytes+memory.cacheBytes+memory.activeReservationBytes===0,'No owned memory after unload');await engine.dispose();assert(same(before,await storageInventory()),'Temporary inventory restored');
  return {passed:true,scope:'Original rich96MP public worker derived-byte path; insertion, replacement, deletion and append in original coordinates; complete original unchanged and full derived bytes exact after unload.',engineSource:source,budgetBytes,times,totalMs:performance.now()-started,derived:{sizeBytes:derived.sizeBytes,sha256:reference.derivedSha256,edits:derived.edits,provenance:derived.provenance,metrics:derived.metrics,afterSourceUnload:true},finalMemory:memory,storageCleanup:true};
 }finally{await engine.dispose();}
}
