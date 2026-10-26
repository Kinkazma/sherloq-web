import {requireValue,checkAbort,EngineError} from './errors.js';
import {SELFDM_WINDOW_CONTEXT_POLICY} from './selfdm-window-context-plan.js';
import {proposalDeepMaskWindows,proposalSourcePatch} from './selfdm-proposal-pyramid.js';
import {retireCompositeOwners} from './composite-owner-release.js';

const MiB=1024**2, MASK=112**2;
export const SELFDM_PROPOSAL_CONTEXT_GEOMETRY='selfdm-proposal-native-context-pyramids-common-banks/1';
const roundMiB=n=>Math.ceil(n/MiB)*MiB;

/** Geometry/admission only, before the initial encoder or any RGB read.
 * The contexts are borrowed from the existing verified SelfDM source owner.
 * Native pyramid windows remain computation/read schedules, never new contexts.
 * This owner only retires its own metadata; its parent owns the source plan.
 */
export async function prepareSelfDMProposalContextGeometry(sourcePlan,{budget,signal,cloneWindowMode}={}) {
 requireValue(sourcePlan?.policy===SELFDM_WINDOW_CONTEXT_POLICY&&sourcePlan.contextDomain?.descriptor&&sourcePlan.candidateDomain?.descriptor&&Array.isArray(sourcePlan.contexts)&&budget?.reserve&&['independent','global'].includes(cloneWindowMode),'Verified native source contexts, budget and actual clone mode required');
 checkAbort(signal);
 // Validate every native scale before metadata allocation, RGB or any graph.
 for(const context of sourcePlan.contexts){
  const b=context.bounds;
  requireValue(Array.isArray(b)&&b.length===4&&b.every(Number.isSafeInteger)&&b[2]>b[0]&&b[3]>b[1],'Literal native context bounds required');
  const width=b[2]-b[0],height=b[3]-b[1];
  for(let index=0;index<7;index++){
   const scale=2**(-2.5+index*.5),ow=Math.floor(width*scale),oh=Math.floor(height*scale);
   if(!ow||!oh)throw new EngineError('NATIVE_PROPOSAL_CONTEXT_GEOMETRY','A literal context produces a zero-sized native DeepMask scale; no scale was skipped or clamped.',{details:{contextId:context.id,bounds:[...b],scaleIndex:index,scale,width,height,outputWidth:ow,outputHeight:oh,beforeRgbAndAnyEncoder:true}});
   requireValue(Number.isSafeInteger((ow+160)*(oh+160)*12),'Native DeepMask context scale exceeds exact geometry');
  }
 }
 const credits=[],contexts=[];let released=false,closing;
 const retire=async()=>{while(credits.length){await credits.at(-1)();credits.pop()}};
 const owner={policy:SELFDM_PROPOSAL_CONTEXT_GEOMETRY,cloneWindowMode,contexts,
  provenance:{cloneWindowMode,contextFingerprint:sourcePlan.contextDomain.fingerprint,candidateFingerprint:sourcePlan.candidateDomain.fingerprint,sourcePolicy:'verified-canonical-literal-contexts-no-RGB-fill',sourceOwnerBorrowed:true},
  release(){if(released)return Promise.resolve();if(closing)return closing;closing=Promise.resolve().then(retire).then(()=>{released=true}).finally(()=>{closing=null});return closing;},
  state:()=>({released,retiring:!!closing,metadataReservations:credits.length})};
 try{
  credits.push(budget.reserve(4096+sourcePlan.contexts.reduce((n,c)=>n+7*512+String(c.id).length*4,0)));
  for(const context of sourcePlan.contexts){
   checkAbort(signal);const width=context.bounds[2]-context.bounds[0],height=context.bounds[3]-context.bounds[1],scales=[];
   for(let index=0;index<7;index++){
    checkAbort(signal);const scale=2**(-2.5+index*.5),ow=Math.floor(width*scale),oh=Math.floor(height*scale),pw=ow+160,ph=oh+160,rows=Math.ceil(ph/16)-9,cols=Math.ceil(pw/16)-9;
    const windowBound=pw<=704&&ph<=704?1:Math.ceil(rows/16)*Math.ceil(cols/16);
    requireValue(Number.isSafeInteger(windowBound)&&windowBound>0&&Number.isSafeInteger(windowBound*1024),'Native pyramid metadata exceeds exact admission');
    credits.push(budget.reserve(windowBound*1024));
    const geometry=proposalDeepMaskWindows(width,height,scale),windows=[];
    requireValue(geometry.windows.length===windowBound,'Native pyramid window count differs from admission');
    for(const window of geometry.windows){
     const patch=proposalSourcePatch(width,height,ow,oh,window),inputBytes=window.width*window.height*12,sourceBytes=patch.width*patch.height*3,heapBytes=roundMiB(16*MiB+inputBytes+sourceBytes),localRows=Math.ceil(window.height/16)-9,localCols=Math.ceil(window.width/16)-9;
     if(heapBytes>2*1024**3)throw new EngineError('MEMORY_LIMIT','The unchanged literal native DeepMask preparation exceeds its WASM maximum; no pixels or scales were reduced.',{details:{contextId:context.id,scaleIndex:index,heapBytes,beforeRgbAndAnyEncoder:true}});
     const workspaceBytes=roundMiB(inputBytes*40),outputBytes=localRows*localCols*(MASK+1)*4;
     requireValue([heapBytes,workspaceBytes,outputBytes].every(Number.isSafeInteger),'Native DeepMask buffer admission exceeds exact integers');
     windows.push({...window,sourcePatch:patch,nativeInputBytes:inputBytes,nativeSourceBytes:sourceBytes,nativeHeapBytes:heapBytes,nativeWorkspaceBytes:workspaceBytes,nativeOutputBytes:outputBytes});
    }
    scales.push({index,scale,ow,oh,rows:geometry.rows,cols:geometry.cols,windows});
   }
   contexts.push({id:context.id,bounds:[...context.bounds],nativeContext:context,scales});
  }
  checkAbort(signal);
  // One replaceable bank per SCALE across every context, then one final bank.
  // These are counts only, not allocations or independent per-context TopKs.
  owner.commonBanks=Array.from({length:7},(_,index)=>{const candidateSlots=contexts.reduce((n,c)=>n+c.scales[index].rows*c.scales[index].cols,0);requireValue(Number.isSafeInteger(candidateSlots),'Complete common native proposal population exceeds exact admission');return{scaleIndex:index,candidateSlots,maximumRows:Math.min(500,candidateSlots),nativeMaskElementsPerRow:MASK}});
  owner.finalMaximumRows=Math.min(500,owner.commonBanks.reduce((n,c)=>n+c.maximumRows,0));
  owner.fingerprint=JSON.stringify([SELFDM_PROPOSAL_CONTEXT_GEOMETRY,cloneWindowMode,sourcePlan.contextDomain.fingerprint,sourcePlan.candidateDomain.fingerprint,contexts.map(c=>[c.id,c.bounds])]);
  return owner;
 }catch(primary){await retireCompositeOwners([()=>owner.release()],{primary});throw primary}
}
