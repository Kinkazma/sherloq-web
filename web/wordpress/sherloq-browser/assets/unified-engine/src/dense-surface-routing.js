import "../../runtime-context.js?v=0.14.5";
import {byteView,byteLength} from './memory-range.js';
import {DenseImageEngine,denseImageParams,denseImageJobs} from './dense-image.js';
import {PagedDenseImageEngine} from './dense-paged-image.js';
import {planDenseResidentJobs} from './dense-pool.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

function arrayStore(array){return {byteLength:array.byteLength,storage:'memory',readInto(out,offset=0){requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset+byteLength(out)<=array.byteLength,'Invalid dense field range.');byteView(out).set(new Uint8Array(array.buffer,array.byteOffset+offset,byteLength(out)));return out;}};}

// Surface shape describes source ownership, not the choice of a calculation.
// A small surface can use the resident engine when its entire lifetime fits.
// Preserve the surface API: consumers still receive window-readable fields.
export class RoutedDenseImageEngine{
 constructor(image,budget,profile={}){this.image=image;this.budget=budget;this.profile=profile;this.engine=null;this.source=null;this.busy=false;this.disposed=false;this.generation=0;this.running=Promise.resolve();}
 async clear(){this.generation++;this.stop?.abort();const engine=this.engine;this.engine=null;await engine?.dispose();await this.running;this.source?.release();this.source=null;}
 async clearCheckpoint(key){await this.engine?.clearCheckpoint?.(key);}
 async dispose(){this.disposed=true;await this.clear();}
 async analyze(input={},hooks={}){
  requireValue(!this.disposed&&!this.busy,'Dense engine unavailable or busy.');this.busy=true;let finished;this.running=new Promise(resolve=>{finished=resolve;});const generation=this.generation;this.stop=new AbortController();hooks={...hooks,signal:hooks.signal?AbortSignal.any([hooks.signal,this.stop.signal]):this.stop.signal};
  try{
   checkAbort(hooks.signal);const p=denseImageParams(input),shape=this.image.surface.descriptor;
   const key=JSON.stringify(Object.fromEntries(Object.entries(p).filter(([name])=>!['threshold','coherence','errorThreshold','minimumComponent','limit'].includes(name))));
   if(this.engine&&key!==this.key){await this.engine.dispose();this.engine=null;this.source?.release();this.source=null;}
   if(!this.engine){
    const image={width:shape.width,height:shape.height,surface:this.image.surface},jobs=denseImageJobs(image,p).jobs,sourceBytes=shape.width*shape.height*3;
    const plan=planDenseResidentJobs(jobs,this.budget.limit-this.budget.retained-this.budget.active,{sourceBytes,readScratchBytes:Math.max(shape.sourceWidth??shape.width,shape.sourceHeight??shape.height)*3});
    if(plan.fits&&this.profile.residentSurface!==false){
     this.source=await this.image.surface.readWindow({x:0,y:0,width:shape.width,height:shape.height},{signal:hooks.signal});
     if(this.disposed||generation!==this.generation){this.source.release();this.source=null;throw new EngineError('CANCELLED','Dense generation was superseded.');}
     this.engine=new DenseImageEngine(this.source.pixels,this.budget,this.profile);this.route='resident-from-surface';this.plan=plan;
    }else{this.engine=new PagedDenseImageEngine(this.image,this.budget,this.profile);this.route='segmented';this.plan=plan;}
    this.key=key;
   }
   const result=await this.engine.analyze(p,hooks);
   try{
   if(this.disposed||generation!==this.generation)throw new EngineError('CANCELLED','Dense generation was superseded.');
   if(this.route==='resident-from-surface'){
    const fields=[],threshold=Math.fround(p.threshold*p.threshold);
    for(const field of result.fields){let denseCount=0;for(let i=0;i<field.targets.length;i++){if(i%65536===0)await controlCheckpoint(hooks.signal);if(field.targets[i]>=0&&field.distancesSquared[i]<=threshold)denseCount++;}const out={...field,paged:true,denseCount};for(const name of ['targets','distancesSquared','allowed','selected','errors'])if(field[name])out[name]=arrayStore(field[name]);fields.push(out);}result.fields=fields;
   }
   if(this.disposed||generation!==this.generation)throw new EngineError('CANCELLED','Dense generation was superseded.');result.metrics={...result.metrics,execution:this.route,residentAdmission:{fits:this.plan.fits,peakBytes:this.plan.peakBytes,reason:this.plan.reason??null}};return result;
   }catch(error){await result.release();throw error;}
  }finally{this.stop=null;this.busy=false;finished();}
 }
}
