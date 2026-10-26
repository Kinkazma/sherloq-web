// Only small startup metadata uses this deadline. Scientific resources and
// calculations keep their own download, cancellation and ownership protocols.
async function metadataDeadline(operation,timeoutMs,onTimeout){
 let timer;
 try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(onTimeout()),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
export async function optionalBootstrapCache(operation,{timeoutMs=1000}={}){
 // Cache Storage is optional. A suspended open/read/write must not prevent a
 // verified HTTP result from starting the application. Late immutable writes
 // remain safe, even where the storage API cannot cancel an outstanding call.
 try{return await metadataDeadline(operation,timeoutMs,()=>Error('Startup cache unavailable'));}catch{return undefined;}
}
export async function readBootstrapBytes(url,{fetcher=fetch,timeoutMs=30000,maxBytes=8_000_000}={}){
 const controller=new AbortController();
 return metadataDeadline(async()=>{
  const response=await fetcher(url,{cache:'no-cache',signal:controller.signal});
  if(!response.ok)throw Object.assign(Error('Startup metadata unavailable: HTTP '+response.status),{status:response.status,url:String(url),responseURL:response.url});
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>maxBytes)throw Object.assign(Error('Startup metadata exceeds the supported size'),{url:String(url)});
  return bytes;
 },timeoutMs,()=>{
  const error=Object.assign(Error('Startup metadata download timed out'),{code:'DEPENDENCY_METADATA_TIMEOUT',url:String(url),timeoutMs});
  controller.abort(error);return error;
 });
}
