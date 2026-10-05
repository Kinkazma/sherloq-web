import {byteView,byteLength} from './memory-range.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,serializeEngineError} from './errors.js';
import {denseImageParams,denseImageJobs} from './dense-image.js';
import {preparePagedEligibility} from './dense-paged-regions.js';
import {preparePagedZernike} from './dense-paged-zernike.js';
import {preparePagedSift} from './dense-paged-sift.js';
import {runPagedDenseField} from './dense-paged.js';
import {runPagedDenseCoherence} from './dense-paged-coherence.js';
import {samplePagedDenseLinks} from './dense-paged-links.js';
import {createSegmentedBytes,markColdStoredResults} from './segmented-bytes.js';
import {DensePagedFieldPool} from './dense-paged-field-pool.js';
import {storeColdDenseField} from './dense-cold-field.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {planDenseOutputStorage} from './dense-preparation-plan.js';
import {runWithResourceRecovery,reclaimForResourceRecovery} from './resource-recovery.js';
const keyOf=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>!['threshold','coherence','errorThreshold','minimumComponent','limit'].includes(k))));
const plane=a=>({byteLength:a.byteLength,readInto(out,offset){byteView(out).set(new Uint8Array(a.buffer,a.byteOffset+offset,byteLength(out)));}});
async function thresholdField(field,threshold,options){
 const n=field.width*field.height,release=options.budget.reserve(8192*9);let selected,success=false;
 try{selected=await createSegmentedBytes(n,options);const targets=new Int32Array(8192),squared=new Float32Array(8192),bytes=new Uint8Array(8192),limit=Math.fround(threshold*threshold);let last=performance.now();
  for(let offset=0;offset<n;offset+=8192){checkAbort(options.signal);if(performance.now()-last>=20){await controlCheckpoint(options.signal);last=performance.now();}const length=Math.min(8192,n-offset);await field.targets.readInto(new Uint8Array(targets.buffer,0,length*4),offset*4);await field.distancesSquared.readInto(new Uint8Array(squared.buffer,0,length*4),offset*4);for(let i=0;i<length;i++)bytes[i]=targets[i]>=0&&squared[i]<=limit?1:0;await selected.write(bytes.subarray(0,length),offset);}
  await selected.flush();success=true;return {selected,dispose:()=>selected.dispose()};
 }finally{if(!success)await selected?.dispose();release();}
}
// Same evidence lifecycle as DenseImageEngine, with stores for the full fields.
export class PagedDenseImageEngine{
 constructor(image,budget,profile={}){requireValue(image.surface?.descriptor.format==='rgb8'&&budget?.reserve,'Stored RGB dense source required.');this.image=image;this.budget=budget;this.profile=profile;this.cached=null;this.partial=null;this.selection=null;this.checkpointKey=null;this.busy=false;this.disposed=false;this.generation=0;this.pending=Promise.resolve();this.running=Promise.resolve();}
 clear(){this.generation++;this.stop?.abort();this.pending=Promise.all([this.pending,this.running]).then(async()=>{const cached=this.cached,partial=this.partial,selection=this.selection;this.cached=this.partial=this.selection=null;this.checkpointKey=null;await Promise.all([cached?.release(),partial?.release(),selection?.release()]);});return this.pending;}
 clearCheckpoint(key){return this.checkpointKey===key?this.clear():Promise.resolve();}
 async dispose(){this.disposed=true;await this.clear();}
 async analyze(input={},hooks={}){
  requireValue(!this.disposed&&!this.busy,'Dense engine unavailable or busy.');const previous=this.pending;let finished;this.running=new Promise(resolve=>{finished=resolve;});this.busy=true;this.stop=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,this.stop.signal]):this.stop.signal,generation=this.generation;let raw,selection,selectionOwned=false,delivered=false;
  try{
   await previous;checkAbort(signal);const p=denseImageParams(input),key=JSON.stringify([keyOf(p),hooks.backend??null]),shape=this.image.surface.descriptor,{jobs,plan,contexts,policy}=denseImageJobs({width:shape.width,height:shape.height},p),cached=this.cached?.key===key;
   const checkpointKey=hooks.checkpointKey??null;requireValue(checkpointKey===null||typeof checkpointKey==='string','Invalid dense checkpoint key.');
   if(this.checkpointKey!==checkpointKey){const partial=this.partial,selection=this.selection;this.partial=this.selection=null;await Promise.all([partial?.release(),selection?.release()]);}this.checkpointKey=checkpointKey;
   if(this.selection&&this.selection.key!==JSON.stringify([p,hooks.backend??null])){const old=this.selection;this.selection=null;await old.release();}
   const outputPlan=planDenseOutputStorage(jobs,{coherence:p.coherence,availableBytes:this.budget.limit-this.budget.retained-this.budget.active}),{storage}=outputPlan;
   const options={budget:this.budget,storage:'auto',temporarySession:this.image.session,getTemporarySession:this.image.ensureTemporarySession,signal,onProgress:hooks.onProgress,maxWorkers:this.profile.maxWorkers??globalThis.navigator?.hardwareConcurrency??1};
   const fieldOptions={...options,storage,enableDenseGpu:this.profile.enableDenseGpu===true};
   if(cached)raw=this.cached;
   else{
    if(this.cached){const old=this.cached;this.cached=null;await old.release();}
    if(this.partial&&this.partial.key!==key){const old=this.partial;this.partial=null;await old.release();}
    // Stop new admissions after a preparation failure, but drain useful fields
    // already computing before returning their owned results to the checkpoint.
    // Transactional kernel commands recover inside their field; an outer
    // coordinator failure still needs a fresh field owner.
    const state=this.partial??{key,fields:new Array(jobs.length),descriptors:new Map(),masks:new Map(),owners:new Map(),workerJobs:0,peakWorkers:0,resourceRetries:0,async release(){await Promise.allSettled([...this.fields.filter(Boolean).map(f=>f.dispose()),...[...this.descriptors.values()].map(entry=>entry.value?.dispose()??entry.checkpoint?.dispose())]);await Promise.allSettled([...this.owners.values()].map(f=>f.dispose()));await Promise.allSettled([...this.masks.values()].map(mask=>mask.dispose()));this.fields=[];this.descriptors.clear();this.owners.clear();this.masks.clear();}};
    if(checkpointKey)this.partial=state;
    const {fields,descriptors}=state,pending=new Set(),pool=new DensePagedFieldPool(this.budget,this.profile);let complete=false,completed=fields.filter(Boolean).length,firstError,resourceRetries=state.resourceRetries;
    const keep=()=>checkpointKey&&this.partial===state&&generation===this.generation&&!this.disposed;
    const requests=jobs.map(job=>{const pass=job.pass,region=[job.crop.x,job.crop.y,job.width,job.height];const make=(patch,mirror)=>{if(!pass.method&&jobs.some(j=>!j.pass.method&&j.pass.patch===patch&&j.pass.reflection&&j.crop.x===job.crop.x&&j.crop.y===job.crop.y&&j.width===job.width&&j.height===job.height))mirror=true;return {id:JSON.stringify([region,pass.method,patch,mirror]),region,method:pass.method,patch,mirror};};const first=make(pass.patch,pass.method?false:pass.reflection),second=pass.method&&(pass.reflection||pass.patch!==pass.targetPatch)?make(pass.targetPatch,pass.reflection):first;return {first,second,ids:[...new Set([first.id,second.id])]};});
    for(const entry of descriptors.values())entry.remaining=0;
    for(const [index,request] of requests.entries())if(!fields[index])for(const id of request.ids){const entry=descriptors.get(id)??{remaining:0,value:null};entry.remaining++;descriptors.set(id,entry);}
    const descriptor=async request=>{const entry=descriptors.get(request.id);if(!entry.value)entry.value=request.method?await preparePagedSift(this.image,{...options,region:request.region,patch:request.patch,support:request.patch,mirror:request.mirror,quarter:true,checkpoint:entry.checkpoint,onCheckpoint:value=>{entry.checkpoint=value;}}):await preparePagedZernike(this.image,{...options,region:request.region,patch:request.patch,reflection:request.mirror});entry.checkpoint=null;return entry.value;};
    const releaseDescriptors=async request=>{for(const id of request.ids){const entry=descriptors.get(id);if(--entry.remaining===0&&entry.value){await entry.value.dispose();entry.value=null;}}};
    const waitForRoom=async ticket=>{if(pending.size){ticket?.setState('waiting-child',{dependencies:[...pending].map(task=>task.resourceOperation).filter(Boolean)});try{await Promise.race(pending);}finally{ticket?.setState('ready');}}if(firstError)throw firstError;checkAbort(signal);};
    try{
     for(const [jobIndex,job] of jobs.entries()){
      if(firstError)throw firstError;checkAbort(signal);if(fields[jobIndex])continue;const pass=job.pass,support=Math.max(pass.patch,pass.targetPatch),region=[job.crop.x,job.crop.y,job.width,job.height],request=requests[jobIndex];let eligibility=state.masks.get(jobIndex),resourceOperation,ticketTransferred=false;
      try{
       let source,target;
       for(;;){try{if(!eligibility||eligibility.textureCheckpoint&&!eligibility.textureCheckpoint.complete)eligibility=await preparePagedEligibility(this.image,{...options,...job.eligibility,region,method:pass.method,patch:pass.patch,targetPatch:pass.targetPatch,checkpoint:eligibility,onCheckpoint:value=>{eligibility=value;state.masks.set(jobIndex,value);}});state.masks.set(jobIndex,eligibility);source=await descriptor(request.first);target=request.second===request.first?source:await descriptor(request.second);break;}catch(error){if(error.details?.recovery?.loopDetected||error.code!=='MEMORY_LIMIT'||!pending.size)throw error;resourceRetries++;await waitForRoom();}}
       if(firstError)throw firstError;checkAbort(signal);
       let first,second;
       if(pass.method){const view=f=>({...f,viewWidth:job.width-3*support,viewHeight:job.height-3*support,offset:3*(support-f.patch)/2,quarter:pass.quarterTurn});first=view(source);second=view(target);}
       else{first=source.first;second=pass.reflection?source.second:source.first;}
       resourceOperation=this.budget.beginOperation?.({owner:'patchmatch',id:'dense-image-field:'+jobIndex});
       const input={first,second,mask:eligibility.mask,width:eligibility.width,height:eligibility.height,dimensions:eligibility.dimensions,axes:job.options.axes?.map(plane)},settings={...fieldOptions,...job.options,resourceOperation};
       let operation=state.owners.has(jobIndex)?Promise.resolve(state.owners.get(jobIndex)):pool.start(input,settings);
       while(!operation&&pending.size){await waitForRoom(resourceOperation);operation=pool.start(input,settings);}
       if(!operation){resourceOperation?.setState('io');try{await this.budget.reclaim?.(64*1024**2,{signal,owner:'patchmatch',operation:resourceOperation});}finally{resourceOperation?.setState('ready');}operation=pool.start(input,settings);}
       const localField=async()=>{const lease=await getExecutionScheduler(this.budget,{maxWorkers:options.maxWorkers}).acquire({cpu:1,signal,label:'dense-paged-local-memory-limited',resourceOwner:'patchmatch',operation:resourceOperation});try{return await runPagedDenseField(input,settings);}finally{lease.release();}};
       if(!operation)operation=localField();
       const maskOwner=eligibility;eligibility=null;
       // Kernel allocation/transport recovery has already preserved completed
       // commands inside the field. This outer fallback covers a lost coordinator
       // or failed initial field setup, whose owned output stores were released;
       // descriptors, mask and already completed hypotheses stay borrowed here.
       // Never wait on pending from this retry: pending includes this very field.
       const recoveryOptions=phase=>({budget:this.budget,signal,owner:'patchmatch',resourceOperation,operation:'dense-field-'+jobIndex,phase,
        onRecovery:event=>{if(event.phase==='resource-recovery')resourceRetries++;hooks.onProgress?.({...event,pass,context:job.context});},
        onReclaim:event=>hooks.onProgress?.({...event,pass,context:job.context}),onWait:event=>hooks.onProgress?.({...event,pass,context:job.context}),
        reclaim:({decision,recordReclamation})=>reclaimForResourceRecovery(this.budget,decision.error,{signal,owner:'patchmatch',resourceOperation,onReclaim:recordReclamation})});
       const repeatField=async()=>{
        if(operation){const initial=operation;operation=null;return initial;}
        return pool.start(input,settings)??localField();
       };
       ticketTransferred=true;const previouslyComputed=state.owners.has(jobIndex);
       const finish=(async()=>{try{
        let owner=await runWithResourceRecovery(repeatField,recoveryOptions('compute'));state.owners.set(jobIndex,owner);if(!previouslyComputed)resourceOperation?.commit();
        owner=await runWithResourceRecovery(()=>{resourceOperation?.setState('io');return storeColdDenseField(owner,settings);},recoveryOptions('store-completed'));state.owners.set(jobIndex,owner);markColdStoredResults(owner);
        if(owner.ownsAllowed)await maskOwner.dispose();else if(storage==='temporary'&&maskOwner.mask.spill)await runWithResourceRecovery(()=>maskOwner.mask.spill({signal}),recoveryOptions('store-mask'));
        const saved=owner;fields[jobIndex]={...saved,paged:true,shift:pass.method?1.5*support:0,context:job.context,pass,async dispose(){await Promise.all([saved.dispose(),maskOwner.dispose()]);}};state.owners.delete(jobIndex);state.masks.delete(jobIndex);
        await releaseDescriptors(request);resourceOperation?.commit();hooks.onProgress?.({phase:'field-complete',completed:++completed,total:jobs.length,pass,context:job.context});
       }catch(error){firstError??=error;}finally{resourceOperation?.release();}})();
       finish.resourceOperation=resourceOperation;pending.add(finish);finish.then(()=>pending.delete(finish),error=>{pending.delete(finish);firstError??=error;});
      }finally{if(!ticketTransferred)resourceOperation?.release();if(eligibility&&!state.masks.has(jobIndex))await eligibility.dispose();}
     }
     await Promise.all(pending);if(firstError)throw firstError;complete=true;
    }catch(error){const failure=firstError??error;hooks.onProgress?.({phase:'resource-draining',error:serializeEngineError(failure),activeFields:pending.size,completedFields:completed,totalFields:jobs.length,checkpointRetained:keep()});throw failure;}finally{
     if(!complete&&!keep())this.stop?.abort();await Promise.allSettled(pending);await pool.drain();state.workerJobs+=pool.jobs;state.peakWorkers=Math.max(state.peakWorkers,pool.peakWorkers);state.resourceRetries=resourceRetries;
     if(complete){await Promise.allSettled([...descriptors.values()].map(d=>d.value?.dispose()));descriptors.clear();}
     else if(!keep()){if(this.partial===state)this.partial=null;await state.release();}
    }
    if(signal.aborted||generation!==this.generation||this.disposed){if(this.partial===state)this.partial=null;await state.release();throw new EngineError('CANCELLED','Dense generation superseded.');}
    let references=1;raw={key,fields,execution:{workerJobs:state.workerJobs,peakWorkers:state.peakWorkers,descriptorStorage:'independent-hot-banks',resultStorage:storage,outputPlan,resourceRetries},retain(){references++;},async release(){if(--references===0)await Promise.all(fields.map(f=>f.dispose()));}};this.cached=raw;if(this.partial===state)this.partial=null;
   }
   const selectionKey=JSON.stringify([p,hooks.backend??null]);
   if(this.selection&&(this.selection.raw!==raw||this.selection.key!==selectionKey)){const old=this.selection;this.selection=null;await old.release();}
   selection=this.selection;
   if(!selection){raw.retain();let references=1;selection={key:selectionKey,raw,entries:[],retain(){references++;},async release(){if(--references===0){await Promise.allSettled(this.entries.map(e=>e?.coherence?.dispose()));for(const entry of this.entries)entry?.releaseRows?.();this.entries=[];await raw.release();}}};selectionOwned=true;if(checkpointKey){this.selection=selection;selectionOwned=false;}}
   const cap=Math.max(1,Math.floor(p.limit/contexts.length)),fields=[];
   for(let i=0;i<raw.fields.length;i++){
    const entry=selection.entries[i]??(selection.entries[i]={});
    if(!entry.field){const operation=this.budget.beginOperation?.({owner:'patchmatch',id:'dense-postprocess:'+i});let cpu;try{
     cpu=await getExecutionScheduler(this.budget,{maxWorkers:options.maxWorkers}).acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-postprocess'});
     const field=raw.fields[i];entry.coherence??=p.coherence?await runPagedDenseCoherence(field,{...fieldOptions,threshold:p.threshold,errorThreshold:p.errorThreshold,radius:Math.min(6,p.patch),minimum:p.minimumComponent}):await thresholdField(field,p.threshold,fieldOptions);
     const links=await samplePagedDenseLinks({...field,selected:entry.coherence.selected},cap,{...options,threshold:p.threshold});let rows,releaseRows;
     try{releaseRows=this.budget.reserve(links.count*4);rows=new Int32Array(links.count);await links.rows.readInto(new Uint8Array(rows.buffer));entry.field={...field,selected:entry.coherence.selected,errors:entry.coherence.errors,displayRows:rows,uniqueLinks:links.total,denseCount:links.denseCount};entry.releaseRows=releaseRows;releaseRows=null;}finally{releaseRows?.();await links.dispose();}
     operation?.commit();hooks.onProgress?.({phase:'dense-selection-complete',completed:i+1,total:raw.fields.length});
    }finally{cpu?.release();operation?.release();}}
    fields.push(entry.field);
   }
   if(this.disposed||generation!==this.generation)throw new EngineError('CANCELLED','Dense generation superseded.');
   checkAbort(signal);if(!selectionOwned)selection.retain();selectionOwned=false;const lease=selection;let released=false;delivered=true;
   return {status:'raw-dense-evidence',fields,params:p,profile:plan,searchContexts:contexts,distancePolicy:policy,coordinates:'original-source-pixels',semantics:'Full stored dense fields; native global search and selection; geometry/detail required before biome claims.',metrics:{preflightExecutions:0,completedJobs:jobs.length,stored:true,parallel:raw.execution,cache:{field:!!cached,refilter:!!cached},generation,memory:this.budget.snapshot()},async release(){if(released)return;released=true;await lease.release();}};
  }finally{try{if(!delivered&&selectionOwned)await selection.release();}finally{this.stop=null;this.busy=false;finished();}}
 }
}
