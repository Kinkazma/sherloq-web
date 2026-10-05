import {createWorkerEngine} from '../src/worker-client.js';
import {prnuLifecycle} from './prnu-lifecycle.js';
import {storageInventory} from './source-api-browser.js';
export async function prnuStorageBrowserTest(){
 const before=await storageInventory(),backends=[],builds=[];
 const proof=await prnuLifecycle(()=>{const engine=createWorkerEngine({memoryBudgetBytes:512*1024**2}),load=engine.loadPrnuDatabase,build=engine.buildPrnuDatabase;engine.buildPrnuDatabase=async(input,hooks)=>{const r=await build({...input,fingerprintStorage:'temporary'},hooks);if(r.metrics.fingerprintLayout!=='segmented'||r.metrics.temporaryBackend!=='opfs')throw Error('Expected stored snapshot');builds.push(r.metrics);return r;};engine.loadPrnuDatabase=async(input,hooks)=>{const r=await load({...input,fingerprintStorage:'temporary'},hooks);if(r.metrics.fingerprintLayout!=='segmented'||r.metrics.temporaryBackend!=='opfs')throw new Error('Expected segmented OPFS fingerprints');backends.push(r.metrics.temporaryBackend);return r;};return engine;},async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer()));
 const after=await storageInventory();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('PRNU temporary storage leaked');
 return {...proof,imports:backends.length,builds,temporaryBackend:'opfs',storageArtifactsRemaining:after.length-before.length,nccWorkspaceBytes:196608};
}
