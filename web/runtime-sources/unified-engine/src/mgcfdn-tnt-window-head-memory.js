import "../../runtime-context.js?v=0.25.0";
import{requireValue}from'./errors.js';
const B=28780560n,SCRATCH=4194304n,LIMIT=512n*1024n**2n;
export const TNT_WINDOW_HEAD_BASE_CREDIT=Number(3n*B+SCRATCH),TNT_WINDOW_HEAD_REWRITE_CREDIT=Number(2n*B+SCRATCH);
const safe=n=>{requireValue(n>=0n&&n<=BigInt(Number.MAX_SAFE_INTEGER),'TNT head bridge admission overflow');return Number(n);};
export function tntWindowHeadWorkspace(feeds){let n=0n;for(const t of Object.values(feeds)){requireValue(t?.data instanceof Float32Array,'Native TNT FP32 feeds required');n+=BigInt(t.data.byteLength);}return safe(2n*n+SCRATCH);}
export function planTntWindowHeadMemory(contextCells,candidateCells){
 requireValue(Number.isSafeInteger(contextCells)&&contextCells>=256&&contextCells%256===0&&Number.isSafeInteger(candidateCells)&&candidateCells>=40&&candidateCells<=contextCells,'TNT distinct contextual/candidate populations required');const M=BigInt(contextCells),N=BigInt(candidateCells),local=256n;
 const feeds={'normalize-candidates':4n*640n*N,'global-consistency':4n*(2n*640n*N+4n*N),'window-pools':4n*(640n*M+40n*N),'context-f3':4n*((640n+40n)*local+40n+640n),'candidate-attention':4n*(256n*N+N*N),'context-decode':4n*(40n+256n+256n+40n)*local};
 const copied={'normalize-candidates':4n*640n*N,'global-consistency':4n*(40n*N+N*N),'window-pools':4n*(40n+640n),'context-f3':4n*(40n+256n)*local,'candidate-attention':4n*256n*N,'context-decode':2n*4n*256n**2n};
 const prior={'normalize-candidates':0n,'global-consistency':0n,'window-pools':copied['global-consistency'],'context-f3':copied['global-consistency']+copied['window-pools'],'candidate-attention':copied['global-consistency'],'context-decode':copied['global-consistency']+copied['candidate-attention']};
 const stages=Object.entries(feeds).map(([label,n])=>Object.freeze({label,feedBytes:safe(n),workspaceBytes:safe(2n*n+SCRATCH),copiedOutputBytes:safe(copied[label]),priorCopiedOutputBytes:safe(prior[label]),simultaneousBridgeBytes:safe(prior[label]+2n*n+SCRATCH+copied[label])})),maximumSimultaneousBridgeBytes=Math.max(...stages.map(s=>s.simultaneousBridgeBytes)),graphBudget=BigInt(TNT_WINDOW_HEAD_BASE_CREDIT+TNT_WINDOW_HEAD_REWRITE_CREDIT)+BigInt(maximumSimultaneousBridgeBytes);
 return Object.freeze({schema:'mgcfdn-tnt-distinct-populations-head-admission/1',contextCells,candidateCells,baseCreditBytes:TNT_WINDOW_HEAD_BASE_CREDIT,rewriteCreditBytes:TNT_WINDOW_HEAD_REWRITE_CREDIT,graphBudgetBytes:safe(graphBudget),maximumSimultaneousBridgeBytes,residentBytes:safe(LIMIT+3n*B+graphBudget),stages:Object.freeze(stages),nativeWasmMaximumBytes:Number(LIMIT),nativeGpuMaximumBytes:0,precision:'float32',topk:40,numThreads:1,executionProviders:Object.freeze(['wasm']),backboneNotIncluded:true});
}
