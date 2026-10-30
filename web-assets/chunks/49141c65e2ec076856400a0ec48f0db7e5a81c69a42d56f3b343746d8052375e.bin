import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';
// These are the CURRENT JavaScript reservations made by the frozen graph
// reader/rewrite and stage bridge. They are distinct from native512MiB heaps
// and GPU buffers and are charged at the product parent before Worker creation.
const B=24006373n,SCRATCH=4194304n;
export const MGCFDN_MPDN_WINDOW_BASE_CREDIT=Number(3n*B+SCRATCH);
export const MGCFDN_MPDN_WINDOW_REWRITE_CREDIT=Number(2n*B+SCRATCH);
const safe=n=>{requireValue(n>=0n&&n<=BigInt(Number.MAX_SAFE_INTEGER),'MGCFDN JS graph admission exceeds exact integer range');return Number(n);};
export function mgcfdnMpdnWindowStageWorkspace(feeds){let bytes=0n;for(const value of Object.values(feeds)){requireValue(value?.data instanceof Float32Array,'Native FP32 stage bridge required');bytes+=BigInt(value.data.byteLength);}return safe(2n*bytes+SCRATCH);}
export function planMgcfdnMpdnWindowMemory(featureCells,backend='webgpu'){
 requireValue(['cpu','webgpu'].includes(backend),'Original native MGCFDN_MPDN backend required');
 requireValue(Number.isSafeInteger(featureCells)&&featureCells>=256&&featureCells%256===0,'Admitted M=256F required before native Worker allocation');const M=BigInt(featureCells),local=256n;
 const feedBytes={encoder:4n*3n*256n*256n,normalize:4n*408n*local,'global-consistency':4n*(2n*408n*M+4n*M),'global-pools':4n*(408n+40n)*M,'context-f3':4n*((408n+40n)*local+40n+408n),'global-attention':4n*(256n*M+M*M),'context-decode':4n*(40n+256n+256n+40n)*local};
 const copiedBytes={encoder:4n*408n*local,normalize:4n*408n*local,'global-consistency':4n*(40n*M+M*M),'global-pools':4n*(40n+408n),'context-f3':4n*(40n+256n)*local,'global-attention':4n*256n*M,'context-decode':2n*4n*256n*256n};
 // This is the actual frozen head's loan liveness: encoder through normalize;
 // consistency through final decode; pools through f3; mixed through decode.
 const priorCopiedBytes={encoder:0n,normalize:copiedBytes.encoder,'global-consistency':0n,'global-pools':copiedBytes['global-consistency'],'context-f3':copiedBytes['global-consistency']+copiedBytes['global-pools'],'global-attention':copiedBytes['global-consistency'],'context-decode':copiedBytes['global-consistency']+copiedBytes['global-attention']};
 const stages=Object.entries(feedBytes).map(([label,bytes])=>({label,feedBytes:safe(bytes),workspaceBytes:safe(2n*bytes+SCRATCH),copiedOutputBytes:safe(copiedBytes[label]),priorCopiedOutputBytes:safe(priorCopiedBytes[label]),simultaneousBridgeBytes:safe(priorCopiedBytes[label]+2n*bytes+SCRATCH+copiedBytes[label])})),maximumStageWorkspaceBytes=Math.max(...stages.map(v=>v.workspaceBytes)),maximumSimultaneousBridgeBytes=Math.max(...stages.map(v=>v.simultaneousBridgeBytes));
 const rewriteCredit=Number(2n*BigInt(backend==='webgpu'?24006373:24005734)+SCRATCH),retainedGraphCredit=MGCFDN_MPDN_WINDOW_BASE_CREDIT+rewriteCredit,required=BigInt(retainedGraphCredit)+BigInt(maximumSimultaneousBridgeBytes),graphBudgetBytes=safe(required);
 return Object.freeze({schema:'mgcfdn-mpdn-one-window-js-admission/1',featureCells,baseCreditBytes:MGCFDN_MPDN_WINDOW_BASE_CREDIT,rewriteCreditBytes:rewriteCredit,retainedGraphCreditBytes:retainedGraphCredit,maximumStageWorkspaceBytes,maximumSimultaneousBridgeBytes,graphBudgetBytes,residentBytes:safe(BigInt(backend==='webgpu'?2:1)*512n*1024n**2n+3n*B+BigInt(graphBudgetBytes)),stages:Object.freeze(stages.map(Object.freeze)),nativeWasmMaximumBytes:512*1024**2,nativeGpuMaximumBytes:backend==='webgpu'?512*1024**2:0,precision:'float32',featureSide:16,inputSide:256,topk:40});
}
