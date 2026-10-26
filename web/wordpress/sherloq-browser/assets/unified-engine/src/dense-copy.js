import "../../runtime-context.js?v=0.25.0";
import {clearPagedDetailCache} from './dense-paged-detail.js';
import {DenseImageEngine} from './dense-image.js';
import {verifyDenseEvidence} from './dense-postprocess.js';
import {requireValue} from './errors.js';
import {acknowledgeDenseRetirement,onceDenseRetirement} from './dense-owner-retirement.js';
export class DenseCopyEngine{
 constructor(image,budget,{geometry,profile={}}={}){requireValue(geometry&&['pairedBiomes','verifyCopyGeometry','copyPalette','createGeometryKernel'].every(k=>typeof geometry[k]==='function'),'M3 geometry adapter is required.');this.image=image.surface?{...image,get session(){return image.session;},width:image.surface.descriptor.width,height:image.surface.descriptor.height}:image;this.budget=budget;this.geometry=geometry;this.fields=new DenseImageEngine(this.image,budget,profile);this.busy=false;this.disposed=false;this.checkpoint=null;this.running=Promise.resolve();}
 async clear(){this.stop?.abort();await this.running;const checkpoint=this.checkpoint;await acknowledgeDenseRetirement(()=>checkpoint?.releaseCache());if(this.checkpoint===checkpoint)this.checkpoint=null;clearPagedDetailCache(this.image,this.budget);await acknowledgeDenseRetirement(()=>this.fields.clear());}
 async clearCheckpoint(key){if(this.activeKey===key){this.stop?.abort();await this.running;}if(this.checkpoint?.key===key){const old=this.checkpoint;await acknowledgeDenseRetirement(()=>old.releaseCache());if(this.checkpoint===old)this.checkpoint=null;}await acknowledgeDenseRetirement(()=>this.fields.clearCheckpoint?.(key));}
 async dispose(){this.disposed=true;await this.clear();await acknowledgeDenseRetirement(()=>this.fields.dispose());}
 async analyze(input={},hooks={}){
  requireValue(!this.disposed&&!this.busy,'Dense copy engine unavailable or busy.');
  const {model='Similarity',tolerance=50,geometricThreshold=3,geometricMinimum=6,...params}=input;
  this.busy=true;let finished;this.running=new Promise(resolve=>{finished=resolve;});this.stop=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,this.stop.signal]):this.stop.signal,key=hooks.checkpointKey??null,identity=JSON.stringify([input,hooks.backend??null]);this.activeKey=key;let evidence,checkpoint;
  try{
   requireValue(key===null||typeof key==='string','Invalid dense checkpoint key.');
   if(this.checkpoint&&(this.checkpoint.key!==key||this.checkpoint.identity!==identity)){const old=this.checkpoint;await acknowledgeDenseRetirement(()=>old.releaseCache());if(this.checkpoint===old)this.checkpoint=null;}
   checkpoint=this.checkpoint;requireValue(!checkpoint?.retiring,'Dense checkpoint owner is retiring.');
   if(checkpoint)evidence=checkpoint.evidence;
   else{
    evidence=await this.fields.analyze({...params,coherence:model!=='None',errorThreshold:geometricThreshold,minimumComponent:geometricMinimum},{...hooks,signal});
    if(key){let references=1,retiring=false,cacheRetirement;const owner=evidence,close=onceDenseRetirement(async()=>{await acknowledgeDenseRetirement(()=>owner.release());references=0;});checkpoint={key,identity,evidence:owner,releaseCache(){cacheRetirement??=onceDenseRetirement(()=>this.release());return cacheRetirement();},get retiring(){return retiring;},retain(){requireValue(references>0&&!retiring,'Dense checkpoint owner has retired or is retiring.');references++;},release(){if(references>1){references--;return;}if(references===0)return;retiring=true;return close();}};this.checkpoint=checkpoint;}
   }
   const result=await verifyDenseEvidence(evidence,this.image,{budget:this.budget,geometry:this.geometry,model,tolerance,geometricThreshold,geometricMinimum,...hooks,signal});
   const raw=evidence,dropResult=result.release,drop=onceDenseRetirement(dropResult);if(checkpoint)checkpoint.retain();evidence=null;
   return {...result,metrics:{...raw.metrics,preflightExecutions:0,memory:this.budget.snapshot()},release:onceDenseRetirement(async()=>{await drop();await acknowledgeDenseRetirement(()=>checkpoint?checkpoint.release():raw.release());})};
  }finally{try{if(evidence&&!checkpoint)await acknowledgeDenseRetirement(()=>evidence.release());}finally{this.stop=null;this.activeKey=null;this.busy=false;finished();}}
 }
}
