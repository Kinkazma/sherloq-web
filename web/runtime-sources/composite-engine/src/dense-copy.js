import {clearPagedDetailCache} from './dense-paged-detail.js';
import {DenseImageEngine} from './dense-image.js';
import {verifyDenseEvidence} from './dense-postprocess.js';
import {requireValue} from './errors.js';
export class DenseCopyEngine{
 constructor(image,budget,{geometry,profile={}}={}){requireValue(geometry&&['pairedBiomes','verifyCopyGeometry','copyPalette','createGeometryKernel'].every(k=>typeof geometry[k]==='function'),'M3 geometry adapter is required.');this.image=image.surface?{...image,get session(){return image.session;},width:image.surface.descriptor.width,height:image.surface.descriptor.height}:image;this.budget=budget;this.geometry=geometry;this.fields=new DenseImageEngine(this.image,budget,profile);this.busy=false;this.disposed=false;}
 clear(){this.stop?.abort();clearPagedDetailCache(this.image,this.budget);return this.fields.clear();}
 async dispose(){this.disposed=true;await this.clear();await this.fields.dispose();}
 async analyze(input={},hooks={}){
  requireValue(!this.disposed&&!this.busy,'Dense copy engine unavailable or busy.');
  const {model='Similarity',tolerance=50,geometricThreshold=3,geometricMinimum=6,...params}=input;
  this.busy=true;this.stop=new AbortController();const signal=hooks.signal?AbortSignal.any([hooks.signal,this.stop.signal]):this.stop.signal;let evidence;
  try{
   evidence=await this.fields.analyze({...params,coherence:model!=='None',errorThreshold:geometricThreshold,minimumComponent:geometricMinimum},{...hooks,signal});
   const result=await verifyDenseEvidence(evidence,this.image,{budget:this.budget,geometry:this.geometry,model,tolerance,geometricThreshold,geometricMinimum,...hooks,signal});
   const raw=evidence,drop=result.release;evidence=null;let released=false;
   return {...result,metrics:{...raw.metrics,preflightExecutions:0,memory:this.budget.snapshot()},async release(){if(released)return;released=true;drop();await raw.release();}};
  }finally{await evidence?.release();this.stop=null;this.busy=false;}
 }
}
