import {createM2WorkerClient} from './unified-engine/src/m2-worker-client.js';
import {scientificPreparationConfiguration} from './tool-models.js';
import {EngineError,requireValue,checkAbort} from './unified-engine/src/errors.js';

export async function createBatchPreparationClient({computeProfile='maximum',memoryBudgetBytes=4*1024**3,configuration,workerFactory=()=>new Worker(new URL('./batch-preparation-worker.js',import.meta.url),{type:'module'}),clientFactory=createM2WorkerClient}={}){
 const configured=configuration??await scientificPreparationConfiguration({computeProfile,memoryBudgetBytes});
 const client=await clientFactory({...configured,computeProfile,memoryBudgetBytes},{workerFactory});let disposed=false;
 return {
  ready:client.ready,
  async prepare(blob,{textOnly=false,detectText=true,signal,onProgress,backend='auto',name}={}){
   if(disposed)throw new EngineError('DISPOSED','Batch preparation client disposed.');requireValue(typeof detectText==='boolean','detectText must be a boolean.');checkAbort(signal);let descriptor;
   try{descriptor=await client.analyzeBlob('scientific-preparation',blob,{textOnly,detectText,name},{signal,onProgress,backend});checkAbort(signal);const metadata=await client.metadata(descriptor);checkAbort(signal);return metadata;}
   finally{if(descriptor&&!disposed)await client.release(descriptor.id);}
  },
  memory:()=>client.memory(),
  dispose(){disposed=true;return client.dispose();}
 };
}
