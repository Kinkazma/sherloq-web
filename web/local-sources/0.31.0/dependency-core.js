// Exact runtime bytes, delivered in bounded, content-addressed pieces. No model
// conversion, resolution reduction or eager model download happens here.
export const CHUNK_LIMIT=100_000_000; // 100 MB, below GitHub's 100 MiB Git-file limit.
const digestPattern=/^[a-f0-9]{64}$/;
export async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function validateManifest(m){
 if(m?.schema!=='sherloq.dependencies/1'||!m.files||!m.chunks||!Array.isArray(m.slots))throw Error('Invalid dependency manifest');
 const pathOK=p=>typeof p==='string'&&p.length<500&&p.split('/').every(v=>v&&v!=='.'&&v!=='..')&&!/[\\?#%\x00-\x20]/.test(p);
 if(m.slots.some(s=>!pathOK(s)))throw Error('Invalid dependency slot');
 for(const [hash,size] of Object.entries(m.chunks))if(!digestPattern.test(hash)||!Number.isSafeInteger(size)||size<1||size>CHUNK_LIMIT)throw Error('Invalid dependency chunk');
 for(const [path,f] of Object.entries(m.files)){
  if(!pathOK(path)||!m.slots.some(s=>path.startsWith(s+'/'))||!digestPattern.test(f.sha256)||!Array.isArray(f.chunks)||!Number.isSafeInteger(f.size)||f.size<0||typeof f.type!=='string'||/[\r\n]/.test(f.type))throw Error('Invalid dependency file');
  if(f.chunks.some(h=>!Object.hasOwn(m.chunks,h))||f.chunks.reduce((n,h)=>n+m.chunks[h],0)!==f.size)throw Error('Invalid dependency file length');
  if(f.localOnly!==undefined&&typeof f.localOnly!=='boolean')throw Error('Invalid local-only dependency policy');
 }
 if(m.localFiles!==undefined&&(!Array.isArray(m.localFiles)||m.localFiles.some(p=>!Object.hasOwn(m.files,p))))throw Error('Invalid local dependency list');
 return m;
}
// Optional, restricted weights retain their ordinary file identity for import,
// but are not part of a downloadable public library or offline readiness.
export const publicDependencyEntries=manifest=>Object.entries(manifest.files).filter(([,file])=>file.localOnly!==true);
export function requiredDependencyChunks(manifest){
 const required=new Set(publicDependencyEntries(manifest).flatMap(([,file])=>file.chunks));
 return Object.entries(manifest.chunks).filter(([hash])=>required.has(hash));
}
export function remoteBase(value,{allowLocal=false}={}){
 if(value===null)return null;
 const u=new URL(value);
 const github=u.protocol==='https:'&&u.hostname==='raw.githubusercontent.com'&&/^\/[^/]+\/[^/]+\/[a-f0-9]{40}\/(?:[\w.-]+\/)*$/.test(u.pathname);
 const local=allowLocal&&u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname);
 if(!(github||local)||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/'))throw Error('Dependencies require an immutable GitHub commit URL');
 return u.href;
}
export function byteRange(value,size){
 if(!value)return {start:0,end:size-1,partial:false};
 const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||(!m[1]&&!m[2])||size===0)return null;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return null;
 return {start,end,partial:true};
}
export function dependencyResponse(file,manifest,load,request){
 const range=byteRange(request.headers.get('range'),file.size);
 if(!range)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${file.size}`}});
 const {start,end,partial}=range,headers={'Content-Type':file.type,'Content-Length':String(Math.max(0,end-start+1)),'Accept-Ranges':'bytes','ETag':'"'+file.sha256+'"','Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin','Cache-Control':'no-cache'};
 if(partial)headers['Content-Range']=`bytes ${start}-${end}/${file.size}`;
 if(request.method==='HEAD')return new Response(null,{status:partial?206:200,headers});
 let index=0,offset=0,cancelled=false;
 const stream=new ReadableStream({async pull(controller){
  try{
   while(index<file.chunks.length){
    const hash=file.chunks[index++],size=manifest.chunks[hash],at=offset;offset+=size;
    if(offset<=start)continue;if(at>end)break;
    const bytes=await load(hash);if(cancelled)return;
    controller.enqueue(bytes.subarray(Math.max(0,start-at),Math.min(size,end-at+1)));
    if(offset>end)controller.close();return;
   }
   controller.close();
  }catch(error){if(!cancelled)controller.error(error);}
 },cancel(){cancelled=true;}},{highWaterMark:0});
 return new Response(stream,{status:partial?206:200,headers});
}

// Current restricted native files each occupy one pinned chunk. Resolve that
// owned local chunk before HTTP success; a later body error cannot carry a code.
export async function localOnlyDependencyResponse(file,manifest,load,request,{path,identity,observe}={}){
 if(file.localOnly!==true||file.chunks.length!==1||request.method==='HEAD'||typeof load.acquire!=='function')return dependencyResponse(file,manifest,load,request);
 const range=byteRange(request.headers.get('range'),file.size);if(!range)return dependencyResponse(file,manifest,load,request);
 if(!digestPattern.test(identity||'')||manifest.files[path]!==file)throw TypeError('Pinned local dependency response identity required');
 const owner=load.acquire(file.chunks[0],observe,{metadataBytes:16384});let retirement,data,bodyController,ended=false;
 const retire=()=>retirement??=owner.release().finally(()=>request.signal.removeEventListener('abort',abort));
 const abort=()=>{data=null;if(bodyController&&!ended){ended=true;bodyController.error(request.signal.reason??new DOMException('Aborted','AbortError'));}void retire();};
 request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 let status,headers;
 try{
  await owner.ready();if(request.signal.aborted)throw request.signal.reason;
  const{start,end,partial}=range;data=owner.bytes.subarray(start,end+1);status=partial?206:200;
  headers={'Content-Type':file.type,'Content-Length':String(data.byteLength),'Accept-Ranges':'bytes','ETag':'"'+file.sha256+'"','Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin','Cache-Control':'no-cache'};
  if(partial)headers['Content-Range']=`bytes ${start}-${end}/${file.size}`;
 }catch(error){
  if(request.signal.aborted||error?.code!=='MODEL_LOCAL_REQUIRED'){await retire();throw request.signal.aborted?request.signal.reason:error;}
  try{
   const payload={schema:'sherloq.dependency-error/1',requestedURL:request.url,manifest:identity,error:{code:'MODEL_LOCAL_REQUIRED',message:'This model requires its original local files. Connect a library folder or import its verified archive.',details:{file:path,bytes:file.size,sha256:file.sha256,chunkSha256:file.chunks[0]}}};
   data=new TextEncoder().encode(JSON.stringify(payload));if(data.byteLength>4096)throw Error('Local dependency error exceeds bounded metadata admission');
   status=424;headers={'Content-Type':'application/json; charset=utf-8','Content-Length':String(data.byteLength),'X-Sherloq-Dependency-Error':'local-required/1','Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin','Cache-Control':'no-store'};
  }catch(cause){await retire();throw cause;}
 }
 let sent=false;const stream=new ReadableStream({start(controller){bodyController=controller;},async pull(controller){
  if(ended)return;if(request.signal.aborted){abort();return;}
  if(!sent){sent=true;controller.enqueue(data);data=null;return;}
  await retire();if(!ended){ended=true;controller.close();}
 },async cancel(){data=null;ended=true;await retire();}},{highWaterMark:0});
 try{return new Response(stream,{status,headers});}catch(error){data=null;ended=true;await retire();throw error;}
}
