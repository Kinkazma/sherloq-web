import {sessionLog} from './session-log.js';
import {runtimeContext} from './runtime-context.js';
export async function downloadSession(){const report=await sessionLog.report(),url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='SHERLOQ-session-'+report.session+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function mountSessionControls(document=globalThis.document){
 if(!sessionLog||document.getElementById('export-session-log'))return;
 const fr=()=>document.documentElement.lang==='fr',menu=document.querySelector('#file-menu > div');
 const save=document.createElement('button');save.id='export-session-log';save.onclick=()=>void downloadSession();menu?.append(save);
 const banner=document.createElement('aside');banner.id='dependency-retry';banner.className='dependency-retry';banner.hidden=true;document.body.append(banner);
 const update=()=>{save.textContent=fr()?'Exporter le journal complet de la session…':'Export complete session log…';banner.replaceChildren();const waiting=sessionLog.waiting;banner.hidden=!waiting.length;if(!waiting.length)return;const text=document.createElement('span');text.textContent=fr()?'Téléchargement interrompu. L’image et le calcul sont conservés.':'Download interrupted. The image and calculation are preserved.';banner.append(text);
 for(const entry of waiting){const b=document.createElement('button');b.className='primary';b.textContent=(fr()?'Réessayer : ':'Retry: ')+entry.key.split('/').at(-1);b.onclick=()=>runtimeContext.resume(entry.key);banner.append(b);}const exportButton=document.createElement('button');exportButton.textContent=fr()?'Exporter le journal':'Export log';exportButton.onclick=()=>void downloadSession();banner.append(exportButton);};
 sessionLog.subscribe(e=>{if(['dependency.wait','dependency.ready','dependency.retry','dependency.cancelled'].includes(e.kind))update();});new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});update();
}
