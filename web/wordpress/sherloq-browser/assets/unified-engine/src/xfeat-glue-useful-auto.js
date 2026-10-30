import "../../runtime-context.js?v=0.30.0";
import {GlobalGlueAttention as Operator} from './xfeat-glue-operator-attention.js';
import {GlobalGlueAttention as Qualified} from './xfeat-glue-global-attention.js';
import {checkAbort} from './errors.js';
// Costs describe distinct pages that contribute to the scientific output.
// Setup is included in the projected complete partition cost, not hidden as warmup.
export function chooseUsefulGlueProfile({cpuMs,cpuWork,gpuMs,gpuWork,cpuSetupMs=0,gpuSetupMs=0,totalWork,cpuObservedMs=cpuMs,cpuObservedWork=cpuWork,gpuObservedMs=gpuMs,gpuObservedWork=gpuWork}){
 if(![cpuMs,cpuWork,gpuMs,gpuWork,totalWork].every(Number.isFinite)||cpuMs<=0||gpuMs<=0||cpuWork<=0||gpuWork<=0||totalWork<cpuObservedWork+gpuObservedWork)return{winner:'wasm',reason:'insufficient-comparable-useful-work'};
 const cpuRate=cpuMs/cpuWork,gpuRate=gpuMs/gpuWork,cpuEstimate=cpuSetupMs+cpuObservedMs+cpuRate*(totalWork-cpuObservedWork),gpuEstimate=cpuSetupMs+cpuObservedMs+gpuSetupMs+gpuObservedMs+gpuRate*(totalWork-cpuObservedWork-gpuObservedWork);
 return{winner:gpuEstimate<cpuEstimate*.9?'webgpu':'wasm',reason:'measured-useful-pages-with-complete-setup',cpuMs,cpuWork,gpuMs,gpuWork,cpuSetupMs,gpuSetupMs,totalWork,cpuObservedMs,cpuObservedWork,gpuObservedMs,gpuObservedWork,cpuMsPerWork:cpuRate,gpuMsPerWork:gpuRate,predictedCpuMs:cpuEstimate,predictedHybridMs:gpuEstimate};
}
export class UsefulAutoGlueAttention extends Operator{
 constructor(cpuOrt,gpuOrt,{totalWork}={}){super(cpuOrt);this.cpuOrt=cpuOrt;this.gpuOrt=gpuOrt;this.totalWork=totalWork;this.cpuPages=0;this.gpuPages=0;this.assignmentCpuPages=0;this.assignmentGpuPages=0;}
 async open(){const at=performance.now();this.cpuOperator=new Qualified(this.cpuOrt);this.cpuOperator.signal=this.signal;this.cpuOperator.verifyFmaEveryDot=false;await this.cpuOperator.open('wasm');this.cpuSetupMs=performance.now()-at;return this;}
 async openGpu(){const at=performance.now();this.gpuOperator=new Qualified(this.gpuOrt);this.gpuOperator.signal=this.signal;this.gpuOperator.verifyFmaEveryDot=false;await this.gpuOperator.open('webgpu');this.gpuSetupMs=performance.now()-at;}
 get selection(){return{...(this.profile??{winner:'wasm',reason:'insufficient-comparable-useful-work'}),cpuPages:this.cpuPages,gpuPages:this.gpuPages,assignmentCpuPages:this.assignmentCpuPages,assignmentGpuPages:this.assignmentGpuPages};}
 async run(name,inputs){
  checkAbort(this.signal);
  if(name!=='attention'){const useGpu=this.profile?.winner==='webgpu';if(useGpu)this.assignmentGpuPages++;else this.assignmentCpuPages++;return(useGpu?this.gpuOperator:this.cpuOperator).run(name,inputs);}
  const[heads,rows,dim]=inputs.q.dims,keys=inputs.k.dims[1],work=2*heads*rows*keys*dim;
  const shape=[heads,rows,keys,dim].join('/');
  if(this.probeShape&&this.probeShape!==shape&&!this.profile)this.profile={winner:'wasm',reason:'insufficient-comparable-useful-work'};
  this.probeShape??=shape;
  if(!this.profile&&this.cpuPages<2){const at=performance.now(),result=await this.cpuOperator.run(name,inputs),ms=performance.now()-at;this.cpuObservedMs=(this.cpuObservedMs??0)+ms;this.cpuObservedWork=(this.cpuObservedWork??0)+work;this.cpuService={cpuMs:ms,cpuWork:work};this.cpuPages++;return result;}
  if(!this.profile){
   if(!this.gpuOperator)await this.openGpu();const at=performance.now(),result=await this.gpuOperator.run(name,inputs),ms=performance.now()-at;this.gpuObservedMs=(this.gpuObservedMs??0)+ms;this.gpuObservedWork=(this.gpuObservedWork??0)+work;this.gpuPages++;
   if(this.gpuPages===2){this.profile=chooseUsefulGlueProfile({...this.cpuService,gpuMs:ms,gpuWork:work,totalWork:this.totalWork,cpuSetupMs:this.cpuSetupMs,gpuSetupMs:this.gpuSetupMs,cpuObservedMs:this.cpuObservedMs,cpuObservedWork:this.cpuObservedWork,gpuObservedMs:this.gpuObservedMs,gpuObservedWork:this.gpuObservedWork});this.metrics.usefulAutomaticSelection=true;}return result;
  }
  const useGpu=this.profile.winner==='webgpu';if(useGpu)this.gpuPages++;else this.cpuPages++;return(useGpu?this.gpuOperator:this.cpuOperator).run(name,inputs);
 }
 async dispose(){let failed=false,primary;for(const operator of[this.cpuOperator,this.gpuOperator])try{await operator?.dispose();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
}
