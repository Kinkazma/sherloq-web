import {errorEvidence} from './error-evidence.js?v=0.31.0';
export {errorEvidence};
import {diagnostic} from './runtime-context.js?v=0.31.0';
import {downloadSession} from './session-ui.js?v=0.31.0';
// Keep a small text-only diagnostic history, never scientific buffers or images.
export function createErrorJournal({limit=8,maxBytes=32768}={}){
 if(!Number.isInteger(limit)||limit<1||limit>64||!Number.isInteger(maxBytes)||maxBytes<4096)throw new RangeError('Invalid diagnostic bounds');
 const entries=[];
 function record(error,context){
  const evidence=errorEvidence(error);diagnostic({level:evidence.code==='CANCELLED'?'info':'error',kind:'operation.error',error,operationContext:context});
  const seen=new WeakSet();const encode=value=>JSON.stringify(value,(_key,v)=>{if(typeof v==='bigint')return String(v);if(ArrayBuffer.isView(v))return {type:v.constructor.name,length:v.length,preview:Array.from(v.subarray?.(0,16)??[])};if(typeof v==='string')return v.length>8192?v.slice(0,8192)+'…':v;if(v&&typeof v==='object'){if(seen.has(v))return '[circular]';seen.add(v);}return v;});
  const entry={time:new Date().toISOString(),context,error:evidence};let text=encode(entry);
  if(new TextEncoder().encode(text).length>maxBytes){const extent=Math.floor((maxBytes-4096)/12),short=(value,n)=>String(value??'').slice(0,n);text=JSON.stringify({time:entry.time,context:{operation:short(context?.operation,128),algorithm:short(context?.algorithm,128)},error:{name:short(evidence.name,64),code:short(evidence.code,64),message:short(evidence.message,extent),stack:short(evidence.stack,extent)},truncated:true});}
  entries.push(text);if(entries.length>limit)entries.shift();return JSON.parse(text);
 }
 return {record,get length(){return entries.length;},snapshot:()=>entries.map(text=>JSON.parse(text))};
}
// Called from the explicit Copy button so clipboard permissions retain the
// browser's user activation. The fallback keeps keyboard focus and selection.
export async function copyDiagnosticText(document,text,{label='Diagnostic'}={}){
 const owner=document.getElementById('app')?.ownerDocument??document,clipboard=owner.defaultView?.navigator?.clipboard;
 let denied;
 if(clipboard?.writeText){try{await clipboard.writeText(text);return;}catch(error){denied=error;}}
 const active=owner.activeElement,field=owner.createElement('textarea');field.value=text;field.readOnly=true;field.setAttribute('aria-label',label);
 Object.assign(field.style,{position:'fixed',left:'-10000px',top:'0',opacity:'0'});(document.getElementById('app')??owner.body).append(field);
 try{field.focus();field.select();if(!owner.execCommand?.('copy'))throw denied??new Error('Clipboard is unavailable.');}
 finally{field.remove();active?.focus?.();}
}
export function showErrorJournal(document,journal,{language='fr',download}={}){
 const fr=language==='fr',dialog=document.createElement('dialog'),title=document.createElement('h2'),text=document.createElement('p'),pre=document.createElement('pre'),save=document.createElement('button'),copy=document.createElement('button'),close=document.createElement('button'),feedback=document.createElement('p');feedback.setAttribute('role','status');feedback.hidden=true;
 dialog.className='error-diagnostic';title.textContent=fr?'Dernières erreurs de cet outil':'Recent errors in this tool';text.textContent=fr?'Le dernier échec figure en bas. Ces diagnostics restent disponibles après les calculs suivants.':'The latest failure is at the bottom. Diagnostics remain available after subsequent calculations.';
 const report={schema:'sherloq.errors/1',errors:journal.snapshot()},json=JSON.stringify(report,null,2);pre.textContent=json;
 copy.type='button';copy.textContent=fr?'Copier le diagnostic':'Copy diagnostics';copy.dataset.action='copy-diagnostics';copy.onclick=async()=>{copy.disabled=true;feedback.hidden=true;feedback.setAttribute('role','status');try{await copyDiagnosticText(document,json);feedback.textContent=fr?'Diagnostic copié.':'Diagnostics copied.';}catch(error){feedback.textContent=(fr?'Copie impossible : ':'Could not copy: ')+error.message;feedback.setAttribute('role','alert');}finally{copy.disabled=false;feedback.hidden=false;}};
 save.textContent=fr?'Exporter le journal complet':'Export complete session log';save.onclick=()=>void downloadSession({document,button:save,feedback,report,download,name:'SHERLOQ-diagnostics.json',operation:'tool-diagnostics'});close.textContent=fr?'Fermer':'Close';close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.append(title,text,pre,feedback,copy,save,close);document.getElementById('app').append(dialog);dialog.showModal();return dialog;
}
