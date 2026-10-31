import {fetchResource,MAX_BYTES} from './resources.js';
import {fetchPublicPMCPDF} from './pmc-pdf-source.js';

const chunkBytes=384*1024;
const isPDF=async value=>value?.blob instanceof Blob&&(await value.blob.slice(0,5).text())==='%PDF-';

// A PDF already visible in a tab may require the site's first-party session.
// Extension-origin requests can receive an HTML access page for the same URL.
// Keep this fallback in the isolated world and transfer bounded chunks only.
export async function readPDFInTab({url,key,maxBytes}){
 const target=new URL(url),page=new URL(location.href);
 if(!['http:','https:'].includes(target.protocol)||target.origin!==page.origin||target.username||target.password)return null;
 let last;
 for(const cache of ['force-cache','reload']){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45_000);
  try{
   const response=await fetch(target.href,{credentials:'include',mode:'same-origin',cache,signal:controller.signal});
   if(!response.ok)throw Error('Téléchargement : HTTP '+response.status);
   if(Number(response.headers.get('Content-Length'))>maxBytes)throw Error('Ressource trop volumineuse. Aucune réduction automatique.');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Ressource trop volumineuse. Aucune réduction automatique.');chunks.push(value);}}
   finally{await reader.cancel().catch(()=>{});}
   const blob=new Blob(chunks,{type:'application/pdf'});
   if((await blob.slice(0,5).text())!=='%PDF-')continue;
   const expiry=setTimeout(()=>{delete globalThis[key];},60_000);
   globalThis[key]={blob,expiry};
   return {size:blob.size,url:response.url||target.href};
  }catch(error){last=error;}
  finally{clearTimeout(timeout);}
 }
 if(last)throw last;return null;
}

export async function readPDFChunk({key,offset,length,release=false}){
 const entry=globalThis[key];if(!entry)return null;
 if(release){clearTimeout(entry.expiry);delete globalThis[key];return true;}
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>384*1024)return null;
 clearTimeout(entry.expiry);entry.expiry=setTimeout(()=>{delete globalThis[key];},60_000);
 const bytes=new Uint8Array(await entry.blob.slice(offset,offset+length).arrayBuffer());
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}

export async function fetchPDFResource(url,tab,{fetchDirect=fetchResource,fetchPublic=fetchPublicPMCPDF,execute=options=>chrome.scripting.executeScript(options)}={}){
 const target=new URL(url);
 if(!['http:','https:','file:'].includes(target.protocol)||target.username||target.password)throw Error('Ressource inaccessible depuis l’extension.');
 let failure;
 // Keep the ordinary direct path fast: a native PDF viewer can serialize
 // injected work. Only use that heavier recovery after direct/public access
 // has failed. No cookie inspection or new permission is needed.
 try{const value=await fetchDirect(target.href,{cache:'force-cache'});if(await isPDF(value))return value;}catch(error){failure=error;}
 try{const value=await fetchPublic(target.href);if(await isPDF(value))return value;}catch(error){failure??=error;}
 if(Number.isInteger(tab?.id)&&['http:','https:'].includes(target.protocol)){
  const key='__sherloqPDF_'+crypto.randomUUID();let documentId;
  try{
   const results=await execute({target:{tabId:tab.id,frameIds:[0]},func:readPDFInTab,args:[{url:target.href,key,maxBytes:MAX_BYTES}]});
   const source=results.find(result=>result.frameId===0&&result.result);documentId=source?.documentId;
   if(source?.result&&documentId){
    const {size,url:finalURL}=source.result;if(!Number.isSafeInteger(size)||size<5||size>MAX_BYTES)throw Error('Ce lien ne contient pas de PDF.');
    const chunks=[];
    for(let offset=0;offset<size;offset+=chunkBytes){
     const length=Math.min(chunkBytes,size-offset),result=await execute({target:{tabId:tab.id,documentIds:[documentId]},func:readPDFChunk,args:[{key,offset,length}]});
     const base64=result.find(value=>value.documentId===documentId)?.result;
     if(typeof base64!=='string'||base64.length!==4*Math.ceil(length/3))throw Error('Ce lien ne contient pas de PDF.');
     const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));if(bytes.length!==length)throw Error('Ce lien ne contient pas de PDF.');chunks.push(bytes);
    }
    const value={blob:new Blob(chunks,{type:'application/pdf'}),url:finalURL||target.href};
    if(await isPDF(value))return value;
   }
  }catch(error){failure=error;}
  finally{
   if(documentId)await execute({target:{tabId:tab.id,documentIds:[documentId]},func:readPDFChunk,args:[{key,release:true}]}).catch(()=>{});
  }
 }
 try{const value=await fetchDirect(target.href,{cache:'reload'});if(await isPDF(value))return value;}catch(error){failure=error;}
 throw failure||Error('Ce lien ne contient pas de PDF.');
}
