import {noisesnifferCorpus} from './noisesniffer-corpus.js';import {noisesnifferLifecycle} from './noisesniffer-lifecycle.js';
import {createWorkerEngine} from '../src/worker-client.js';
export async function noisesnifferBrowserTest(){
 const read=async name=>{const r=await fetch('/fixtures/'+name);if(!r.ok)throw Error('Missing fixture '+name);return new Uint8Array(await r.arrayBuffer());};
 const proof=await noisesnifferCorpus(read);proof.lifecycle=await noisesnifferLifecycle(()=>createWorkerEngine(),read);
 const ref=JSON.parse(new TextDecoder().decode(await read('noisesniffer-reference.json'))),f=ref.cases.find(c=>c.name==='small-patch-3'),bytes=await read(f.input.file),pixels={width:f.width,height:f.height,format:'rgb8',data:bytes},engine=createWorkerEngine();
 try{
  await engine.load({id:'i',bytes,pixels});const controller=new AbortController();let error;
  const timer=setTimeout(()=>controller.abort(),15);try{await engine.run({id:'cancel',imageId:'i',operation:'noise.noisesniffer',params:{blockSize:8}},{signal:controller.signal});}catch(e){error=e;}finally{clearTimeout(timer);}
  if(error?.code!=='CANCELLED'||!error.imagesCleared)throw Error('Noisesniffer hard cancellation');
  await engine.load({id:'i',bytes,pixels});const r=await engine.run({id:'recover',imageId:'i',operation:'noise.noisesniffer'});if(r.status!=='ok')throw Error('Noisesniffer recovery');proof.hardCancellation='Worker terminated during uncached statistics, source reloaded, analysis recovered';
 }finally{engine.dispose();}
 return proof;
}
