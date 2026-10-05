import {diagnostic,runtimeContext} from './runtime-context.js';
export class DependencyError extends Error{constructor(code,message,details,cause){super(message,cause?{cause}:undefined);this.name='DependencyError';this.code=code;this.details=details;}}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hex=b=>[...b].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function dependencyBytes(url,expected,{fetcher=fetch,wait=runtimeContext.retry,attempts=3,delay=pause}={}){
 const key=String(url);let retries=0;
 for(;;){let last;
  for(let attempt=1;attempt<=attempts;attempt++){
   const details={requestedURL:key,expectedSha256:expected.sha256,expectedBytes:expected.size,attempt,retryCycle:retries};
   diagnostic({level:'info',kind:'dependency.request',...details});
   try{
    const r=await fetcher(url,{credentials:'same-origin',cache:'no-cache'});Object.assign(details,{finalURL:r.url,status:r.status,contentType:r.headers.get('content-type'),declaredLength:r.headers.get('content-length')});
    if(!r.ok){let cause;if(r.headers.get('content-type')?.includes('application/json')){const body=await r.text();if(body.length<65536)try{cause=JSON.parse(body).error;}catch{}}
     throw new DependencyError('DEPENDENCY_HTTP','Native module download failed (HTTP '+r.status+').',{...details,transport:cause});}
    const reader=r.body?.getReader();if(!reader)throw new DependencyError('DEPENDENCY_BODY','Missing native module response body.',details);
    // One exact-sized buffer; no clone of a large response or unbounded error page.
    const bytes=new Uint8Array(expected.size);let count=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;if(count+value.length>bytes.length)throw new DependencyError('DEPENDENCY_SIZE','Native module response exceeds its expected size.',{...details,receivedBytes:count+value.length});bytes.set(value,count);count+=value.length;}}catch(e){await reader.cancel().catch(()=>{});throw e;}
    Object.assign(details,{receivedBytes:count,header:hex(bytes.subarray(0,Math.min(count,8)))});
    if(count!==expected.size||bytes[0]!==0||bytes[1]!==97||bytes[2]!==115||bytes[3]!==109)throw new DependencyError('DEPENDENCY_CONTENT','The response is not the expected WebAssembly module.',details);
    const digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));details.receivedSha256=digest;
    if(digest!==expected.sha256)throw new DependencyError('DEPENDENCY_INTEGRITY','Native module integrity verification failed.',details);
    diagnostic({level:'info',kind:'dependency.ready',key,...details});return bytes;
   }catch(cause){last=cause instanceof DependencyError?cause:new DependencyError('DEPENDENCY_NETWORK','Native module download could not complete.',details,cause);diagnostic({level:'warning',kind:'dependency.failed',error:last});if(attempt<attempts)await delay(250*2**(attempt-1));}
  }
  // Pause only this pending load. Its owning worker, image and earlier results survive.
  if(!wait)throw last;await wait(key,last);retries++;
 }
}
export async function instantiateDependency(binary,url,imports,expected,options){
 if(binary)return WebAssembly.instantiate(binary,imports);
 const bytes=await dependencyBytes(url,expected,options);
 try{return await WebAssembly.instantiate(bytes,imports);}catch(cause){const error=new DependencyError('DEPENDENCY_COMPILE','Verified WebAssembly module could not compile.',{requestedURL:String(url),expectedSha256:expected.sha256,expectedBytes:expected.size},cause);diagnostic({level:'error',kind:'dependency.compile',error});throw error;}
}
