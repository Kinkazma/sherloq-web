import "../../runtime-context.js?v=0.30.0";
import {SparseGlueEngine as Legacy,SPARSE_GLUE_MODELS} from './sparse-glue-legacy.js';
import {XfeatGlobalGlueEngine} from './xfeat-glue-global.js';
import {requireValue} from './errors.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
export {SPARSE_GLUE_MODELS};
// XFeat retains its global attention caller. ALIKED and SIFT preserve their
// Native CSR candidate graph through the acknowledged paged caller.
export class SparseGlueEngine{
 constructor(budget,profile,{legacyFactory=(b,p)=>new Legacy(b,p),globalFactory=(b,p)=>new XfeatGlobalGlueEngine(b,p)}={}){this.budget=budget;this.profile=profile;this.legacy=legacyFactory(budget,profile);this.xfeat=globalFactory(budget,profile);this.disposed=false;this.running=false;}
 stop(){let failed=false,primary;for(const engine of [this.xfeat,this.legacy])try{engine.stop?.();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}if(failed)throw primary;}
 async match(settings,options={}){requireValue(!this.disposed&&!this.running,'Sparse Glue unavailable or busy.');this.running=true;try{const engine=['xfeat','aliked','sift'].includes(options.kind??'xfeat')?this.xfeat:this.legacy;engine.resourceOperation=this.resourceOperation;return await engine.match(settings,options);}finally{this.running=false;}}
 dispose(){if(this.disposal)return this.disposal;this.disposed=true;const task=(async()=>{let failed=false,primary;const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}else attachGpuCleanup(primary,error);}};await attempt(()=>this.stop());for(const engine of [this.xfeat,this.legacy])await attempt(()=>engine.dispose());if(failed)throw primary;})();this.disposal=task;void task.catch(()=>{if(this.disposal===task)this.disposal=null;});return task;}
}
