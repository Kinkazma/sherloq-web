/** Composite UI owners remain reachable through rejected ACKs. No scientific
 * parameters or model policy live here; retries are explicit drain calls. */
export function createCompositeResultRetirement(){
 const results=new Set(),clients=new Set();let pending;
 return {
  retainResult(client,result,presentation){if(![...results].some(r=>r.client===client&&r.result.id===result.id))results.add({client,result,presentation,nativeAcknowledged:false});},
  retainClient(client){if(client)clients.add(client);},
  snapshot(){return {results:results.size,clients:clients.size,pending:!!pending};},
  drain(){if(pending)return pending;const task=(async()=>{
   for(const r of [...results]){if(!r.nativeAcknowledged){await r.client.release(r.result.id);r.nativeAcknowledged=true;}await r.presentation?.close();results.delete(r);}
   for(const client of [...clients]){await client.dispose();clients.delete(client);}
  })();pending=task.finally(()=>{pending=null;});return pending;}
 };
}
