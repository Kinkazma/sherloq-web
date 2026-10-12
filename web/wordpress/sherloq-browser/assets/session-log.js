import {runtimeContext,diagnostic,diagnosticValue,normalizeDiagnosticEvent} from './runtime-context.js';
export function summarizeSessionEvents(events){
 const levels={},kinds={},operations=new Map(),unresolvedFailures=new Set(),requests=new Map(),automaticContexts=new Map(),automaticRuns=new Map();let errors=0,warnings=0;
 const automatic=operation=>['analysis.complete','analysis.clones'].includes(operation);
 const requestKey=event=>JSON.stringify([event.context??'',event.sequence]);
 function automaticSnapshot(item,event,progress){
  const snapshot=progress.state;
  if(!snapshot?.states||typeof snapshot.states!=='object'||Array.isArray(snapshot.states))return;
  const states=Object.fromEntries(Object.entries(snapshot.states).filter(([,state])=>typeof state==='string'));
  if(!Object.keys(states).length)return;
  const request=requests.get(requestKey(event)),current=item.automaticRuns?.at(-1);
  const id=typeof progress.id==='string'?progress.id:request?.method==='run'?request.key:current?.id??requestKey(event);
  const key=JSON.stringify([item.operation,id]);let run=automaticRuns.get(key);
  if(!run){run={id,state:'running',eventIndex:event.index,time:event.time,groups:{},failures:[]};automaticRuns.set(key,run);(item.automaticRuns??=[]).push(run);}
  for(const [group,state]of Object.entries(states)){
   const previous=run.groups[group],reportedAttempt=snapshot.attempts?.[group];
   const attempt=Number.isSafeInteger(reportedAttempt)&&reportedAttempt>0?reportedAttempt:previous?.attempt??1;
   const error=snapshot.errors?.[group];
   run.groups[group]={state,attempt,...(error?{error:diagnosticValue(error)}:{})};
   if(state==='failed'&&!run.failures.some(f=>f.group===group&&f.attempt===attempt)){
    const failure={eventIndex:event.index,time:event.time,code:error?.code??'AUTOMATIC_GROUP_FAILED',message:error?.message??'Automatic group did not complete',phase:'automatic-state',group,attempt,runId:id,reportedViaGroup:true,...(error?{error:diagnosticValue(error)}:{})};
    run.failures.push(failure);item.failures.push(failure);unresolvedFailures.add(item.operation);
   }
  }
  run.lastEventIndex=event.index;run.lastEventTime=event.time;
  run.failedGroups=Object.values(run.groups).filter(group=>group.state==='failed').length;
  run.unfinishedGroups=Object.values(run.groups).filter(group=>!['done','skipped'].includes(group.state)).length;
  if(Object.values(run.groups).some(group=>['pending','running','waiting-memory'].includes(group.state)))run.state='running';
  // Settled detector groups still need presentation/corroboration. Only the
  // interface's terminal status establishes that the complete operation ended.
  if(item.automaticRuns.at(-1)===run){if(run.state==='running'){item.state='running';item.readiness='busy';}item.failedGroups=run.failedGroups;}
  item.groupFailureAttempts=item.failures.filter(f=>f.reportedViaGroup).length;
 }
 for(const raw of events){
  const event=normalizeDiagnosticEvent(raw);levels[event.level]=(levels[event.level]??0)+1;kinds[event.kind]=(kinds[event.kind]??0)+1;
  if(event.level==='error'&&event.error?.code!=='CANCELLED')errors++;if(event.level==='warning')warnings++;
  if(event.kind==='worker.request')requests.set(requestKey(event),{operation:event.operation,method:event.method,key:requestKey(event)});
  const progress=event.progress??event.operationContext?.progress;
  let operation=event.operation??event.operationContext?.operation;
  if(progress?.phase==='automatic-state')operation??=requests.get(requestKey(event))?.operation??automaticContexts.get(event.context??'');
  if(!operation)continue;
  if(automatic(operation))automaticContexts.set(event.context??'',operation);
  let item=operations.get(operation);if(!item){item={operation,state:'unknown',readiness:'unknown',closed:false,failures:[],completions:[]};operations.set(operation,item);}
  item.lastEventIndex=event.index;item.lastEventTime=event.time;
  if(event.kind==='tool.open')item.closed=false;if(event.kind==='tool.close')item.closed=true;
  if(automatic(operation)&&progress?.phase==='automatic-state')automaticSnapshot(item,event,progress);
  if(event.kind==='operation.status'){
   item.lastStatus=event.message;
   if(/^(?:Chargement|Loading)(?:$|[\s.·…])/.test(event.message))item.readiness='busy';
   if(/^(?:Calcul en cours|Calculating|Computing|Calculation in progress)/.test(event.message)){item.state='running';item.readiness='busy';}
   if(/^(?:Prêt|Ready)(?:$|[\s.·])/.test(event.message)){
    // Source loading also emits computation progress (decode and SHA-256),
    // then readiness. This stops a stale running status without inventing a
    // completed analysis or clearing an unresolved failure after a reset.
    item.readiness='ready';item.lastReadyEventIndex=event.index;item.lastReadyEventTime=event.time;
    item.state=['partial','suspended'].includes(item.state)?item.state:unresolvedFailures.has(operation)?'error':item.state==='completed'?'completed':'ready';
   }
   const run=item.automaticRuns?.at(-1);
   if(automatic(operation)&&/^(?:Analyse suspendue|Analysis paused|Arrêt avant la création d’un point de reprise|Stopped before a resume point was created)(?:$|[\s.·:])/.test(event.message)){item.state='suspended';item.readiness='ready';if(run)run.state='suspended';}
   if(automatic(operation)&&/^(?:Analyse partielle|Partial analysis)(?:$|[\s:·])/.test(event.message)){item.state='partial';item.readiness='ready';if(run)run.state='partial';}
   if(/^(?:Calcul terminé|Calculation complete|Calculation finished|Analysis complete|Analyse automatique terminée|Automatic analysis complete)(?:$|[\s.·])/.test(event.message)){
    // Exporting retained results may emit "Calcul terminé" after a partial
    // analysis. It must not erase failed groups or claim a full analysis.
    if(run?.state==='suspended'&&run.unfinishedGroups){item.state='suspended';item.readiness='ready';}
    else if(run?.unfinishedGroups){item.state='partial';item.readiness='ready';run.state='partial';}
    else{item.state='completed';item.readiness='ready';unresolvedFailures.delete(operation);item.completions.push({eventIndex:event.index,time:event.time});if(run)run.state='completed';}
   }
  }
  if(event.kind==='operation.error'||event.kind==='operation.status'&&event.level==='error'){
   item.state='error';item.readiness='unknown';unresolvedFailures.add(operation);const previous=item.failures.at(-1),code=event.error?.code??'OPERATION_FAILED';
   // A detailed error and its immediately displayed status describe one failure.
   if(event.kind==='operation.status'&&previous?.reportedViaStatus===false&&!previous.statusEventIndex&&previous.code===code&&Math.abs(Date.parse(event.time)-Date.parse(previous.time))<=100){previous.statusEventIndex=event.index;continue;}
   item.failures.push({eventIndex:event.index,time:event.time,code,message:event.error?.message??event.message,phase:event.operationContext?.progress?.phase,reportedViaStatus:event.kind==='operation.status'});
  }
 }
 return {errorEvents:errors,warningEvents:warnings,levels,kinds,operationFailures:[...operations.values()].reduce((n,o)=>n+o.failures.length,0),failedGroups:[...operations.values()].reduce((n,o)=>n+(o.failedGroups??0),0),groupFailureAttempts:[...operations.values()].reduce((n,o)=>n+(o.groupFailureAttempts??0),0),operations:[...operations.values()],failureCountsMeaning:'errorEvents counts raw error-level events; groupFailureAttempts counts distinct structured group failures by run/group/attempt; failedGroups counts currently failed groups in each automatic operation’s latest run. Their causes remain recorded even when the raw events were informational.',readinessMeaning:'The interface reported readiness; it does not establish a completed analysis or resolve an earlier failure.',completionMeaning:'The interface reported completion; scientific parity and archive integrity are not inferred.'};
}
export function createSessionLog({id=crypto.randomUUID(),indexedDB=globalThis.indexedDB,environment={},clock=()=>new Date().toISOString()}={}){
 const started=clock(),listeners=new Set(),recent=[],waiting=new Map();let serial=0,errors=0,groupFailure=false,pending=[],fallback=[],writing=Promise.resolve(),timer,storageError=null;
 const database=indexedDB?new Promise((resolve,reject)=>{const r=indexedDB.open('sherloq-session-'+id,1);r.onupgradeneeded=()=>r.result.createObjectStore('events',{keyPath:'index'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Diagnostic storage blocked'));}).catch(e=>{storageError=e.message;return null;}):Promise.resolve(null);
 function append(event){const entry={time:clock(),...diagnosticValue(normalizeDiagnosticEvent(event)),index:++serial};if(entry.level==='error'&&entry.error?.code!=='CANCELLED')errors++;const progress=entry.progress??entry.operationContext?.progress;if(progress?.phase==='automatic-state'&&progress.state?.states&&typeof progress.state.states==='object'&&!Array.isArray(progress.state.states)&&Object.entries(progress.state.states).some(([group,state])=>state==='failed'&&progress.state.errors?.[group]?.code!=='CANCELLED'))groupFailure=true;if(entry.kind==='dependency.wait')waiting.set(entry.key,entry);if(entry.kind==='dependency.ready'||entry.kind==='dependency.cancelled')waiting.delete(entry.key);pending.push(entry);recent.push(entry);if(recent.length>100)recent.shift();if(pending.length>=64)void flush();else timer??=setTimeout(()=>{timer=null;void flush();},200);for(const fn of listeners)fn(entry);return entry;}
 function flush(){clearTimeout(timer);timer=null;const batch=pending;pending=[];if(!batch.length)return writing;
  writing=writing.then(async()=>{const db=await database;if(!db){fallback.push(...batch);return;}try{await new Promise((resolve,reject)=>{const tx=db.transaction('events','readwrite');for(const e of batch)tx.objectStore('events').put(e);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});}catch(e){storageError=e.message;fallback.push(...batch);}});return writing;
 }
 async function events(){await flush();const db=await database;let rows=[];if(db)rows=await new Promise((resolve,reject)=>{const r=db.transaction('events').objectStore('events').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return [...rows,...fallback].sort((a,b)=>a.index-b.index);}
 const api={id,append,flush,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},get hasErrors(){return errors>0||groupFailure;},get length(){return serial;},get recent(){return structuredClone(recent);},get waiting(){return [...waiting.values()];},async report(){const logs=await events(),summary=summarizeSessionEvents(logs);return {schema:'sherloq.session/1',session:id,started,exported:clock(),environment:diagnosticValue(environment),eventCount:logs.length,errorCount:errors,documentedFailures:errors+summary.operations.reduce((n,operation)=>n+operation.failures.filter(f=>f.reportedViaGroup&&f.code!=='CANCELLED').length,0),documentedFailuresMeaning:'Raw error-level records plus deduplicated structured automatic group failure attempts; a documented calculation failure does not by itself establish a software defect.',storageError,summary,events:logs};},async close(){await flush();(await database)?.close();}};
 append({time:started,level:'info',kind:'session.start',environment});return api;
}
const n=globalThis.navigator;
export const sessionLog=typeof document!=='undefined'?createSessionLog({id:runtimeContext.session,environment:{uiVersion:'0.15.2',engineVersion:'0.35.0-export.3',userAgent:n?.userAgent,platform:n?.platform,languages:n?.languages,hardwareConcurrency:n?.hardwareConcurrency,crossOriginIsolated:globalThis.crossOriginIsolated}}):null;
if(sessionLog){runtimeContext.subscribe(e=>sessionLog.append(e));globalThis.addEventListener('pagehide',()=>{diagnostic({level:'info',kind:'session.pagehide'});void sessionLog.flush();});}
export async function reportWithSession(report={}){return {...report,sessionLog:await sessionLog?.report()};}
