// This packaged function runs in the configured local SHERLOQ origin. The
// portable application's server deliberately refuses cross-origin requests.
// Models are data only; no script or Wasm is loaded from that server.
export async function inLocalLibrary({action,file,source,segment,offset=0,count=1048576}){
 const hex=bytes=>[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join(''),hash=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
 const safe=path=>typeof path==='string'&&!!path&&!/[\\:\x00-\x1f?#%]/.test(path)&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');
 const loopback=url=>['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&(/^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/.test(url.hostname));
 async function request(url,options={}){return fetch(url,{credentials:'omit',cache:'no-store',redirect:'error',...options,signal:AbortSignal.timeout(15000)});}
 async function bounded(response,limit,exact=false){if(!response.ok)throw Error('Local library HTTP '+response.status);const reader=response.body?.getReader();if(!reader)throw Error('Local library body missing');const parts=[],buffer=exact?new Uint8Array(limit):null;let length=0;for(;;){const {done,value}=await reader.read();if(done)break;if(length+value.length>limit){await reader.cancel();throw Error('Local library body exceeds its inventory');}if(buffer)buffer.set(value,length);else parts.push(value);length+=value.length;}if(buffer){if(length!==limit)throw Error('Local library truncated');return buffer;}const bytes=new Uint8Array(length);let at=0;for(const part of parts){bytes.set(part,at);at+=part.length;}return bytes;}
 const current=new URL(location.href);if(!loopback(current))return action==='probe'?null:undefined;
 if(action==='probe'){
  if(!file||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isSafeInteger(file.bytes)||file.bytes<1)return null;
  try{
   const configURL=new URL('dependency-config.json',current),response=await request(configURL),config=JSON.parse(new TextDecoder().decode(await bounded(response,65536)));
   if(config.schema!=='sherloq.dependency-config/1'||config.offline!==true||!/^[a-f0-9]{64}$/.test(config.manifest))return null;
   const base=new URL(config.sourceBase||'./',configURL);if(!loopback(base)||base.origin!==current.origin||base.search||base.hash||!base.pathname.endsWith('/'))return null;
   const manifestResponse=await request(new URL('__manifest.json',base)),body=await bounded(manifestResponse,8000000);if(await hash(body)!==config.manifest)return null;
   const manifest=JSON.parse(new TextDecoder().decode(body));if(manifest.schema!=='sherloq.dependencies/1')return null;
   const entry=Object.entries(manifest.files||{}).find(([path,value])=>safe(path)&&value.sha256===file.sha256&&value.size===file.bytes);if(!entry)return null;
   const [path]=entry,url=new URL(path,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
   const release=manifestResponse.headers.get('X-Sherloq-Release')||response.headers.get('X-Sherloq-Release'),headers={};if(release&&/^[a-f0-9]{64}$/.test(release))headers['X-Sherloq-Release']=release;
   const present=await request(url,{method:'HEAD',headers});if(!present.ok||Number(present.headers.get('Content-Length'))!==file.bytes)return null;
   return {url:url.href,sha256:file.sha256,bytes:file.bytes,release:headers['X-Sherloq-Release']||null,kind:'archive'};
  }catch{return null;}
 }
 if(action!=='read'||!source||!/^[a-f0-9]{64}$/.test(source.sha256)||!Number.isSafeInteger(source.bytes)||source.bytes<1||!Number.isSafeInteger(offset)||offset<0||offset>=source.bytes||!Number.isSafeInteger(count)||count<1||count>1048576)throw Error('Invalid local library request');
 const url=new URL(source.url);if(!loopback(url)||url.origin!==current.origin||url.username||url.password||url.search||url.hash)throw Error('Local library origin differs');
 // Read each pinned segment once. Some managed-library servers verify a whole
 // model for every HTTP range: asking them for every 1 MiB would repeat that
 // work hundreds of times. This buffer is RAM only, released after transfer.
 if(segment){
  if(!Number.isSafeInteger(segment.offset)||segment.offset<0||!Number.isSafeInteger(segment.bytes)||segment.bytes<1||segment.bytes>100000000||segment.offset+segment.bytes>source.bytes||!/^[a-f0-9]{64}$/.test(segment.sha256)||offset<segment.offset||offset>=segment.offset+segment.bytes)throw Error('Invalid local library segment');
  const state=globalThis.__sherloqLibrarySegments??=new Map(),identity=JSON.stringify([source.url,source.release,segment.offset,segment.bytes,segment.sha256]);
  let record=state.get(identity);
  if(!record){
   record={};state.set(identity,record);
   record.promise=(async()=>{const start=segment.offset,end=start+segment.bytes-1,headers={Range:'bytes='+start+'-'+end};if(source.release&&/^[a-f0-9]{64}$/.test(source.release))headers['X-Sherloq-Release']=source.release;const response=await request(url,{headers});if(response.status!==206||response.headers.get('Content-Range')!=='bytes '+start+'-'+end+'/'+source.bytes)throw Error('Local library range differs');const bytes=await bounded(response,segment.bytes,true);if(await hash(bytes)!==segment.sha256)throw Error('Local library segment integrity failure');return bytes;})().catch(error=>{state.delete(identity);throw error;});
  }
  clearTimeout(record.timer);record.timer=setTimeout(()=>state.delete(identity),30000);
  const body=await record.promise,end=Math.min(segment.offset+segment.bytes,offset+count),bytes=body.subarray(offset-segment.offset,end-segment.offset);let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));if(end===segment.offset+segment.bytes){clearTimeout(record.timer);state.delete(identity);}return btoa(binary);
 }
 const end=Math.min(source.bytes,offset+count)-1,headers={Range:'bytes='+offset+'-'+end};if(source.release&&/^[a-f0-9]{64}$/.test(source.release))headers['X-Sherloq-Release']=source.release;
 const response=await request(url,{headers});if(response.status!==206||response.headers.get('Content-Range')!=='bytes '+offset+'-'+end+'/'+source.bytes)throw Error('Local library range differs');
 const bytes=await bounded(response,end-offset+1);if(bytes.length!==end-offset+1)throw Error('Local library truncated');let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(binary);
}
