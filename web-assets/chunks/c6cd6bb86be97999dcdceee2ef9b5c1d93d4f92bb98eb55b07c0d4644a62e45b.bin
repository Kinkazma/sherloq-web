import "../../runtime-context.js?v=0.14.5";
import {RoutedDenseImageEngine} from './dense-surface-routing.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {densePassPlan,DENSE_PROFILES,denseSearchContexts} from './dense-profiles.js';
import {denseCrop,denseDistancePolicy,denseCompactAxes,denseCropAxes} from './dense-regions.js';
import {denseDescriptorShape} from './dense-math.js';
import {DenseFieldPool} from './dense-pool.js';
import {sampleDenseLinks} from './dense-links.js';

export function denseImageParams(input={}){
 const p={profile:DENSE_PROFILES[0],patch:8,iterations:8,flip:false,texture:2,radius:600,minimum:5,auto:false,compact:false,regions:[],excluded:[],guides:[],compare:false,threshold:.3,coherence:true,errorThreshold:3,minimumComponent:6,limit:6000,...input};
 requireValue(Object.keys(input).every(k=>Object.hasOwn(p,k)&&['profile','patch','iterations','flip','texture','radius','minimum','auto','compact','regions','excluded','guides','compare','threshold','coherence','errorThreshold','minimumComponent','limit'].includes(k)),'Unknown dense image parameter.');
 requireValue(DENSE_PROFILES.includes(p.profile)&&Number.isInteger(p.patch)&&p.patch>=(p.profile===DENSE_PROFILES[0]?2:3)&&p.patch<=32&&Number.isInteger(p.iterations)&&p.iterations>=1&&p.iterations<=100,'Invalid dense algorithm settings.');
 for(const name of ['texture','radius','minimum','threshold','errorThreshold'])requireValue(Number.isFinite(p[name])&&p[name]>=0,'Invalid dense '+name);
 for(const name of ['flip','auto','compact','compare','coherence'])requireValue(typeof p[name]==='boolean','Invalid dense '+name);
 for(const name of ['limit','minimumComponent'])requireValue(Number.isSafeInteger(p[name])&&p[name]>=1&&p[name]<=0x7fffffff,'Invalid dense '+name);
 denseSearchContexts(p.regions,p.compare);denseSearchContexts(p.excluded);denseSearchContexts(p.guides);
 return structuredClone(p);
}
export function denseImageJobs(image,p){
 const plan=densePassPlan(p.profile,{...p,width:image.width,height:image.height}),contexts=denseSearchContexts(p.regions,p.compare);
 const policy=denseDistancePolicy(p,p.regions,p.compare),axes=p.compact&&!p.compare?denseCompactAxes(image.width,image.height,p.guides):null;
 const jobs=[];
 for(const pass of plan.passes)for(const [index,context] of contexts.entries()){
  const crop=denseCrop(image.width,image.height,context.regions,Math.max(pass.patch,pass.targetPatch));
  const shape=denseDescriptorShape(crop.width,crop.height,pass.method,Math.max(pass.patch,pass.targetPatch));
  const local=paths=>paths.map(poly=>poly.map(([x,y])=>[x-crop.x,y-crop.y]));
  jobs.push({sourceImage:image,crop,width:crop.width,height:crop.height,pass,context:{...context,origin:[crop.x,crop.y]},
   eligibility:{regions:local(context.regions),excluded:local(p.excluded),texture:p.texture},
   options:{iterations:p.iterations,radius:p.compare?policy.radius:policy.radii[index],minimum:p.minimum,compare:p.compare,gap:policy.gap,axes:denseCropAxes(axes,crop,shape.width,shape.height,shape.shift),threshold:p.threshold},
   coherence:p.coherence?{threshold:p.threshold,errorThreshold:p.errorThreshold,minimum:p.minimumComponent,radius:Math.min(6,p.patch)}:null});
 }
 return {jobs,plan,contexts,policy};
}
const analysisKey=p=>JSON.stringify(Object.fromEntries(Object.entries(p).filter(([k])=>!['threshold','coherence','errorThreshold','minimumComponent','limit'].includes(k))));

