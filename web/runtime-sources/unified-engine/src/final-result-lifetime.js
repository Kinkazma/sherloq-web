import "../../runtime-context.js?v=0.33.3";
import {EngineError,requireValue,checkAbort} from './errors.js';
const ack=value=>{requireValue(value!==false&&value!==0,'Final result retirement was not acknowledged.');return value;};
const bindingKeys=['imageId','sourceSurfaceId','sourceRevision','sourceSha256','nativeSurfaceId','nativeRevision'];
const same=(a,b)=>!!a&&!!b&&bindingKeys.every(k=>Object.hasOwn(a,k)&&Object.hasOwn(b,k)&&a[k]===b[k]);
// Actual published stores keep their existing financing. Only cold ownership
// moves here; this registry never copies pixels or fabricates backing releases.
export function createFinalResultLifetime({budget,lookup,release,getBinding}){
 const entries=new Map(),bySurface=new Map(),loans=new Map();let sequence=0;
 const ids=r=>[...(r?.surfaces??[]),...(r?.tables??[])];
 function unborrowed(resources,transition){if(ids(resources).some(d=>loans.get(d.id)))throw new EngineError('FINAL_RESULT_BORROWED','A final result still has an active read or export loan.',{details:{ownershipUnchanged:true,transition}});}
 function requestBinding(request){const actual=getBinding(request.binding?.imageId);requireValue(actual&&same(actual,request.binding),'Final result Source binding changed.');return actual;}
 function validateResources(resources,binding){const all=ids(resources);requireValue(all.length>0&&new Set(all.map(v=>v.id)).size===all.length,'A unique final bundle is required.');for(const d of all){const value=lookup(d.id);requireValue(value?.imageId===binding.imageId&&value.record?.surface?.descriptor?.revision===d.revision,'Final result handle is not live on this Original.');requireValue(!bySurface.has(d.id),'Final result is already parked.');}unborrowed(resources,'park');return all;}
 function remove(entry){entries.delete(entry.token);for(const d of ids(entry.resources))if(bySurface.get(d.id)===entry)bySurface.delete(d.id);}
 async function retire(entry){if(entry.pending)return entry.pending;entry.state='retiring';const task=(async()=>{for(const kind of ['surfaces','tables'])for(const [id,d]of [...entry.remaining[kind]]){const found=lookup(id);if(found){requireValue(found.record?.surface?.descriptor?.revision===d.revision,'Retirement handle revision changed.');ack(await release(id));}entry.remaining[kind].delete(id);if(bySurface.get(id)===entry)bySurface.delete(id);}entry.state='evicted';})();entry.pending=task;void task.finally(()=>{if(entry.pending===task)entry.pending=null;}).catch(()=>{});return task;}
 function receipt(entry,extra={}){return{acknowledged:true,token:entry.token,ownerId:entry.ownerId,key:entry.key,binding:entry.binding,...extra};}
 async function take(request){const entry=entries.get(request.token);requireValue(entry&&entry.ownerId===request.ownerId&&entry.key===request.key,'Unknown final result capability.');requireValue(same(entry.binding,request.binding),'Final result binding differs.');requestBinding(request);
  if(entry.state==='retiring')throw new EngineError('RETIREMENT_PENDING','Final bundle still has unacknowledged retirement.');
  if(entry.state==='evicted'){remove(entry);return receipt(entry,{hit:false,retired:true});}
  unborrowed(entry.resources,'acquire');
  const live=ids(entry.resources).every(d=>lookup(d.id)?.record?.surface?.descriptor?.revision===d.revision);
  if(!live){await retire(entry);remove(entry);return receipt(entry,{hit:false,retired:true});}
  entry.state='acquired';remove(entry);return receipt(entry,{hit:true,resources:entry.resources});
 }
 const unregister=budget.registerAsyncReclaimer(async()=>{for(const entry of [...entries.values()])if(entry.state==='parked'&&ids(entry.resources).every(d=>!loans.get(d.id)))await retire(entry);return 0;},{owner:'final-depth-results',label:'parked-complete-final-bundles'});
 return{
  hasParked(){for(const entry of entries.values())if(entry.state==='parked'||entry.state==='retiring')return true;return false;},
  async prepareAdmission({plan,signal}={}){
   if(!this.hasParked())return{checked:false,retired:0};checkAbort(signal);
   let retired=0;for(const entry of entries.values())if(entry.state==='retiring'){
    if(ids(entry.resources).some(d=>loans.get(d.id)))throw new EngineError('BUSY','Final retirement still has active read/export loans.');await retire(entry);retired++;
   }
   if(!this.hasParked())return{checked:true,retired,retained:false,reason:'retirement-drained'};
   const complete=plan?.completeResidentAlternative===true&&Number.isSafeInteger(plan.bytes)&&plan.bytes>=0;
   if(complete&&budget.total()+plan.bytes<=budget.limit)return{checked:true,retired,retained:true};
   for(const entry of entries.values())if(entry.state==='parked'){
    if(complete&&budget.total()+plan.bytes<=budget.limit)break;
    checkAbort(signal);if(ids(entry.resources).some(d=>loans.get(d.id)))throw new EngineError('BUSY','An inactive final has active read/export loans during admission.');
    await retire(entry);retired++;
   }checkAbort(signal);return{checked:true,retired,retained:this.hasParked(),reason:complete?'complete-resident-bound':'opaque-admission'};
  },
  async control(request){requireValue(request&&typeof request.ownerId==='string'&&request.ownerId,'Final result owner is required.');
   if(request.action==='release'){const entry=entries.get(request.token);if(!entry)return{acknowledged:true,token:request.token,ownerId:request.ownerId,retired:true,absent:true};requireValue(entry.ownerId===request.ownerId,'Final result belongs to another scope.');if(entry.state==='parked')unborrowed(entry.resources,'release');else if(entry.state==='retiring'&&ids(entry.resources).some(d=>loans.get(d.id)))throw new EngineError('RETIREMENT_PENDING','Final bundle retirement still has active read or export loans.');await retire(entry);remove(entry);return receipt(entry,{retired:true});}
   if(request.action==='acquire')return take(request);
   requireValue(request.action==='park'&&typeof request.key==='string'&&request.key.length<=65536,'Invalid final result lifetime command.');const binding=requestBinding(request),all=validateResources(request.resources,binding);
   const maxEntries=request.maxEntries??1;requireValue(Number.isSafeInteger(maxEntries)&&maxEntries>=1&&maxEntries<=32,'Invalid retained final entry limit.');
   const others=[...entries.values()].filter(e=>e.ownerId===request.ownerId&&e.token!==request.take?.token);requireValue(others.length<maxEntries,'Retained final entry limit reached for this scope.');
   // Validate/claim the old cold owner before publishing the new cold owner.
   // There is no await between successful acquisition and the ownership swap.
   let acquisition;if(request.take)acquisition=await take({...request.take,ownerId:request.ownerId});if(request.onlyIfTakeHit&&acquisition?.hit!==true)return{acknowledged:true,ownerId:request.ownerId,parked:false,acquisition};
   const token='final-result-'+crypto.randomUUID(),entry={token,ownerId:request.ownerId,key:request.key,binding,resources:request.resources,state:'parked',order:++sequence,remaining:{surfaces:new Map((request.resources.surfaces??[]).map(d=>[d.id,d])),tables:new Map((request.resources.tables??[]).map(d=>[d.id,d]))}};entries.set(token,entry);for(const d of all)bySurface.set(d.id,entry);budget.notifyReclaimable?.();return receipt(entry,{parked:true,resources:entry.resources,...(acquisition?{acquisition}:{})});
  },
  borrow(surfaceIds){const used=[...new Set(surfaceIds.filter(Boolean))];for(const id of used)loans.set(id,(loans.get(id)??0)+1);let done=false;return()=>{if(done)return;done=true;for(const id of used){const n=loans.get(id)-1;if(n)loans.set(id,n);else loans.delete(id);}};},
  async clear(imageId){for(const entry of [...entries.values()])if(imageId===undefined||entry.binding.imageId===imageId){requireValue(ids(entry.resources).every(d=>!loans.get(d.id)),'Final bundle still has active reads/exports.');await retire(entry);remove(entry);}},
  async dispose(){await this.clear();unregister();},
  snapshot(){return{entries:entries.size,parked:[...entries.values()].filter(e=>e.state==='parked').length,retiring:[...entries.values()].filter(e=>e.state==='retiring').length,evicted:[...entries.values()].filter(e=>e.state==='evicted').length,loans:[...loans.values()].reduce((a,b)=>a+b,0)};}
 };
}
