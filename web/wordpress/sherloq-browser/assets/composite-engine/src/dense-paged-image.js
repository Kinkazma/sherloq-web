import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {denseImageParams,denseImageJobs} from './dense-image.js';
import {preparePagedEligibility} from './dense-paged-regions.js';
import {preparePagedZernike} from './dense-paged-zernike.js';
import {preparePagedSift} from './dense-paged-sift.js';
import {runPagedDenseField} from './dense-paged.js';
import {runPagedDenseCoherence} from './dense-paged-coherence.js';
import {samplePagedDenseLinks} from './dense-paged-links.js';
import {createSegmentedBytes} from './segmented-bytes.js';
const keyOf=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>!['threshold','coherence','errorThreshold','minimumComponent','limit'].includes(k))));
const plane=a=>({byteLength:a.byteLength,readInto(out,offset){out.set(new Uint8Array(a.buffer,a.byteOffset+offset,out.length));}});
async function thresholdField(field,threshold,options){
 const n=field.width*field.height,release=options.budget.reserve(8192*9);let selected,success=false;
 try{selected=await createSegmentedBytes(n,options);const targets=new Int32Array(8192),squared=new Float32Array(8192),bytes=new Uint8Array(8192),limit=Math.fround(threshold*threshold);let last=performance.now();
  for(let offset=0;offset<n;offset+=8192){checkAbort(options.signal);if(performance.now()-last>=20){await controlCheckpoint(options.signal);last=performance.now();}const length=Math.min(8192,n-offset);await field.targets.readInto(new Uint8Array(targets.buffer,0,length*4),offset*4);await field.distancesSquared.readInto(new Uint8Array(squared.buffer,0,length*4),offset*4);for(let i=0;i<length;i++)bytes[i]=targets[i]>=0&&squared[i]<=limit?1:0;await selected.write(bytes.subarray(0,length),offset);}
  await selected.flush();success=true;return {selected,dispose:()=>selected.dispose()};
 }finally{if(!success)await selected?.dispose();release();}
}
// Same evidence lifecycle as DenseImageEngine, with stores for the full fields.
export class PagedDenseImageEngine{
 constructor(image,budget,profile={}){requireValue(image.surface?.descriptor.format==='rgb8'&&budget?.reserve,'Stored RGB dense source required.');this.image=image;this.budget=budget;this.profile=profile;this.cached=null;this.busy=false;this.disposed=false;this.generation=0;this.pending=Promise.resolve();}
 clear(){this.generation++;this.stop?.abort();const old=this.cached;this.cached=null;if(old)this.pending=Promise.all([this.pending,old.release()]);return this.pending;}
 async dispose(){this.disposed=true;await this.clear();}
 async analyze(input={},hooks={}){
  requireValue(!this.disposed&&!this.busy,'Dense engine unavailable or busy.');this.busy=true;this.stop=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,this.stop.signal]):this.stop.signal,generation=this.generation;let raw,filtered=[],displayRelease,delivered=false;
  try{
   await this.pending;checkAbort(signal);const p=denseImageParams(input),key=keyOf(p),shape=this.image.surface.descriptor,{jobs,plan,contexts,policy}=denseImageJobs({width:shape.width,height:shape.height},p),cached=this.cached?.key===key;
   const rawBytes=jobs.reduce((sum,j)=>{const border=j.pass.method?3*Math.max(j.pass.patch,j.pass.targetPatch):0;return sum+(j.width-border)*(j.height-border)*9;},0);
   const storage=rawBytes+64*1024**2<=this.budget.limit-this.budget.retained-this.budget.active?'auto':'temporary';
   const options={budget:this.budget,storage,temporarySession:this.image.session,getTemporarySession:this.image.ensureTemporarySession,signal,onProgress:hooks.onProgress,maxWorkers:this.profile.maxWorkers??globalThis.navigator?.hardwareConcurrency??1};
   if(cached)raw=this.cached;
   else{
    if(this.cached){const old=this.cached;this.cached=null;await old.release();}
    const fields=[],descriptors=new Map();let complete=false;
    try{
     for(const [jobIndex,job] of jobs.entries()){
      checkAbort(signal);const pass=job.pass,support=Math.max(pass.patch,pass.targetPatch),region=[job.crop.x,job.crop.y,job.width,job.height];let eligibility,field;
      try{
       eligibility=await preparePagedEligibility(this.image,{...options,...job.eligibility,region,method:pass.method,patch:pass.patch,targetPatch:pass.targetPatch});
       const descriptor=async(patch,mirror)=>{if(!pass.method&&jobs.some(j=>!j.pass.method&&j.pass.patch===patch&&j.pass.reflection&&j.crop.x===job.crop.x&&j.crop.y===job.crop.y&&j.width===job.width&&j.height===job.height))mirror=true;const id=JSON.stringify([region,pass.method,patch,mirror]);let value=descriptors.get(id);if(!value){value=pass.method?await preparePagedSift(this.image,{...options,region,patch,support:patch,mirror,quarter:true}):await preparePagedZernike(this.image,{...options,region,patch,reflection:mirror});descriptors.set(id,value);}return value;};
       const source=await descriptor(pass.patch,pass.method?false:pass.reflection);let first,second;
       if(pass.method){const target=pass.reflection||pass.patch!==pass.targetPatch?await descriptor(pass.targetPatch,pass.reflection):source,view=f=>({...f,viewWidth:job.width-3*support,viewHeight:job.height-3*support,offset:3*(support-f.patch)/2,quarter:pass.quarterTurn});first=view(source);second=view(target);}
       else{first=source.first;second=pass.reflection?source.second:source.first;}
       field=await runPagedDenseField({first,second,mask:eligibility.mask,width:eligibility.width,height:eligibility.height,dimensions:eligibility.dimensions,axes:job.options.axes?.map(plane)},{...options,...job.options});
       const owner=field,maskOwner=eligibility;field=null;eligibility=null;
       fields.push({...owner,paged:true,shift:pass.method?1.5*support:0,context:job.context,pass,async dispose(){await Promise.all([owner.dispose(),maskOwner.dispose()]);}});
       // Fields own their results; descriptor bounds are only useful to later
       // target searches. Keep shared SIFT preparation for later source views,
       // but release optional bounds and whole preparations at their last use.
       for(const [id,d] of descriptors){
        const [crop,method,patch,mirror]=JSON.parse(id);
        if(owner.metrics.siftBoundsFallback&&d.bounds&&d.bounds===second.bounds){await d.bounds.dispose();delete d.bounds;}
        if(!method){if(!jobs.slice(jobIndex+1).some(j=>!j.pass.method)){await d.dispose();descriptors.delete(id);}continue;}
        const later=jobs.slice(jobIndex+1).filter(j=>j.pass.method&&j.crop.x===crop[0]&&j.crop.y===crop[1]&&j.width===crop[2]&&j.height===crop[3]);
        const targetAgain=later.some(j=>j.pass.targetPatch===patch&&j.pass.reflection===mirror),sourceAgain=!mirror&&later.some(j=>j.pass.patch===patch);
        if(!targetAgain){await Promise.all([d.bounds?.dispose(),d.boundSamples?.dispose()]);delete d.bounds;delete d.boundSamples;}
        if(!targetAgain&&!sourceAgain){await d.dispose();descriptors.delete(id);}
       }
       hooks.onProgress?.({phase:'field-complete',completed:fields.length,total:jobs.length,pass,context:job.context});
      }finally{await field?.dispose();await eligibility?.dispose();}
     }
     complete=true;
    }finally{await Promise.allSettled([...descriptors.values()].map(d=>d.dispose()));if(!complete)await Promise.allSettled(fields.map(f=>f.dispose()));}
    if(signal.aborted||generation!==this.generation||this.disposed){await Promise.all(fields.map(f=>f.dispose()));throw new EngineError('CANCELLED','Dense generation superseded.');}
    let references=1;raw={key,fields,retain(){references++;},async release(){if(--references===0)await Promise.all(fields.map(f=>f.dispose()));}};this.cached=raw;
   }
   raw.retain();const cap=Math.max(1,Math.floor(p.limit/contexts.length)),fields=[];let displayBytes=0;
   displayRelease=()=>{this.budget.retained-=displayBytes;displayBytes=0;};
   for(let i=0;i<raw.fields.length;i++){
    const field=raw.fields[i],coherence=p.coherence?await runPagedDenseCoherence(field,{...options,threshold:p.threshold,errorThreshold:p.errorThreshold,radius:Math.min(6,p.patch),minimum:p.minimumComponent}):await thresholdField(field,p.threshold,options);filtered.push(coherence);
    const links=await samplePagedDenseLinks({...field,selected:coherence.selected},cap,{...options,threshold:p.threshold});let rows;
    try{this.budget.retain(links.count*4);displayBytes+=links.count*4;rows=new Int32Array(links.count);await links.rows.readInto(new Uint8Array(rows.buffer));}finally{await links.dispose();}
    fields.push({...field,selected:coherence.selected,errors:coherence.errors,displayRows:rows,uniqueLinks:links.total,denseCount:links.denseCount});
   }
   if(this.disposed||generation!==this.generation)throw new EngineError('CANCELLED','Dense generation superseded.');
   checkAbort(signal);const owned=filtered,lease=raw,dropDisplay=displayRelease;let released=false;delivered=true;
   return {status:'raw-dense-evidence',fields,params:p,profile:plan,searchContexts:contexts,distancePolicy:policy,coordinates:'original-source-pixels',semantics:'Full stored dense fields; native global search and selection; geometry/detail required before biome claims.',metrics:{preflightExecutions:0,completedJobs:jobs.length,stored:true,cache:{field:!!cached,refilter:!!cached},generation,memory:this.budget.snapshot()},async release(){if(released)return;released=true;try{await Promise.all(owned.map(f=>f.dispose()));await lease.release();}finally{dropDisplay();}}};
  }finally{if(!delivered){await Promise.allSettled(filtered.map(f=>f.dispose()));displayRelease?.();if(raw)await raw.release();}this.stop=null;this.busy=false;}
 }
}