// This source-level controller exposes dense evidence, not geometrically verified
// CM2 biomes. A source is immutable for the lifetime of this controller.
export class DenseImageEngine {
 constructor(image,budget,profile={}){
  if(image?.surface){this.paged=new RoutedDenseImageEngine(image,budget,profile);return;}
  requireValue(image?.data instanceof Uint8Array&&Number.isSafeInteger(image.width)&&Number.isSafeInteger(image.height)&&image.data.length===image.width*image.height*3,'RGB8 dense source required.');
  this.image=image;this.budget=budget;this.pool=new DenseFieldPool(budget,profile);this.cached=null;this.partial=null;this.checkpointKey=null;this.busy=false;this.disposed=false;this.generation=0;
 }
 clearCheckpoint(key){if(this.paged)return this.paged.clearCheckpoint?.(key);if(this.checkpointKey===key)return this.clear();}
 clear(){if(this.paged)return this.paged.clear();this.generation++;this.pool.clear();this.cached?.release();this.cached=null;this.partial?.release();this.partial=null;this.checkpointKey=null;}
 dispose(){if(this.paged)return this.paged.dispose();this.clear();this.pool.dispose();this.disposed=true;}
 async analyze(input={},hooks={}){
  if(this.paged)return this.paged.analyze(input,hooks);
  requireValue(!this.disposed&&!this.busy,'Dense engine unavailable or busy.');checkAbort(hooks.signal);const p=denseImageParams(input),key=JSON.stringify([analysisKey(p),hooks.backend??null]),generation=this.generation;
  this.busy=true;
  try{
   const checkpointKey=hooks.checkpointKey??null,checkpointIdentity=JSON.stringify([p,hooks.backend??null]);requireValue(checkpointKey===null||typeof checkpointKey==='string','Invalid dense checkpoint key.');if(this.partial&&(this.partial.key!==checkpointKey||this.partial.identity!==checkpointIdentity)){this.partial.release();this.partial=null;}this.checkpointKey=checkpointKey;
   const {jobs,plan,contexts,policy}=denseImageJobs(this.image,p);let partial,cached=this.cached?.key===key,answer;
   if(cached){
    const refilter=jobs.map((j,i)=>({width:this.cached.answer.results[i].width,height:this.cached.answer.results[i].height,pass:j.pass,context:j.context,field:this.cached.answer.results[i],options:j.options,coherence:j.coherence}));
    answer=await this.pool.run(refilter,hooks);
   }else{
    this.cached?.release();this.cached=null;
    if(checkpointKey){
     partial=this.partial??{key:checkpointKey,identity:checkpointIdentity,entries:new Array(jobs.length),metrics:null,release(){for(const entry of this.entries)entry?.release();this.entries=[];}};this.partial=partial;
     const missing=jobs.map((_,index)=>index).filter(index=>!partial.entries[index]);
     if(missing.length){const batch=await this.pool.run(missing.map(index=>jobs[index]),{...hooks,retainResult:(index,result,release)=>{partial.entries[missing[index]]={result,release};return true;}});partial.metrics=batch.metrics;batch.release();}
     answer={results:partial.entries.map(entry=>entry.result),metrics:{...partial.metrics,completedJobs:jobs.length,checkpoint:true},release:()=>partial.release()};
    }else answer=await this.pool.run(jobs,hooks);
   }
   if(this.disposed||generation!==this.generation){answer.release();throw new EngineError('CANCELLED','Dense generation was superseded.');}
   const cap=Math.max(1,Math.floor(p.limit/contexts.length));let displayRelease;
   try{
    displayRelease=this.budget.reserve(answer.results.reduce((sum,field)=>sum+Math.min(cap,field.targets.length)*4,0));
    const fields=answer.results.map(field=>{
     const links=sampleDenseLinks(field.targets,field.distancesSquared,field.selected,cap,hooks);
     return {...field,displayRows:links.rows,uniqueLinks:links.total};
    });
    if(cached)this.cached.release();
    let references=2;const drop=()=>{if(--references===0)answer.release();};
    this.cached={key,answer,release:drop};if(this.partial===partial)this.partial=null;let released=false;
    return {status:'raw-dense-evidence',fields,params:p,profile:plan,searchContexts:contexts,distancePolicy:policy,
     coordinates:'original-source-pixels',semantics:'Read-only full dense fields; regional geometry and supplemental detail verification must precede CM2 biome claims.',
     release(){if(!released){released=true;displayRelease();drop();}},
     metrics:{...answer.metrics,cache:{field:cached,refilter:cached},generation}};
   }catch(error){displayRelease?.();if(!partial||this.partial!==partial)answer.release();throw error;}
  }finally{this.busy=false;}
 }
}
