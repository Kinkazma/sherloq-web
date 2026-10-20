import {installExtensionResourceRelay} from './extension-resource-relay.js?v=0.24.0';
import {runtimeContext,diagnostic} from './runtime-context.js?v=0.24.0';
import {connectDependencyWorker} from './dependency-lifecycle.js?v=0.24.0';
import {mountDependencyControls,readDependencyManifest} from './dependency-library.js?v=0.24.0';
import {mountOfflineControls} from './offline-kit-ui.js?v=0.24.0';
export async function prepareDependencies({onStatus}={}){
 const response=await fetch(new URL('./dependency-config.json?v=0.24.0',import.meta.url),{cache:'no-cache'});
 if(!response.ok)throw Error('Dependency configuration unavailable');
 const config=await response.json();if(/^[a-f0-9]{64}$/.test(config.manifest??''))try{const manifest=await readDependencyManifest(config);installExtensionResourceRelay({manifest,scope:new URL('./',import.meta.url)});}catch(error){diagnostic({level:'warning',kind:'dependency.extension-relay-unavailable',message:error.message});}if(!config.enabled){if(config.offline){mountOfflineControls(document,config);mountDependencyControls(document,config);}return;}
 if(!navigator.serviceWorker)throw Error('Le chargement des ressources nécessite HTTPS et les Service Workers.');
 const expected=new URL('./dependency-sw.js?manifest='+config.manifest,import.meta.url);
 if(config.workerVersion)expected.searchParams.set('release',config.workerVersion);
 await connectDependencyWorker(navigator.serviceWorker,expected,{workerType:config.workerType||'module',onStatus});
 if(runtimeContext.session)await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Dependency session handshake timed out'));},5000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();if(event.data?.error||event.data?.manifest&&event.data.manifest!==config.manifest)reject(Error(event.data.error||'Dependency session resource version differs'));else resolve();};navigator.serviceWorker.controller.postMessage({type:'dependency-session',session:runtimeContext.session,manifest:config.manifest},[channel.port2]);});
 mountDependencyControls(document,config);
 mountOfflineControls(document,config);
}
