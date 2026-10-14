// A service-worker update may coexist with a mounted workspace only while
// every source and descendant worker retains its immutable resource inventory.
// These small routing records are separate from model/chunk caches; activation
// neither removes their contents nor changes local feature/migration leases.
export function dependencyWorkerManifest(worker,expected){
 try{const url=new URL(typeof worker==='string'?worker:worker?.scriptURL),reference=new URL(expected);return url.origin===reference.origin&&url.pathname===reference.pathname&&/^[a-f0-9]{64}$/.test(url.searchParams.get('manifest')||'')?url.searchParams.get('manifest'):null;}catch{return null;}
}

export function createDependencyClientRouting({scope,manifest,clients,cacheStorage=globalThis.caches}){
 scope=new URL(scope);if(!/^[a-f0-9]{64}$/.test(manifest||''))throw Error('Dependency routing manifest identity missing');
 const memory=new Map();let cachePromise;
 const cache=()=>cachePromise??=Promise.resolve().then(()=>{if(!cacheStorage?.open)throw Error('Persistent SHERLOQ resource routing unavailable');return cacheStorage.open('sherloq-dependency-client-versions-v1');}).catch(error=>{cachePromise=null;throw error;});
 const session=client=>{try{const value=new URL(client?.url).searchParams.get('sherloqSession');return /^[a-f0-9-]{36}$/.test(value||'')?value:null;}catch{return null;}};
 const scoped=client=>{try{const url=new URL(client?.url);return url.origin===scope.origin&&url.href.startsWith(scope.href)||client?.type!=='window'&&url.protocol==='blob:'&&url.origin===scope.origin;}catch{return false;}};
 const address=(kind,id)=>new URL('__dependency_versions__/'+kind+'/'+encodeURIComponent(id),scope).href;
 function valid(record){if(record?.schema!=='sherloq.dependency-client-version/1'||record.scope!==scope.href||!/^[a-f0-9]{64}$/.test(record.manifest||'')||record.session!==null&&!/^[a-f0-9-]{36}$/.test(record.session||''))throw Error('Pinned SHERLOQ resource identity is invalid');return record;}
 async function read(kind,id){if(!id)return null;const key=address(kind,id);if(memory.has(key))return memory.get(key);const response=await(await cache()).match(key);if(!response)return null;const record=valid(await response.json());memory.set(key,record);return record;}
 async function lookup(client){if(!client)return null;return await read('client',client.id)||await read('session',session(client));}
 async function pin(client,hash,{replace=false,sessionId=session(client)}={}){
  if(typeof client?.id!=='string'||!client.id||client.id.length>500||!/^[a-f0-9]{64}$/.test(hash||'')||sessionId!==null&&!/^[a-f0-9-]{36}$/.test(sessionId||''))throw Error('Invalid SHERLOQ resource owner');
  const current=await lookup(client);if(current&&current.manifest!==hash&&!replace)throw Error('Mounted SHERLOQ resource identity cannot change');
  const shared=sessionId&&await read('session',sessionId);if(shared&&shared.manifest!==hash)throw Error('SHERLOQ worker session belongs to another resource version');
  const record={schema:'sherloq.dependency-client-version/1',scope:scope.href,manifest:hash,session:sessionId},storage=await cache(),keys=[address('client',client.id),...(sessionId?[address('session',sessionId)]:[])];
  for(const key of keys)await storage.put(key,new Response(JSON.stringify(record),{headers:{'Content-Type':'application/json'}}));
  for(const key of keys)memory.set(key,record);return record;
 }
 async function forRequest(event){
  if(event.request.mode==='navigate'){
   // A new document gets its own owner. Do not repin a session copied in a URL:
   // runtime-context creates the new document's session during its bootstrap.
   if(event.resultingClientId)await pin({id:event.resultingClientId},manifest,{replace:true,sessionId:null});return manifest;
  }
  const client=event.clientId?await clients.get(event.clientId):null;
  let record=await lookup(client||{id:event.clientId});
  if(!record)record=await read('session',session({url:event.request.url}));
  if(!record){if(!event.clientId&&!event.resultingClientId)return manifest;throw Error('Pinned SHERLOQ resource identity unavailable; reload this window.');}
  // The first worker script fetch is issued by its creator. Persist ownership
  // for resultingClientId before any imported module can request its bytes.
  if(event.resultingClientId)await pin({id:event.resultingClientId,url:event.request.url},record.manifest,{sessionId:record.session});
  return record.manifest;
 }
 async function prepareCoexistence(source,previousManifest,{verify,confirm}={}){
  if(!scoped(source)||source.type&&source.type!=='window'||!(await confirm(source)))throw Error('Only a bootstrapping SHERLOQ window may request resource activation');
  if(previousManifest!==null&&!/^[a-f0-9]{64}$/.test(previousManifest||''))throw Error('Previous SHERLOQ manifest identity missing');
  await verify(manifest);const retained=new Set();
  async function preserve(client){
   if(!scoped(client)||retained.has(client.id))return;
   const existing=await lookup(client),starting=client.id===source.id||client.type==='window'&&await confirm(client),hash=starting?manifest:existing?.manifest||previousManifest;
   if(!hash)throw Error('Cannot verify the resource version of an existing SHERLOQ window');
   await verify(hash);await pin(client,hash,{replace:starting});retained.add(client.id);
  }
  await preserve(source);
  await Promise.all((await clients.matchAll({type:'all',includeUncontrolled:true})).map(preserve));
  // A window/worker opened during the handshake must also be pinned. This is
  // a bounded membership check, not a demand to close mounted workspaces.
  await Promise.all((await clients.matchAll({type:'all',includeUncontrolled:true})).map(preserve));
  if((await clients.matchAll({type:'all',includeUncontrolled:true})).some(client=>scoped(client)&&!retained.has(client.id)))throw Error('A SHERLOQ window opened during resource preparation; retrying activation');
  return retained;
 }
 return {pin,lookup,forRequest,prepareCoexistence};
}
