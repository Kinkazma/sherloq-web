// Unaccepted/replaced answers own their handles until each retirement ACK.
// This owner never changes the currently accepted result or the source.
export function createRetainedResultRetirement({resources,releaseSurface,releaseTable,protectedResources=()=>({surfaces:[],tables:[]})}){
 const records=new Set(),byOutput=new WeakMap();
 function record(output){if(!output||typeof output!=='object')return null;let value=byOutput.get(output);if(value)return value;const owned=resources(output);value={surfaces:new Set(owned.surfaces.map(v=>v.id)),tables:new Set(owned.tables.map(v=>v.id)),pending:null};byOutput.set(output,value);records.add(value);return value;}
 function retireRecord(value){if(!value)return Promise.resolve();if(value.pending)return value.pending;
  const pending=Promise.resolve().then(async()=>{const failures=[];for(const[kind,release]of [['surfaces',releaseSurface],['tables',releaseTable]])for(const id of [...value[kind]]){const protectedIds=new Set((protectedResources()[kind]??[]).map(v=>typeof v==='string'?v:v.id));if(protectedIds.has(id)){value[kind].delete(id);continue;}try{await release(id);value[kind].delete(id);}catch(error){failures.push(error);}}if(!value.surfaces.size&&!value.tables.size)records.delete(value);if(failures.length){const error=failures[0];if(failures.length>1&&Object.isExtensible(error))error.cleanupErrors=[...(error.cleanupErrors??[]),...failures.slice(1)];throw error;}});
  value.pending=pending;void pending.finally(()=>{if(value.pending===pending)value.pending=null;}).catch(()=>{});return pending;
 }
 return{track:output=>{record(output);},retire:output=>retireRecord(record(output)),async drain(){const failures=[];for(const value of [...records])try{await retireRecord(value);}catch(error){failures.push(error);}if(failures.length)throw failures.length===1?failures[0]:new AggregateError(failures,'Retained answers are still retiring.');},get pendingCount(){return records.size;}};
}
