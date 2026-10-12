// The public feature opens a cross-platform browser installation flow. Native
// development kits and personal filesystem paths are not part of this UI.
import {adobeFontURL} from './fonts.js';
export function mountOfflineControls(document,config){
 if(document.getElementById('offline-kit-button')||(!config.enabled&&!config.offline))return;
 const button=document.createElement('button');button.id='offline-kit-button';button.type='button';button.className='offline-kit-button';
 const fr=()=>document.documentElement.lang!=='en';
 const translate=()=>{button.textContent=config.offline?(fr()?'Hors ligne':'Offline'):(fr()?'Emporter hors ligne':'Take offline');button.title=fr()?'Installer SHERLOQ sur cet appareil et conserver ses dépendances.':'Install SHERLOQ on this device and keep its dependencies.';};
 button.onclick=()=>{const page=config.offline&&config.offlineMode!=='browser'?'__launcher':'offline-setup.html';const url=new URL(page,import.meta.url),root=document.documentElement;
  url.hash=new URLSearchParams({lang:root.lang,theme:root.dataset.theme==='light'?'light':'dark',font:root.style.getPropertyValue('--ui-font').includes('Montserrat')?'montserrat':'iowan'}).toString();
  const fonts=adobeFontURL(new URLSearchParams(globalThis.location.search).get('fonts'));if(fonts)url.searchParams.set('fonts',fonts);
  globalThis.open(url.href,'_blank','noopener');};
 document.querySelector('.app-toolbar .toolbar-spacer')?.after(button);new MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});translate();
 return {button};
}
