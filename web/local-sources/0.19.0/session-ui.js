import {sessionLog} from './session-log.js?v=0.19.0';
import {runtimeContext,diagnostic} from './runtime-context.js?v=0.19.0';
import {createExportSink} from './export-sink.js?v=0.19.0';
import {createDownloadManager} from './download-manager.js?v=0.19.0';
import {getDocumentDownloadShelf} from './download-shelf.js?v=0.19.0';
const documentDownloads=new WeakMap();
const sessionControls=new WeakMap();
function sessionDownloadManager(document,options){
 if(document?.body?.insertBefore)return getDocumentDownloadShelf(document).manager;
 let manager=document&&documentDownloads.get(document);if(manager)return manager;
 manager=createDownloadManager({document,...options});
 if(document){documentDownloads.set(document,manager);document.defaultView?.addEventListener('pagehide',()=>void manager.dispose(),{once:true});}
 return manager;
}
const ownedDownload=value=>value?.schema==='sherloq.download-lease/1'&&value.ownsTemporaryFile===true;
function feedbackElement(document){
 let element=document.getElementById('session-export-feedback');if(element)return element;
 element=document.createElement('aside');element.id='session-export-feedback';element.className='dependency-retry';element.setAttribute('role','alert');element.hidden=true;document.body.append(element);return element;
}
export async function runSessionExport(task,{document=globalThis.document,button,feedback,emit=diagnostic,operation='session-log',log=sessionLog}={}){
 let phase='read-session-log';const label=button?.textContent,wasDisabled=button?.disabled,fr=document?.documentElement?.lang==='fr';
 const progress=value=>{phase=value;};if(button){button.disabled=true;button.textContent=fr?'Préparation du journal…':'Preparing session log…';}if(feedback)feedback.hidden=true;
 emit({level:'info',kind:'session.export.start',operation,phase,session:log?.id,eventCount:log?.length});
 try{const value=await task(progress);if(feedback)feedback.hidden=true;else{const previous=document?.getElementById('session-export-feedback');if(previous)previous.hidden=true;}emit({level:'info',kind:'session.export.dispatched',operation,phase,session:log?.id,eventCount:log?.length,...value});return {ok:true,...value};}
 catch(error){
  phase=error?.details?.phase??phase;
  emit({level:'error',kind:'session.export.error',operation,phase,session:log?.id,eventCount:log?.length,error});
  if(document){const element=feedback??feedbackElement(document),code=error?.code??error?.name??'EXPORT_FAILED',message=(fr?'Le journal n’a pas pu être exporté. Réessayez ; les données de la session sont conservées.':'The session log could not be exported. Retry; the session data is retained.')+' '+code+' : '+(error?.message??String(error));element.dataset.phase=phase;
   if(feedback)element.textContent=message;else{element.replaceChildren();const text=document.createElement('span'),close=document.createElement('button');text.textContent=message;close.textContent=fr?'Fermer':'Close';close.onclick=()=>element.hidden=true;element.append(text,close);}element.hidden=false;
  }
  return {ok:false,error,phase};
 }finally{if(button){button.disabled=wasDisabled;button.textContent=label;}}
}
export async function downloadSession({log=sessionLog,document=globalThis.document,urlAPI=URL,schedule=setTimeout,button,feedback,emit=diagnostic,sinkFactory=createExportSink,report,name,download,downloadManager,operation='session-log'}={}){
 return runSessionExport(async progress=>{
  let output,blob,info;
  const cleanup=async()=>{try{await output?.cleanup?.();}catch(error){emit({level:'warning',kind:'session.export.cleanup.error',operation,phase:'temporary-file-cleanup',session:log?.id,error});}};
  if(log?.exportTo){
   progress('prepare-session-file');const sink=await sinkFactory({memoryBudgetBytes:4*1024**3,mime:'application/json'});
   try{if(report){progress('serialize-report');const {sessionLog:ignored,...payload}=report,text=JSON.stringify(payload);await sink.write(new TextEncoder().encode(text.slice(0,-1)+(text==='{}'?'':',')+'"sessionLog":'));}progress('stream-session-log');info=await log.exportTo(sink);if(report)await sink.write(new TextEncoder().encode('}'));progress('finish-session-file');output=await sink.finish();blob=output.blob;}
   catch(error){await sink.abort().catch(()=>{});throw error;}
  }else{progress('read-session-log');const value=await log.report();progress('serialize-session-log');blob=new Blob([JSON.stringify(report?{...report,sessionLog:value}:value,null,2)],{type:'application/json'});info={session:value.session,eventCount:value.eventCount};}
  progress('download-dispatch');
  const filename=name??'SHERLOQ-session-'+info.session+'.json';
  let receipt,dispatched=false,ownershipTransferred=false;
  try{
   const send=download??((value,file,options)=>(downloadManager??sessionDownloadManager(document,{urlAPI})).download(value,file,options));
   receipt=await send(blob,filename,{cleanup,storage:output?.storage,mime:'application/json'});dispatched=true;
   return {...info,bytes:blob.size,format:'json',...(ownedDownload(receipt)?{downloadLease:receipt.id,downloadState:receipt.state}:{})};
  }catch(error){receipt=error.downloadLease;ownershipTransferred=error.downloadOwnershipTransferred===true;throw error;}
  finally{
   // Legacy callbacks do not accept ownership. A manager receipt transfers both
   // the URL and the backing file; it must never race a separate cleanup timer.
   if(!ownedDownload(receipt)&&!ownershipTransferred){if(dispatched)schedule(()=>void cleanup(),60000);else await cleanup();}
  }
 },{document,button,feedback,emit,log,operation});
}
export function mountSessionControls(document=globalThis.document,{download,log=sessionLog}={}){
 let state=sessionControls.get(document);if(!state){state={download};sessionControls.set(document,state);}else if(download!==undefined)state.download=download;
 if(!log||document.getElementById('export-session-log'))return;
 const fr=()=>document.documentElement.lang==='fr',menu=document.querySelector('#file-menu > div');
 const save=document.createElement('button');save.id='export-session-log';save.onclick=()=>void downloadSession({document,button:save,download:state.download,log});menu?.append(save);
 const banner=document.createElement('aside');banner.id='dependency-retry';banner.className='dependency-retry';banner.hidden=true;document.body.append(banner);
 const update=()=>{save.textContent=fr()?'Exporter le journal complet de la session…':'Export complete session log…';banner.replaceChildren();const waiting=log.waiting;banner.hidden=!waiting.length;if(!waiting.length)return;const text=document.createElement('span');text.textContent=fr()?'Téléchargement interrompu. L’image et le calcul sont conservés.':'Download interrupted. The image and calculation are preserved.';banner.append(text);
 for(const entry of waiting){const b=document.createElement('button');b.className='primary';b.textContent=(fr()?'Réessayer : ':'Retry: ')+entry.key.split('/').at(-1);b.onclick=()=>runtimeContext.resume(entry.key);banner.append(b);}const exportButton=document.createElement('button');exportButton.textContent=fr()?'Exporter le journal':'Export log';exportButton.onclick=()=>void downloadSession({document,button:exportButton,download:state.download,log});banner.append(exportButton);};
 log.subscribe(e=>{if(['dependency.wait','dependency.ready','dependency.retry','dependency.cancelled'].includes(e.kind))update();});const Observer=document.defaultView?.MutationObserver??globalThis.MutationObserver;if(Observer)new Observer(update).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});update();
}
