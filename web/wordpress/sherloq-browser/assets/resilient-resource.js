// Resume only an interrupted dependency. The same consumer keeps its completed bytes.
export function resourceFetch(fetcher,{emit=()=>{},wait,delay=ms=>new Promise(r=>setTimeout(r,ms)),attempts=3}={}){
 return async function fetchResource(input,init){
  const request=new Request(input,init),key=request.url,abort=new AbortController();
  const stop=()=>abort.abort(request.signal.reason);request.signal.addEventListener('abort',stop,{once:true});if(request.signal.aborted)stop();
  const signal=abort.signal,cleanup=()=>request.signal.removeEventListener('abort',stop);
  let offset=0,total=null,start=0,end=null,whole=null,encoded=false,current,stalled=0,lastFailureOffset=-1,cancelled=false;
  const fail=(message,details,cause)=>Object.assign(new Error(message,cause?{cause}:undefined),{name:'DependencyError',code:'DEPENDENCY_DOWNLOAD_FAILED',details:{requestedURL:key,...details}});
  const check=()=>{if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');};
  const cancellable=promise=>new Promise((resolve,reject)=>{const cancel=()=>{signal.removeEventListener('abort',cancel);reject(signal.reason??new DOMException('Aborted','AbortError'));};if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(value=>{signal.removeEventListener('abort',cancel);resolve(value);},error=>{signal.removeEventListener('abort',cancel);reject(error);});});
  const pause=error=>{check();if(!wait)throw error;return cancellable(wait(key,error,signal));};
  const rangeOf=r=>/^bytes (\d+)-(\d+)\/(\d+)$/.exec(r.headers.get('content-range')||'');
  async function obtain(resume){let last;
   for(;;){for(let attempt=1;attempt<=attempts;attempt++){
    check();const headers=new Headers(request.headers);
    // Range offsets refer to the unencoded representation. Compressed transport must
    // restart this resource and discard the already delivered prefix instead.
    if(resume&&offset&&!encoded)headers.set('Range','bytes='+(start+offset)+'-'+(end??''));
    emit({level:'info',kind:'dependency.fetch',requestedURL:key,offset:start+offset,attempt});
    try{const r=await fetcher(new Request(request,{headers,signal,cache:attempt>1||resume?'reload':request.cache}));const details={finalURL:r.url,status:r.status,contentType:r.headers.get('content-type'),contentRange:r.headers.get('content-range'),offset:start+offset};
     if(!r.ok){let transport;try{if(r.headers.get('content-type')?.includes('application/json')){const reader=r.body?.getReader(),part=await reader?.read();await reader?.cancel();if(part?.value?.length<65536)transport=JSON.parse(new TextDecoder().decode(part.value)).error; }else await r.body?.cancel();}catch{}throw fail('Dependency HTTP '+r.status,{...details,transport});}
     const range=rangeOf(r);
     if(resume&&offset&&!encoded&&(r.status!==206||!range||Number(range[1])!==start+offset||whole!==null&&Number(range[3])!==whole||end!==null&&Number(range[2])!==end||r.headers.get('content-encoding'))){await r.body?.cancel();throw fail('Dependency range resume mismatch.',details);}
     if(!resume){encoded=!!r.headers.get('content-encoding');if(r.status===206){if(!range){await r.body?.cancel();throw fail('Invalid dependency Content-Range.',details);}start=Number(range[1]);end=Number(range[2]);whole=Number(range[3]);if(!encoded)total=end-start+1;}else{const length=r.headers.get('content-length');if(length&&/^\d+$/.test(length)&&!encoded){total=Number(length);whole=total;}}}
     emit({level:'info',kind:'dependency.response',...details});return r;
    }catch(error){check();last=error?.code?error:fail('Dependency network request failed.',{offset:start+offset,attempt},error);emit({level:'warning',kind:'dependency.failed',error:last});if(attempt<attempts)await cancellable(delay(250*2**(attempt-1)));}
   }await pause(last);}}
  let first;try{first=await obtain(false);}catch(e){cleanup();throw e;}if(!first.body){cleanup();return first;}current=first.body.getReader();
  let skip=0;
  const body=new ReadableStream({async pull(controller){
   for(;;){try{check();const part=await cancellable(current.read());if(cancelled)return;if(part.done){if(skip||total!==null&&offset!==total)throw fail('Dependency response was truncated.',{receivedBytes:offset,expectedBytes:total});cleanup();emit({level:'info',kind:'dependency.ready',key,receivedBytes:offset});controller.close();return;}let value=part.value;if(skip){const n=Math.min(skip,value.length);skip-=n;value=value.subarray(n);if(!value.length)continue;}offset+=value.byteLength;controller.enqueue(value);return;}
    catch(error){if(cancelled)return;if(signal.aborted){cleanup();await current.cancel().catch(()=>{});controller.error(error);return;}emit({level:'warning',kind:'dependency.stream-interrupted',requestedURL:key,receivedBytes:offset,error});stalled=offset===lastFailureOffset?stalled+1:1;lastFailureOffset=offset;try{await current.cancel().catch(()=>{});if(stalled>=attempts){await pause(error);stalled=0;}else await cancellable(delay(250*stalled));const next=await obtain(true);current=next.body.getReader();skip=encoded?offset:0;}catch(cause){cleanup();if(!cancelled)controller.error(cause);return;}}
   }
  },async cancel(reason){cancelled=true;abort.abort(reason);cleanup();await current.cancel(reason).catch(()=>{});}},{highWaterMark:0});
  const response=new Response(body,{status:first.status,statusText:first.statusText,headers:first.headers});Object.defineProperty(response,'url',{value:first.url});return response;
 };
}
