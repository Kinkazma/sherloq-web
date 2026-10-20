import {createBatchPreparationClient} from './batch-preparation-client.js?v=0.24.0';
import {composeScientificScope,scopeFingerprint} from './batch-scientific-preparation.js?v=0.24.0';
import {checkAbort} from './unified-engine/src/errors.js';
const cancelled=()=>Object.assign(Error('PDF preparation cancelled.'),{code:'CANCELLED'});
// The regular web preparation configuration resolves existing, pinned assets.
// This adapter owns no model payload and has no extension/database dependency.
export function createPdfScopeClient({configuration,computeProfile='maximum',memoryBudgetBytes,clientFactory=createBatchPreparationClient}={}){
 let client=null,starting=null,queue=Promise.resolve(),closed=false;const controllers=new Set();
 async function getClient(){if(closed)throw cancelled();if(client)return client;starting??=clientFactory({configuration,computeProfile,...(memoryBudgetBytes?{memoryBudgetBytes}:{})});const value=await starting;if(closed)throw cancelled();return client=value;}
 return {prepare(image,{signal,onProgress}={}){const controller=new AbortController(),combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;controllers.add(controller);const run=async()=>{checkAbort(combined);if(closed)throw cancelled();const prepared=await(await getClient()).prepare(image.blob,{detectText:false,signal:combined,onProgress,backend:'auto',name:image.name});checkAbort(combined);const scope=composeScientificScope(image,prepared);scope.fingerprint=await scopeFingerprint(scope);checkAbort(combined);return scope;};const task=queue.then(run,run);queue=task.catch(()=>{});return task.finally(()=>controllers.delete(controller));},cancel(){for(const controller of controllers)controller.abort();},async dispose(){if(closed)return;closed=true;for(const controller of controllers)controller.abort();await queue;const value=client??await starting?.catch(()=>null);await value?.dispose();client=starting=null;},snapshot(){return{closed,pending:controllers.size,configured:!!client};}};
}
