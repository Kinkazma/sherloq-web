import {mountDependencyControls} from './dependency-library.js';
export async function prepareDependencies(){
 const response=await fetch(new URL('./dependency-config.json',import.meta.url),{cache:'no-cache'});
 if(!response.ok)throw Error('Dependency configuration unavailable');
 const config=await response.json();if(!config.enabled)return;
 mountDependencyControls(document,config);
 if(!navigator.serviceWorker)throw Error('Le chargement des ressources nécessite HTTPS et les Service Workers.');
 const expected=new URL('./dependency-sw.js?manifest='+config.manifest,import.meta.url);
 if(config.workerVersion)expected.searchParams.set('release',config.workerVersion);
 await navigator.serviceWorker.register(expected,{type:config.workerType||'module',scope:'./',updateViaCache:'none'});
 if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',change);reject(Error('Chargement des ressources indisponible. Rechargez la page pour réessayer.'));},30000);
  const change=()=>{if(navigator.serviceWorker.controller){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',change);resolve();}};
  navigator.serviceWorker.addEventListener('controllerchange',change);change();
 });
 const actual=new URL(navigator.serviceWorker.controller.scriptURL);
 if(actual.searchParams.get('manifest')!==config.manifest||actual.searchParams.get('release')!==expected.searchParams.get('release'))throw Error('Une nouvelle version est prête. Fermez les autres fenêtres SHERLOQ puis rouvrez cette page. Les calculs déjà ouverts restent inchangés.');
}
