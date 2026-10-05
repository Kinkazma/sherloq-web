// Keep a small text-only diagnostic history, never scientific buffers or images.
export function errorEvidence(error,depth=0){return {name:error?.name,code:error?.code,message:error?.message,stack:error?.stack,details:error?.details,...(error?.cleanupError&&depth<8?{cleanupError:errorEvidence(error.cleanupError,depth+1)}:{}),...(error?.cause&&depth<8?{cause:errorEvidence(error.cause,depth+1)}:{})};}
export function createErrorJournal({limit=8,maxBytes=32768}={}){
 if(!Number.isInteger(limit)||limit<1||limit>64||!Number.isInteger(maxBytes)||maxBytes<4096)throw new RangeError('Invalid diagnostic bounds');
 const entries=[];
 function record(error,context){
  const seen=new WeakSet();const encode=value=>JSON.stringify(value,(_key,v)=>{if(typeof v==='bigint')return String(v);if(ArrayBuffer.isView(v))return {type:v.constructor.name,length:v.length,preview:Array.from(v.subarray?.(0,16)??[])};if(typeof v==='string')return v.length>8192?v.slice(0,8192)+'…':v;if(v&&typeof v==='object'){if(seen.has(v))return '[circular]';seen.add(v);}return v;});
  const evidence=errorEvidence(error),entry={time:new Date().toISOString(),context,error:evidence};let text=encode(entry);
  if(new TextEncoder().encode(text).length>maxBytes){const extent=Math.floor((maxBytes-4096)/12),short=(value,n)=>String(value??'').slice(0,n);text=JSON.stringify({time:entry.time,context:{operation:short(context?.operation,128),algorithm:short(context?.algorithm,128)},error:{name:short(evidence.name,64),code:short(evidence.code,64),message:short(evidence.message,extent),stack:short(evidence.stack,extent)},truncated:true});}
  entries.push(text);if(entries.length>limit)entries.shift();return JSON.parse(text);
 }
 return {record,get length(){return entries.length;},snapshot:()=>entries.map(text=>JSON.parse(text))};
}
export function showErrorJournal(document,journal,{language='fr',download}={}){
 const fr=language==='fr',dialog=document.createElement('dialog'),title=document.createElement('h2'),text=document.createElement('p'),pre=document.createElement('pre'),save=document.createElement('button'),close=document.createElement('button');
 dialog.className='error-diagnostic';title.textContent=fr?'Dernières erreurs de cet outil':'Recent errors in this tool';text.textContent=fr?'Le dernier échec figure en bas. Ces diagnostics restent disponibles après les calculs suivants.':'The latest failure is at the bottom. Diagnostics remain available after subsequent calculations.';
 const report={schema:'sherloq.errors/1',errors:journal.snapshot()},json=JSON.stringify(report,null,2);pre.textContent=json;save.textContent=fr?'Exporter les diagnostics':'Export diagnostics';save.onclick=()=>download(new Blob([json],{type:'application/json'}),'SHERLOQ-diagnostics.json');close.textContent=fr?'Fermer':'Close';close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.append(title,text,pre,save,close);document.getElementById('app').append(dialog);dialog.showModal();return dialog;
}
