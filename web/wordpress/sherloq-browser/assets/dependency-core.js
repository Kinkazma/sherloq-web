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
 }
 if(m.localFiles!==undefined&&(!Array.isArray(m.localFiles)||m.localFiles.some(p=>!Object.hasOwn(m.files,p))))throw Error('Invalid local dependency list');
 return m;
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
