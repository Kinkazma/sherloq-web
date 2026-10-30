import "../../runtime-context.js?v=0.30.0";
import {planMgcfdnWindowGpuAdmission} from './mgcfdn-window-gpu-admission.js';
import {requireValue} from './errors.js';
// These are the CURRENT JavaScript reservations made by the frozen graph
// reader/rewrite and stage bridge. They are distinct from native512MiB heaps
// and GPU buffers and are charged at the product parent before Worker creation.
const B=89060850n,H=28813443n,SCRATCH=4194304n;
export const MGCFDN_WINDOW_GPU_BASE_CREDIT=Number(3n*B+H+SCRATCH);
export const MGCFDN_WINDOW_GPU_REWRITE_CREDIT=Number(2n*B+SCRATCH);
export const MGCFDN_WINDOW_GPU_PREVIOUS_GRAPH_FLOOR=Number(6n*B+H+2n*SCRATCH);
const safe=n=>{requireValue(n>=0n&&n<=BigInt(Number.MAX_SAFE_INTEGER),'MGCFDN JS graph admission exceeds exact integer range');return Number(n);};
export function mgcfdnWindowGpuStageWorkspace(feeds){let bytes=0n;for(const value of Object.values(feeds)){requireValue(value?.data instanceof Float32Array,'Native FP32 stage bridge required');bytes+=BigInt(value.data.byteLength);}return safe(2n*bytes+SCRATCH);}
export function planMgcfdnWindowGpuMemory(featureCells){
 requireValue(Number.isSafeInteger(featureCells)&&featureCells>=1600&&featureCells%1600===0,'Admitted M=1600F required before native Worker allocation');const M=BigInt(featureCells),local=1600n,gpuAdmission=planMgcfdnWindowGpuAdmission(featureCells);
 const feedBytes={encoder:4n*3n*256n*256n,normalize:4n*640n*local,'global-consistency':4n*(2n*640n*M+4n*M),'global-pools':4n*(640n+40n)*M,'context-f3':4n*((640n+40n)*local+40n+640n),'global-attention':4n*(256n*M+M*M),'context-decode':4n*(40n+256n+256n+40n)*local};
 const copiedBytes={encoder:4n*640n*local,normalize:4n*640n*local,'global-consistency':4n*(40n*M+M*M),'global-pools':4n*(40n+640n),'context-f3':4n*(40n+256n)*local,'global-attention':4n*256n*M,'context-decode':2n*4n*256n*256n};
 // This is the actual frozen head's loan liveness: encoder through normalize;
 // consistency through final decode; pools through f3; mixed through decode.
 const priorCopiedBytes={encoder:0n,normalize:copiedBytes.encoder,'global-consistency':0n,'global-pools':copiedBytes['global-consistency'],'context-f3':copiedBytes['global-consistency']+copiedBytes['global-pools'],'global-attention':copiedBytes['global-consistency'],'context-decode':copiedBytes['global-consistency']+copiedBytes['global-attention']};
 const stages=Object.entries(feedBytes).map(([label,bytes])=>({label,feedBytes:safe(bytes),workspaceBytes:safe(2n*bytes+SCRATCH),copiedOutputBytes:safe(copiedBytes[label]),priorCopiedOutputBytes:safe(priorCopiedBytes[label]),simultaneousBridgeBytes:safe(priorCopiedBytes[label]+2n*bytes+SCRATCH+copiedBytes[label])})),maximumStageWorkspaceBytes=Math.max(...stages.map(v=>v.workspaceBytes)),maximumSimultaneousBridgeBytes=Math.max(...stages.map(v=>v.simultaneousBridgeBytes));
 const retainedGraphCredit=MGCFDN_WINDOW_GPU_BASE_CREDIT+MGCFDN_WINDOW_GPU_REWRITE_CREDIT,required=BigInt(retainedGraphCredit)+BigInt(maximumSimultaneousBridgeBytes),floor=BigInt(MGCFDN_WINDOW_GPU_PREVIOUS_GRAPH_FLOOR),graphBudgetBytes=safe(required>floor?required:floor);
 return Object.freeze({schema:'mgcfdn-window-gpu-js-admission/3',featureCells,baseCreditBytes:MGCFDN_WINDOW_GPU_BASE_CREDIT,rewriteCreditBytes:MGCFDN_WINDOW_GPU_REWRITE_CREDIT,retainedGraphCreditBytes:retainedGraphCredit,previousGraphFloorBytes:MGCFDN_WINDOW_GPU_PREVIOUS_GRAPH_FLOOR,maximumStageWorkspaceBytes,maximumSimultaneousBridgeBytes,graphBudgetBytes,residentBytes:safe(BigInt(gpuAdmission.gpuMaximumBytes)+512n*1024n**2n+3n*89182861n+12288024n+BigInt(graphBudgetBytes)),stages:Object.freeze(stages.map(Object.freeze)),nativeWasmMaximumBytes:512*1024**2,nativeGpuMaximumBytes:gpuAdmission.gpuMaximumBytes,gpuAdmission,precision:'float32',featureSide:40,inputSide:256,topk:40});
}
