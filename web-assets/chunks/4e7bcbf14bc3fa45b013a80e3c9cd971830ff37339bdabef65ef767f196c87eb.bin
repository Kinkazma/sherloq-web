import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {SELFDM_PROPOSAL_CONTEXT_GEOMETRY} from './selfdm-proposal-context-geometry.js';
import {createSelfDMProposalContextBanks} from './selfdm-proposal-context-banks.js';

export const SELFDM_PROPOSAL_CONTEXT_DEEPMASK='selfdm-proposal-seven-native-pyramids-common-window-bank/1';
const metadataBytes=(value,seen=new Set())=>{if(typeof value==='string')return value.length*2;if(!value||typeof value!=='object')return 8;if(seen.has(value))return 0;seen.add(value);if(ArrayBuffer.isView(value))return value.byteLength;return Object.entries(value).reduce((n,[key,v])=>n+key.length*2+24+metadataBytes(v,seen),64)};
/** The received literal-context geometry, existing native CV worker and native
 * DeepMask graph. Seven scale chains remain concurrent under the existing
 * CV/neural pool admissions. Only the short shared bank copy is serialized.
 * Source/geometry/CV/pool are borrowed from the retained product parent. */
export async function runSelfDMProposalContextDeepMask({geometry,backend='auto'},{budget,profile,cv,runGraph,signal,onOwner,resourceOperation,onProgress}={}){
 requireValue(geometry?.policy===SELFDM_PROPOSAL_CONTEXT_GEOMETRY&&budget?.reserve&&Number.isInteger(profile?.maxWorkers)&&profile.maxWorkers>0&&cv?.pyramid&&typeof runGraph==='function'&&['auto','cpu','webgpu'].includes(backend),'Native Proposal geometry, CV/graph pools and actual profile/backend required');
 const controller=new AbortController(),joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal,children=new Set(),pairs=new Set(),receipts=[],credits=[];let banks,closed=false,closing,finished,activeJobs=0,copyTail=Promise.resolve(),failed=false,failure;
 const completed=new Promise(resolve=>finished=resolve);
 const own=value=>{requireValue(value&&typeof value.release==='function','Native Proposal stage owner required');children.add(value);return value};
 const retire=async value=>{if(value&&children.has(value)){await value.release();children.delete(value)}};
 const retirePair=async pair=>{await retire(pair.result);pair.result=null;await retire(pair.prepared);pair.prepared=null;pairs.delete(pair)};
 const owner={policy:SELFDM_PROPOSAL_CONTEXT_DEEPMASK,cloneWindowMode:geometry.cloneWindowMode,raw:null,
  state:()=>({closed,retiring:!!closing,activeJobs,children:children.size,banks:!!banks}),
  release(){controller.abort();if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{
   await completed;
   // Native outputs and their prepared inputs remain reachable until ACK.
   // No source/geometry/CV pool is retired here: the product parent owns it.
   for(const pair of [...pairs])await retirePair(pair);
   requireValue(!children.size,'Proposal native ownership pair was not retired');
   if(banks){await banks.release();banks=null}
   while(credits.length){await credits.at(-1)();credits.pop()}
   owner.raw=null;closed=true;
  })().finally(()=>{closing=null});return closing;}};
 try{
  onOwner?.(owner);checkAbort(joined);credits.push(budget.reserve(65536+geometry.contexts.length*8192));banks=await createSelfDMProposalContextBanks(geometry,{budget,signal:joined,onOwner:value=>{banks=value}});checkAbort(joined);
  const scales=Array.from({length:7},(_,index)=>(async()=>{
   activeJobs++;
   try{
    for(let ci=0;ci<geometry.contexts.length;ci++){
     const context=geometry.contexts[ci],scale=context.scales[index];
     for(let ti=0;ti<scale.windows.length;ti++){
      checkAbort(joined);const window=scale.windows[ti],pair={prepared:null,result:null};pairs.add(pair);let prepared,result;
      try{
       prepared=own(await cv.pyramid(context,scale,window,{signal:joined,onOwner:value=>{pair.prepared=own(value)}}));pair.prepared=prepared;checkAbort(joined);
       requireValue(prepared.raw?.data instanceof Float32Array&&JSON.stringify(prepared.raw.shape)===JSON.stringify([1,3,window.height,window.width]),'Native Proposal pyramid tensor geometry');
       result=own(await runGraph('deepmask',{normalizedRgb:{data:prepared.raw.data,dims:prepared.raw.shape}},{signal:joined,backend,workspaceBytes:window.nativeWorkspaceBytes,outputBytes:window.nativeOutputBytes,gpuWasmWorkspaceBytes:128*1024**2,resourceOperation,onProgress:event=>onProgress?.({...event,stage:'deepmask',scale:index,contextId:context.id,tile:ti})}));pair.result=result;checkAbort(joined);
       // The graph results can complete concurrently. Keep every raw owner
       // while its exact masks/scores await the one mutable bank copy.
       const copy=copyTail.then(()=>banks.consume(ci,index,ti,result.result));copyTail=copy.catch(()=>{});await copy;
       credits.push(budget.reserve(4096+metadataBytes(result.metrics)+metadataBytes(result.timings)+metadataBytes(result.qualificationGpu)+metadataBytes(window)));
       receipts.push({contextId:context.id,scaleIndex:index,tileIndex:ti,window:{...window},metrics:result.metrics,timings:result.timings,heapBytes:result.heapBytes,...(result.qualificationGpu?{qualificationGpu:result.qualificationGpu}:{})});
       await retirePair(pair);result=null;prepared=null;
       onProgress?.({phase:'selfdm-proposal-deepmask-window',contextId:context.id,scale:index,tile:ti,total:scale.windows.length});
      }catch(primary){await retireCompositeOwners([()=>retirePair(pair)],{primary});throw primary}
     }
    }
   }catch(primary){if(!failed){failed=true;failure=primary;controller.abort()}throw primary}
   finally{activeJobs--}
  })());
  // Every sibling acknowledges its input/output before the source can retire.
  await Promise.allSettled(scales);await copyTail;if(failed)throw failure;checkAbort(joined);
  const candidates=banks.finalize();
  owner.raw={candidates,banks:banks.banks,receipts,metadata:{policy:SELFDM_PROPOSAL_CONTEXT_DEEPMASK,cloneWindowMode:geometry.cloneWindowMode,backendRequested:backend,maximumCores:profile.maxWorkers,contextFingerprint:geometry.provenance.contextFingerprint,candidateFingerprint:geometry.provenance.candidateFingerprint,contexts:geometry.contexts.map(c=>({id:c.id,bounds:[...c.bounds],scales:c.scales.map(s=>({index:s.index,scale:s.scale,rows:s.rows,cols:s.cols,windows:s.windows.length,status:s.status??'ready',...(s.reason?{reason:s.reason}:{})}))})),commonTopKPerScale:500,commonFinalTopK:500,actualNativePipelines:receipts.length,noExtraNormalizationDeduplicationOrThreshold:true}};
  finished();return owner;
 }catch(primary){finished();await retireCompositeOwners([()=>owner.release()],{primary});throw primary}
 finally{finished()}
}
