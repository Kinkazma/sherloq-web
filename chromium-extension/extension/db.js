const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('sherloq-extension-v1', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('jobs', {keyPath: 'id'});
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function transaction(mode, run) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobs', mode), request = run(tx.objectStore('jobs'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error('Stockage interrompu.'));
  });
}
export const putJob = job => transaction('readwrite', store => store.put(job));
export const getJob = id => transaction('readonly', store => store.get(id));
export const deleteJob = id => transaction('readwrite', store => store.delete(id));
export async function updateJob(id,update){
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('jobs','readwrite'),store=tx.objectStore('jobs'),request=store.get(id);let value;
  request.onsuccess=()=>{try{const next=update(request.result);value=next===undefined?request.result:next;if(next===null)store.delete(id);else if(next!==undefined)store.put(next);}catch(error){reject(error);tx.abort();}};
  tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Stockage interrompu.'));
 });
}
export const allJobs = () => transaction('readonly', store => store.getAll());
export async function pruneJobs({tabId, all = false} = {}) {
  const jobs=(await allJobs()).sort((a,b)=>b.created-a.created),counts=new Map();let bytes=0;
  const now=Date.now();
  for(const snapshot of jobs)await updateJob(snapshot.id,job=>{
   if(!job||job.basket)return;
   if(all)return null;
   const owner=job.cacheOwnerTabId,pinned=job.transferUntil>now;
   if(pinned){if(owner===tabId&&tabId!==undefined){const {cacheOwnerTabId,...retained}=job;return retained;}return;}
   // Files retained by an open reader are workspace sources, not spare cache.
   // Closing the original browser PDF must not discard the reader's files.
   if(Number.isInteger(owner))return owner===tabId?null:undefined;
   counts.set(job.tabId,(counts.get(job.tabId)||0)+1);bytes+=job.blob?.size||0;
   if(tabId!==undefined&&job.tabId===tabId||now-job.created>30*60_000||counts.get(job.tabId)>20||bytes>512*1024**2)return null;
  });
}
