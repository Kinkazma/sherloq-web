// This function is injected as a bundled function, without imports or remote
// executable code. The Web origin retains ownership of its existing handle.
export async function inWebFolder({action,file,offset=0,count=1048576}={}){
 if(!['probe','read'].includes(action))throw Error('Invalid folder operation.');
 try{
  if(!file||typeof file.path!=='string'||file.path.length>500||/[\\?#%:\x00-\x20]/.test(file.path)||file.path.split('/').some(part=>!part||part==='.'||part==='..')||!/^[a-f0-9]{64}$/.test(file.sha256??'')||!Number.isSafeInteger(file.bytes)||file.bytes<1)throw Error('Invalid pinned folder file.');
  if(action==='read'&&(!Number.isSafeInteger(offset)||offset<0||offset>=file.bytes||!Number.isSafeInteger(count)||count<1||count>1048576))throw Error('Invalid folder read window.');
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('sherloq-dependency-library-v1');request.onupgradeneeded=()=>request.transaction.abort();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('Existing Web library unavailable.'));request.onblocked=()=>reject(Error('Web library is busy.'));});
  let folder;
  try{if(!db.objectStoreNames.contains('settings'))throw Error('Web library settings unavailable.');folder=await new Promise((resolve,reject)=>{const transaction=db.transaction('settings','readonly'),request=transaction.objectStore('settings').get('folder');let value;request.onsuccess=()=>{value=request.result;};transaction.oncomplete=()=>resolve(value);transaction.onerror=transaction.onabort=()=>reject(transaction.error||request.error||Error('Web folder unavailable.'));});}finally{db.close();}
  if(folder?.kind!=='directory'||typeof folder.queryPermission!=='function'||await folder.queryPermission({mode:'read'})!=='granted')throw Error('Reconnect the calculation folder in SHERLOQ Web.');
  const parts=file.path.split('/');for(const part of parts.slice(0,-1))folder=await folder.getDirectoryHandle(part);const source=await(await folder.getFileHandle(parts.at(-1))).getFile();
  if(source.size!==file.bytes)throw Error('Folder file length differs from its pinned identity.');
  if(action==='probe'){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await source.arrayBuffer()))].map(value=>value.toString(16).padStart(2,'0')).join('');return hash===file.sha256;}
  // Probe and the receiving extension verify the complete identity. Read only
  // the requested bytes here, avoiding a full-model hash for every 1 MiB slice.
  const bytes=new Uint8Array(await source.slice(offset,Math.min(source.size,offset+count)).arrayBuffer());let binary='';for(let index=0;index<bytes.length;index+=8192)binary+=String.fromCharCode(...bytes.subarray(index,index+8192));return btoa(binary);
 }catch(error){if(action==='probe')return false;throw error;}
}
