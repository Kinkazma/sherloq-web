import {EngineError,requireValue} from './unified-engine/src/errors.js';
const modes=['cpu','webgpu','auto'],resolved=['cpu','webgpu'];
// This hook consumes an existing transversal decision. It cannot start a job,
// create a timer/GPU, observe timings, explore, persist or change a preference.
// No hook means the historical CPU training default remains unresolved Auto;
// it is explicitly not advertised as a machine performance recommendation.
export async function prnuTrainingBackendChoice(requested='auto',resolve,context={}){
 requireValue(modes.includes(requested),'Invalid PRNU requested backend mode.');
 if(resolve===undefined){return {requested,...(requested==='auto'?{}:{backend:requested}),basis:requested==='auto'?'unrouted-existing-cpu-default':'human-request',adaptive:false};}
 requireValue(typeof resolve==='function','Invalid PRNU transversal backend resolver.');
 const recommendation=await resolve(Object.freeze({operation:'noise.prnu',phase:'training',requested,context}));
 requireValue(recommendation&&typeof recommendation==='object'&&(recommendation.backend===null||resolved.includes(recommendation.backend)),'Invalid PRNU transversal backend decision.');
 if(requested!=='auto'&&recommendation.backend!==requested)throw new EngineError('BACKEND_NOT_ADMITTED','The requested PRNU training backend was not admitted; the selected mode was not changed.',{details:{requested,proposed:recommendation.backend}});
 const basis=typeof recommendation.basis==='string'&&recommendation.basis.length<=128?recommendation.basis:'transversal-decision';
 return {requested,...(recommendation.backend?{backend:recommendation.backend}:{}),basis,adaptive:recommendation.adaptive===true&&recommendation.backend!==null};
}
export function prnuTrainingPreparationMetadata(choice,metrics={}){
 const cpu=metrics.trainingBackends?.cpu??0,gpu=metrics.trainingBackends?.webgpu??0;
 return {kind:'new-training-snapshot',requestedMode:choice.requested,operatorBackendRequested:choice.backend??'cpu',routingBasis:choice.basis,autoRoutingDelegated:choice.requested==='auto'&&choice.backend!==undefined,adaptiveTrainingAutoImplemented:false,transversalAdaptiveRecommendation:choice.adaptive,actualTrainingBackends:{cpu,webgpu:gpu},gpuBands:metrics.trainingGpuBands??0,explicitGpuFallback:choice.backend==='webgpu'&&cpu>0,hdf5OperatorProvenance:'per-used-image training_manifest.prnuResidual/1'};
}
