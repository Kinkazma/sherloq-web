import "../../runtime-context.js?v=0.30.0";
import {acknowledgeDenseRetirement,onceDenseRetirement,retireDenseOwners,countedDenseOwner,createDenseRetirementLedger,cleanupDenseOwners} from './dense-owner-retirement.js';
import {clearPagedDetailCache} from './dense-paged-detail.js';
import {StrictDenseImageEngine} from './dense-strict-image.js';
import {strictDenseSource} from './dense-strict-source.js';
import {createStrictDenseDetailSampler} from './dense-strict-detail.js';
import {verifyDenseEvidence} from './dense-postprocess.js';
import {requireValue} from './errors.js';
export class StrictDenseCopyEngine{
 constructor(image,budget,{geometry,profile={},getSource}={}){requireValue(geometry&&['pairedBiomes','verifyCopyGeometry','copyPalette','createGeometryKernel'].every(k=>typeof geometry[k]==='function'),'M3 geometry adapter is required.');this.image=image.surface?{...image,get session(){return image.session;},width:image.surface.descriptor.width,height:image.surface.descriptor.height}:image;this.budget=budget;this.geometry=geometry;this.getSource=getSource;this.fields=new StrictDenseImageEngine(getSource,budget,profile);this.busy=false;this.disposed=false;this.checkpoint=null;this.retirements=createDenseRetirementLedger(budget);this.running=Promise.resolve();}
 async clear(){this.stop?.abort();await this.running;await this.retirements.drain();const checkpoint=this.checkpoint;await acknowledgeDenseRetirement(()=>checkpoint?.releaseCache());if(this.checkpoint===checkpoint)this.checkpoint=null;clearPagedDetailCache(this.image,this.budget);await this.fields.clear();this.retirements.release();}
 async clearCheckpoint(key){if(this.activeKey===key){this.stop?.abort();await this.running;}if(this.checkpoint?.key===key){const old=this.checkpoint;await acknowledgeDenseRetirement(()=>old.releaseCache());if(this.checkpoint===old)this.checkpoint=null;}await this.fields.clearCheckpoint?.(key);}
 async dispose(){this.disposed=true;await this.clear();await this.fields.dispose();}
 async analyze(input={},hooks={}){
  requireValue(!this.disposed&&!this.busy,'Dense copy engine unavailable or busy.');
  const {model='Similarity',tolerance=50,geometricThreshold=3,geometricMinimum=6,...params}=input;
  this.busy=true;let finished;this.running=new Promise(resolve=>{finished=resolve;});this.stop=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,this.stop.signal]):this.stop.signal,key=hooks.checkpointKey??null,identity=JSON.stringify([input,hooks.backend??null]);this.activeKey=key;let evidence,checkpoint,failed=false,primary;
  try{
   this.retirements.prepare(8);requireValue(key===null||typeof key==='string','Invalid dense checkpoint key.');
   if(this.checkpoint&&(this.checkpoint.key!==key||this.checkpoint.identity!==identity)){const old=this.checkpoint;await acknowledgeDenseRetirement(()=>old.releaseCache());if(this.checkpoint===old)this.checkpoint=null;}
   checkpoint=this.checkpoint;
   if(checkpoint)evidence=checkpoint.evidence;
   else{
    evidence=await this.fields.analyze({...params,coherence:model!=='None',errorThreshold:geometricThreshold,minimumComponent:geometricMinimum},{...hooks,signal});
    if(key){const owner=evidence,counted=this.retirements.counted(()=>owner.release());checkpoint={key,identity,evidence:owner,retain:()=>counted.retain(),release:()=>counted.release(),releaseCache:onceDenseRetirement(()=>counted.release())};this.checkpoint=checkpoint;}
   }
   const result=await verifyDenseEvidence(evidence,this.image,{budget:this.budget,geometry:this.geometry,model,tolerance,geometricThreshold,geometricMinimum,...hooks,signal,retainOutputs:true,detailSamplerFactory:async(_image,options)=>{const source=await strictDenseSource(this.getSource(),evidence.params.excluded,options);try{const sampler=await createStrictDenseDetailSampler(source,options),dispose=sampler.dispose;sampler.dispose=()=>{try{dispose();}finally{source.dispose();}};return sampler;}catch(error){source.dispose();throw error;}}});
   result.strictContexts=evidence.strictContexts;
   const raw=evidence,drop=onceDenseRetirement(()=>result.release()),dropEvidence=onceDenseRetirement(()=>checkpoint?checkpoint.release():raw.release());if(checkpoint)checkpoint.retain();evidence=null;
   return {...result,metrics:{...raw.metrics,preflightExecutions:0,memory:this.budget.snapshot()},release:onceDenseRetirement(async()=>{await dropEvidence();await drop();})};
  }catch(error){failed=true;primary=error;throw error;}finally{try{if(evidence&&!checkpoint){const owner=evidence;await cleanupDenseOwners(()=>this.retirements.retire([()=>owner.release()]),{failed,primary});}}finally{this.stop=null;this.activeKey=null;this.busy=false;finished();}}
 }
}
