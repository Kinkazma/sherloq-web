import {sessionLog} from './session-log.js?v=0.18.0';
import {runtimeContext,diagnostic} from './runtime-context.js?v=0.18.0';
import {createExportSink} from './export-sink.js?v=0.18.0';
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
export async function downloadSession({log=sessionLog,document=globalThis.document,urlAPI=URL,schedule=setTimeout,button,feedback,emit=diagnostic,sinkFactory=createExportSink,report,name,download,operation='session-log'}={}){
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
  if(download){let dispatched=false;try{await download(blob,filename);dispatched=true;return {...info,bytes:blob.size,format:'json'};}finally{if(dispatched)schedule(()=>void cleanup(),60000);else await cleanup();}}
  let url,dispatched=false;
  try{url=urlAPI.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();dispatched=true;return {...info,bytes:blob.size,format:'json'};}
  finally{if(dispatched)schedule(()=>{urlAPI.revokeObjectURL(url);void cleanup();},output?60000:1000);else{if(url)urlAPI.revokeObjectURL(url);await cleanup();}}
 },{document,button,feedback,emit,log,operation});
}
export function mountSessionControls(document=globalThis.document){
 if(!sessionLog||document.getElementById('export-session-log'))return;
 const fr=()=>document.documentElement.lang==='fr',menu=document.querySelector('#file-menu > div');
 const save=document.createElement('button');save.id='export-session-log';save.onclick=()=>void downloadSession({document,button:save});menu?.append(save);
 const banner=document.createElement('aside');banner.id='dependency-retry';banner.className='dependency-retry';banner.hidden=true;document.body.append(banner);
 const update=()=>{save.textContent=fr()?'Exporter le journal complet de la session…':'Export complete session log…';banner.replaceChildren();const waiting=sessionLog.waiting;banner.hidden=!waiting.length;if(!waiting.length)return;const text=document.createElement('span');text.textContent=fr()?'Téléchargement interrompu. L’image et le calcul sont conservés.':'Download interrupted. The image and calculation are preserved.';banner.append(text);
 for(const entry of waiting){const b=document.createElement('button');b.className='primary';b.textContent=(fr()?'Réessayer : ':'Retry: ')+entry.key.split('/').at(-1);b.onclick=()=>runtimeContext.resume(entry.key);banner.append(b);}const exportButton=document.createElement('button');exportButton.textContent=fr()?'Exporter le journal':'Export log';exportButton.onclick=()=>void downloadSession({document,button:exportButton});banner.append(exportButton);};
 sessionLog.subscribe(e=>{if(['dependency.wait','dependency.ready','dependency.retry','dependency.cancelled'].includes(e.kind))update();});new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});update();
}
