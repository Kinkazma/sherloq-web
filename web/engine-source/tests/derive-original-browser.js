import {createWorkerEngine} from '../src/worker-client.js';
export async function deriveOriginalBrowserTest(){
 const engine=createWorkerEngine(),assert=(ok,message)=>{if(!ok)throw Error(message);};
 try{
  // File name comes from the fixture inventory to avoid coupling this test to it.
  const ref=await(await fetch('/tests/data/png-formats/reference.json')).json();
  const original=await(await fetch('/tests/data/png-formats/'+ref.cases[0].file)).blob(),loaded=await engine.loadBlob({id:'i',blob:original});
  const result=await engine.deriveOriginal({imageId:'i',patches:[{offset:0,deleteCount:2,bytes:Uint8Array.of(1,2,3)},{offset:original.size,deleteCount:0,bytes:Uint8Array.of(9)}]});
  const actual=new Uint8Array(await result.blob.arrayBuffer()),expected=new Uint8Array(original.size+2),source=new Uint8Array(await original.arrayBuffer());expected.set([1,2,3]);expected.set(source.subarray(2),3);expected[expected.length-1]=9;
  assert(actual.every((v,i)=>v===expected[i])&&actual.length===expected.length,'derived bytes differ');
  assert(result.provenance.originalSha256===loaded.sha256,'provenance mismatch');
  const retained=new Uint8Array(await(await engine.originalBlob('i')).arrayBuffer());assert(retained.every((v,i)=>v===source[i]),'source modified');
  await engine.unload('i');assert(new Uint8Array(await result.blob.arrayBuffer()).every((v,i)=>v===expected[i]),'output lost on unload');
  const input={id:'cancel',bytes:new Uint8Array(8192),pixels:{width:1,height:1,format:'rgb8',data:Uint8Array.of(1,2,3)},provenance:{decoder:'explicit-test'}};
  await engine.load(input);const controller=new AbortController();let cancelled=false;
  try{await engine.deriveOriginal({imageId:'cancel',patches:Array.from({length:8192},(_,offset)=>({offset,deleteCount:1,bytes:Uint8Array.of(4)}))},{signal:controller.signal,onProgress:()=>controller.abort()});}catch(error){cancelled=error.code==='CANCELLED'&&error.imagesCleared;}
  assert(cancelled,'worker abort did not clear sources');await engine.load(input);const recovered=await engine.deriveOriginal({imageId:'cancel',patches:[]});assert(recovered.sizeBytes===8192,'recovery failed');
  return {status:'passed',realWorker:true,insertOverwriteAppend:true,originalUnchanged:true,derivedBlobSurvivesUnload:true,hardAbortAndReload:true,bytes:actual.length};
 }finally{engine.dispose();}
}
