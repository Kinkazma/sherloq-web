(() => {
 if(globalThis.__sherloqResourcesBridge)return;globalThis.__sherloqResourcesBridge=true;
 addEventListener('message',event=>{const data=event.data;if(event.source!==window||event.origin!==location.origin||data?.type!=='sherloq-extension-resource'||typeof data.id!=='string'||data.id.length>100)return;
  chrome.runtime.sendMessage({type:'resource-shared-chunk',action:data.action,hash:data.hash,offset:data.offset,count:data.count}).then(response=>{
   if(!response?.ok)throw Error(response?.error||'Extension indisponible.');const value=response.value;
   if(value.base64){const bytes=Uint8Array.from(atob(value.base64),v=>v.charCodeAt(0));window.postMessage({type:'sherloq-extension-resource-result',id:data.id,value:{bytes:bytes.buffer}},location.origin,[bytes.buffer]);}
   else window.postMessage({type:'sherloq-extension-resource-result',id:data.id,value},location.origin);
  }).catch(error=>window.postMessage({type:'sherloq-extension-resource-result',id:data.id,error:error.message},location.origin));
 });
 window.postMessage({type:'sherloq-extension-resource-ready'},location.origin);
})();
