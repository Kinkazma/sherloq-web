import "../../runtime-context.js?v=0.25.0";
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,denseConstructionOwner} from './dense-owner-retirement.js';
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
 const n=field.width*field.height,release=options.budget.reserve(8192*9);let selected,success=false;const owner=denseConstructionOwner([],{onRetirementOwner:options.onRetirementOwner},()=>selected?.dispose());
 try{selected=await createSegmentedBytes(n,options);const targets=new Int32Array(8192),squared=new Float32Array(8192),bytes=new Uint8Array(8192),limit=Math.fround(threshold*threshold);let last=performance.now();
  for(let offset=0;offset<n;offset+=8192){checkAbort(options.signal);if(performance.now()-last>=20){await controlCheckpoint(options.signal);last=performance.now();}const length=Math.min(8192,n-offset);await field.targets.readInto(new Uint8Array(targets.buffer,0,length*4),offset*4);await field.distancesSquared.readInto(new Uint8Array(squared.buffer,0,length*4),offset*4);for(let i=0;i<length;i++)bytes[i]=targets[i]>=0&&squared[i]<=limit?1:0;await selected.write(bytes.subarray(0,length),offset);}
  await selected.flush();owner.publish();success=true;return {selected,dispose:owner.dispose};
 }finally{try{if(!success)await acknowledgeDenseRetirement(()=>owner.dispose());}finally{release();}}
}
// Lifecycle only: successful sub-owners are removed after their ACK, and each
// cache reference is distinct from every published borrower's one-shot release.
function retainedOwner(retire){
 let references=1,retiring=false,cacheClosing=false;const close=onceDenseRetirement(async()=>{await acknowledgeDenseRetirement(retire);references=0;});
 const owner={get retiring(){return retiring||cacheClosing;},retain(){requireValue(references>0&&!retiring&&!cacheClosing,'Dense retained owner is retiring.');references++;},release(){if(references>1){references--;return;}if(!references)return;retiring=true;return close();}};
 const dropCache=onceDenseRetirement(()=>owner.release());owner.releaseCache=()=>{cacheClosing=true;return dropCache();};return owner;
}
async function retireEntries(entries,retire,forget){
 const outcomes=await Promise.allSettled(entries.map(async entry=>{await acknowledgeDenseRetirement(()=>retire(entry));forget(entry);}));const failure=outcomes.find(value=>value.status==='rejected');if(failure)throw failure.reason;
}
const retireDescriptor=entry=>{entry.retireDescriptor??=onceDenseRetirement(()=>entry.value?.dispose()??entry.checkpoint?.dispose());return entry.retireDescriptor();};
function partialOwner(key,length){
 const state={key,fields:new Array(length),descriptors:new Map(),masks:new Map(),owners:new Map(),workerJobs:0,peakWorkers:0,resourceRetries:0,retiring:false};
 state.release=onceDenseRetirement(async()=>{
  state.retiring=true;let failed=false,failure;
  for(const phase of [
   ()=>retireEntries([...state.fields.entries()].filter(([,field])=>field),([,field])=>field.dispose(),([index])=>{state.fields[index]=undefined;}),
   ()=>retireEntries([...state.descriptors],([,entry])=>retireDescriptor(entry),([id,entry])=>{if(state.descriptors.get(id)===entry)state.descriptors.delete(id);}),
   ()=>retireEntries([...state.owners],([,owner])=>owner.dispose(),([id,owner])=>{if(state.owners.get(id)===owner)state.owners.delete(id);}),
   ()=>retireEntries([...state.masks],([,mask])=>mask.dispose(),([id,mask])=>{if(state.masks.get(id)===mask)state.masks.delete(id);})
  ])try{await phase();}catch(error){if(!failed){failed=true;failure=error;}}
  if(failed)throw failure;state.fields=[];
 });return state;
}

