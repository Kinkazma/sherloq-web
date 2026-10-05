import {connectDependencyWorker} from './dependency-lifecycle.js';
import {mountDependencyControls} from './dependency-library.js';
export async function prepareDependencies({onStatus}={}){
 const response=await fetch(new URL('./dependency-config.json',import.meta.url),{cache:'no-cache'});
 if(!response.ok)throw Error('Dependency configuration unavailable');
 const config=await response.json();if(!config.enabled)return;
 if(!navigator.serviceWorker)throw Error('Le chargement des ressources nécessite HTTPS et les Service Workers.');
 const expected=new URL('./dependency-sw.js?manifest='+config.manifest,import.meta.url);
 if(config.workerVersion)expected.searchParams.set('release',config.workerVersion);
 await connectDependencyWorker(navigator.serviceWorker,expected,{workerType:config.workerType||'module',onStatus});
 mountDependencyControls(document,config);
}
