import "../../runtime-context.js?v=0.30.0";
import {acknowledgeDenseRetirement,onceDenseRetirement} from './dense-owner-retirement.js';
import {getExecutionScheduler} from './execution-scheduler.js';
import {sourceRegionDomainShape} from './source-region-capabilities.js';
import {createDenseAdapter} from './dense-adapter.js';
import {StrictDenseCopyEngine} from './dense-strict-copy.js';
import {checkAbort,requireValue} from './errors.js';
// Registration is deliberately separate from implementation. The coordinator
// admits membership only after the complete engine and UI contracts qualify.
export async function sourceRegionDense(context){
 const{task,derived,view,domain,budget,profile,signal,onProgress,publishResult,version}=context;
 if(sourceRegionDomainShape(domain)!=='membership'){requireValue(typeof context.runLegacy==='function','The existing native Dense context route is required.');return context.runLegacy({});}
 requireValue(derived&&view?.domain?.fingerprint===domain?.fingerprint,'Strict Dense source owner required.');checkAbort(signal);
 let owner=derived.strictDenseOwner;
 if(!owner){const state={source:null};const scheduler=getExecutionScheduler(budget),executionProfile={...profile,maxWorkers:Math.min(profile?.maxWorkers??scheduler.capacity.cpu,scheduler.capacity.cpu)};const adapter=createDenseAdapter({budget,profile:executionProfile,version,publishResult,releasePublished:context.releaseResult,create:(image,budget,options)=>new StrictDenseCopyEngine(image,budget,{...options,getSource:()=>state.source})});let closed=false,pending;owner={state,adapter,dispose(){if(closed)return;if(pending)return pending;pending=Promise.resolve().then(async()=>{await acknowledgeDenseRetirement(()=>adapter.dispose());state.source=null;closed=true;});pending.catch(()=>{pending=null;});return pending;}};derived.strictDenseOwner=owner;}
 requireValue(!owner.state.source,'Strict Dense source owner is already active.');owner.state.source={view,domain,original:context.original};
 try{return await owner.adapter.run(task,derived,{signal,onProgress});}finally{owner.state.source=null;}
}