// Same evidence lifecycle as DenseImageEngine, with stores for the full fields.
export class PagedDenseImageEngine{
 constructor(image,budget,profile={}){requireValue(image.surface?.descriptor.format==='rgb8'&&budget?.reserve,'Stored RGB dense source required.');this.image=image;this.budget=budget;this.profile=profile;this.cached=null;this.partial=null;this.selection=null;this.checkpointKey=null;this.busy=false;this.disposed=false;this.generation=0;this.pending=Promise.resolve();this.running=Promise.resolve();this.clearing=null;this.retiring=false;this.pendingSelection=null;}
 async retireSlot(name){const owner=this[name];await acknowledgeDenseRetirement(()=>owner?.releaseCache?owner.releaseCache():owner?.release());if(this[name]===owner)this[name]=null;}
 clear(){if(this.clearing)return this.clearing;this.generation++;this.retiring=true;this.stop?.abort();const task=(async()=>{await this.running;await retireDenseOwners(['pendingSelection','selection','partial','cached'].map(name=>()=>this.retireSlot(name)));this.checkpointKey=null;this.retiring=false;})();this.pending=this.clearing=task;void task.finally(()=>{if(this.clearing===task)this.clearing=null;if(this.pending===task)this.pending=Promise.resolve();}).catch(()=>{});return task;}
 clearCheckpoint(key){return this.checkpointKey===key?this.clear():Promise.resolve();}
 async dispose(){this.disposed=true;await this.clear();}
 async analyze(input={},hooks={}){
  requireValue(!this.disposed&&!this.busy&&!this.clearing&&!this.retiring,'Dense engine unavailable, retiring or busy.');const previous=this.pending;let finished;this.running=new Promise(resolve=>{finished=resolve;});this.busy=true;this.stop=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,this.stop.signal]):this.stop.signal,generation=this.generation;let raw,selection,selectionOwned=false,delivered=false;
  try{
   await previous;for(const name of ['pendingSelection','partial','selection','cached'])if(this[name]?.retiring||name==='pendingSelection'&&this[name])await this.retireSlot(name);checkAbort(signal);const p=denseImageParams(input),key=JSON.stringify([keyOf(p),hooks.backend??null]),shape=this.image.surface.descriptor,{jobs,plan,contexts,policy}=denseImageJobs({width:shape.width,height:shape.height},p),cached=this.cached?.key===key;
   const checkpointKey=hooks.checkpointKey??null;requireValue(checkpointKey===null||typeof checkpointKey==='string','Invalid dense checkpoint key.');
   if(this.checkpointKey!==checkpointKey)await retireDenseOwners(['partial','selection'].map(name=>()=>this.retireSlot(name)));this.checkpointKey=checkpointKey;
   if(this.selection&&this.selection.key!==JSON.stringify([p,hooks.backend??null])){await this.retireSlot('selection');}
   const outputPlan=planDenseOutputStorage(jobs,{coherence:p.coherence,availableBytes:this.budget.limit-this.budget.retained-this.budget.active}),{storage}=outputPlan;
   const options={budget:this.budget,storage:'auto',temporarySession:this.image.session,getTemporarySession:this.image.ensureTemporarySession,signal,onProgress:hooks.onProgress,maxWorkers:this.profile.maxWorkers??globalThis.navigator?.hardwareConcurrency??1};
   const fieldOptions={...options,storage,enableDenseGpu:this.profile.enableDenseGpu===true&&hooks.backend!=='cpu'};
   if(cached)raw=this.cached;
   else{
    if(this.cached)await this.retireSlot('cached');
    if(this.partial&&this.partial.key!==key)await this.retireSlot('partial');
    // Stop new admissions after a preparation failure, but drain useful fields
    // already computing before returning their owned results to the checkpoint.
    // Transactional kernel commands recover inside their field; an outer
    // coordinator failure still needs a fresh field owner.
    const state=this.partial??partialOwner(key,jobs.length);this.partial=state;
    const onRetirementOwner=owner=>{state.owners.set(owner,owner);return()=>{if(state.owners.get(owner)===owner)state.owners.delete(owner);};};
    options.onRetirementOwner=fieldOptions.onRetirementOwner=onRetirementOwner;
    await retireEntries([...state.owners].filter(([id])=>typeof id!=='number'),([,owner])=>owner.dispose(),([id,owner])=>{if(state.owners.get(id)===owner)state.owners.delete(id);});
    const {fields,descriptors}=state,pending=new Set(),pool=new DensePagedFieldPool(this.budget,{...this.profile,onRetirementOwner});let complete=false,completed=fields.filter(Boolean).length,firstError,hasFirstError=false,resourceRetries=state.resourceRetries;
    const rememberError=error=>{if(!hasFirstError){hasFirstError=true;firstError=error;}};
    const keep=()=>checkpointKey&&this.partial===state&&generation===this.generation&&!this.disposed;
    const requests=jobs.map(job=>{const pass=job.pass,region=[job.crop.x,job.crop.y,job.width,job.height];const make=(patch,mirror)=>{if(!pass.method&&jobs.some(j=>!j.pass.method&&j.pass.patch===patch&&j.pass.reflection&&j.crop.x===job.crop.x&&j.crop.y===job.crop.y&&j.width===job.width&&j.height===job.height))mirror=true;return {id:JSON.stringify([region,pass.method,patch,mirror]),region,method:pass.method,patch,mirror};};const first=make(pass.patch,pass.method?false:pass.reflection),second=pass.method&&(pass.reflection||pass.patch!==pass.targetPatch)?make(pass.targetPatch,pass.reflection):first;return {first,second,ids:[...new Set([first.id,second.id])]};});
    for(const entry of descriptors.values())entry.remaining=0;
    for(const [index,request] of requests.entries())if(!fields[index])for(const id of request.ids){const entry=descriptors.get(id)??{remaining:0,value:null};entry.remaining++;descriptors.set(id,entry);}
    const descriptor=async request=>{const entry=descriptors.get(request.id);if(!entry.value)entry.value=request.method?await preparePagedSift(this.image,{...options,region:request.region,patch:request.patch,support:request.patch,mirror:request.mirror,quarter:true,checkpoint:entry.checkpoint,onCheckpoint:value=>{entry.checkpoint=value;}}):await preparePagedZernike(this.image,{...options,region:request.region,patch:request.patch,reflection:request.mirror});entry.checkpoint=null;return entry.value;};
    const releaseDescriptors=async request=>{for(const id of request.ids){const entry=descriptors.get(id);if(entry.remaining>0)entry.remaining--;if(entry.remaining===0&&entry.value){await retireDescriptor(entry);entry.value=null;}}};
    const waitForRoom=async ticket=>{if(pending.size){ticket?.setState('waiting-child',{dependencies:[...pending].map(task=>task.resourceOperation).filter(Boolean)});try{await Promise.race(pending);}finally{ticket?.setState('ready');}}if(hasFirstError)throw firstError;checkAbort(signal);};
    try{
     for(const [jobIndex,job] of jobs.entries()){
      if(hasFirstError)throw firstError;checkAbort(signal);if(fields[jobIndex])continue;const pass=job.pass,support=Math.max(pass.patch,pass.targetPatch),region=[job.crop.x,job.crop.y,job.width,job.height],request=requests[jobIndex];let eligibility=state.masks.get(jobIndex),resourceOperation,ticketTransferred=false;
      try{
       let source,target;
       for(;;){try{if(!eligibility||eligibility.textureCheckpoint&&!eligibility.textureCheckpoint.complete)eligibility=await preparePagedEligibility(this.image,{...options,...job.eligibility,region,method:pass.method,patch:pass.patch,targetPatch:pass.targetPatch,checkpoint:eligibility,onCheckpoint:value=>{eligibility=value;state.masks.set(jobIndex,value);}});state.masks.set(jobIndex,eligibility);source=await descriptor(request.first);target=request.second===request.first?source:await descriptor(request.second);break;}catch(error){if(error.details?.recovery?.loopDetected||error.code!=='MEMORY_LIMIT'||!pending.size)throw error;resourceRetries++;await waitForRoom();}}
       if(hasFirstError)throw firstError;checkAbort(signal);
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
       const maskOwner=eligibility,dropMask=onceDenseRetirement(()=>maskOwner.dispose());eligibility=null;
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
        if(owner.ownsAllowed)await dropMask();else if(storage==='temporary'&&maskOwner.mask.spill)await runWithResourceRecovery(()=>maskOwner.mask.spill({signal}),recoveryOptions('store-mask'));
        const saved=owner,dropSaved=onceDenseRetirement(()=>saved.dispose());fields[jobIndex]={...saved,paged:true,shift:pass.method?1.5*support:0,context:job.context,pass,dispose:onceDenseRetirement(async()=>{await dropSaved();await dropMask();})};state.owners.delete(jobIndex);state.masks.delete(jobIndex);
        await releaseDescriptors(request);resourceOperation?.commit();hooks.onProgress?.({phase:'field-complete',completed:++completed,total:jobs.length,pass,context:job.context});
       }catch(error){rememberError(error);}finally{resourceOperation?.release();}})();
       finish.resourceOperation=resourceOperation;pending.add(finish);finish.then(()=>pending.delete(finish),error=>{pending.delete(finish);rememberError(error);});
      }finally{if(!ticketTransferred)resourceOperation?.release();if(eligibility&&!state.masks.has(jobIndex))await eligibility.dispose();}
     }
     await Promise.all(pending);if(hasFirstError)throw firstError;complete=true;
    }catch(error){const failure=hasFirstError?firstError:error;hooks.onProgress?.({phase:'resource-draining',error:failure===0||failure===false?failure:serializeEngineError(failure),activeFields:pending.size,completedFields:completed,totalFields:jobs.length,checkpointRetained:keep()});throw failure;}finally{
     if(!complete&&!keep())this.stop?.abort();await Promise.allSettled(pending);await pool.drain();state.workerJobs+=pool.jobs;state.peakWorkers=Math.max(state.peakWorkers,pool.peakWorkers);state.resourceRetries=resourceRetries;
     if(complete)await retireEntries([...descriptors],([,entry])=>retireDescriptor(entry),([id,entry])=>{if(descriptors.get(id)===entry)descriptors.delete(id);});
     else if(!keep()){await state.release();if(this.partial===state)this.partial=null;}
    }
    if(signal.aborted||generation!==this.generation||this.disposed){await state.release();if(this.partial===state)this.partial=null;throw new EngineError('CANCELLED','Dense generation superseded.');}
    const drainRetirements=()=>retireEntries([...state.owners],([,owner])=>owner.dispose(),([id,owner])=>{if(state.owners.get(id)===owner)state.owners.delete(id);});raw=Object.assign(retainedOwner(async()=>{await drainRetirements();await retireDenseOwners(fields);}),{key,fields,ownRetirement:onRetirementOwner,drainRetirements,execution:{workerJobs:state.workerJobs,peakWorkers:state.peakWorkers,descriptorStorage:'independent-hot-banks',resultStorage:storage,outputPlan,resourceRetries}});this.cached=raw;if(this.partial===state)this.partial=null;
   }
   options.onRetirementOwner=fieldOptions.onRetirementOwner=raw.ownRetirement;await raw.drainRetirements();
   const selectionKey=JSON.stringify([p,hooks.backend??null]);
   if(this.selection&&(this.selection.raw!==raw||this.selection.key!==selectionKey))await this.retireSlot('selection');
   selection=this.selection;
   if(!selection){raw.retain();const entries=[],dropRaw=onceDenseRetirement(()=>raw.release());selection=Object.assign(retainedOwner(async()=>{await retireEntries(entries.filter(Boolean),async entry=>{for(const name of ['coherence','links']){const owner=entry[name];await acknowledgeDenseRetirement(()=>owner?.dispose());if(entry[name]===owner)entry[name]=null;}for(const name of ['releaseRows','pendingRows']){const free=entry[name];await acknowledgeDenseRetirement(()=>free?.());if(entry[name]===free)entry[name]=null;}},()=>{});await dropRaw();entries.length=0;}),{key:selectionKey,raw,entries});selectionOwned=true;if(checkpointKey){this.selection=selection;selectionOwned=false;}}
   const cap=Math.max(1,Math.floor(p.limit/contexts.length)),fields=[];
   for(let i=0;i<raw.fields.length;i++){
    const entry=selection.entries[i]??(selection.entries[i]={});
    if(entry.links){const links=entry.links;await acknowledgeDenseRetirement(()=>links.dispose());if(entry.links===links)entry.links=null;}
    if(!entry.field){const operation=this.budget.beginOperation?.({owner:'patchmatch',id:'dense-postprocess:'+i});let cpu;try{
     cpu=await getExecutionScheduler(this.budget,{maxWorkers:options.maxWorkers}).acquire({cpu:1,signal,resourceOwner:'patchmatch',operation,label:'dense-postprocess'});
     const field=raw.fields[i];entry.coherence??=p.coherence?await runPagedDenseCoherence(field,{...fieldOptions,threshold:p.threshold,errorThreshold:p.errorThreshold,radius:Math.min(6,p.patch),minimum:p.minimumComponent}):await thresholdField(field,p.threshold,fieldOptions);
     const links=await samplePagedDenseLinks({...field,selected:entry.coherence.selected},cap,{...options,threshold:p.threshold});entry.links=links;let rows,releaseRows;
     try{releaseRows=this.budget.reserve(links.count*4);entry.pendingRows=releaseRows;rows=new Int32Array(links.count);await links.rows.readInto(new Uint8Array(rows.buffer));entry.field={...field,selected:entry.coherence.selected,errors:entry.coherence.errors,displayRows:rows,uniqueLinks:links.total,denseCount:links.denseCount};entry.releaseRows=releaseRows;entry.pendingRows=null;releaseRows=null;}finally{await acknowledgeDenseRetirement(()=>releaseRows?.());if(entry.pendingRows===releaseRows)entry.pendingRows=null;await acknowledgeDenseRetirement(()=>links.dispose());if(entry.links===links)entry.links=null;}
     operation?.commit();hooks.onProgress?.({phase:'dense-selection-complete',completed:i+1,total:raw.fields.length});
    }finally{cpu?.release();operation?.release();}}
    fields.push(entry.field);
   }
   if(this.disposed||generation!==this.generation)throw new EngineError('CANCELLED','Dense generation superseded.');
   checkAbort(signal);if(!selectionOwned)selection.retain();selectionOwned=false;const lease=selection;delivered=true;
   return {status:'raw-dense-evidence',fields,params:p,profile:plan,searchContexts:contexts,distancePolicy:policy,coordinates:'original-source-pixels',semantics:'Full stored dense fields; native global search and selection; geometry/detail required before biome claims.',metrics:{preflightExecutions:0,completedJobs:jobs.length,stored:true,parallel:raw.execution,cache:{field:!!cached,refilter:!!cached},generation,memory:this.budget.snapshot()},release:onceDenseRetirement(()=>lease.release())};
  }finally{try{if(!delivered&&selectionOwned){this.pendingSelection??={release:onceDenseRetirement(()=>selection.release()),get retiring(){return true;}};await this.retireSlot('pendingSelection');}}finally{this.stop=null;this.busy=false;finished();}}
 }
}
