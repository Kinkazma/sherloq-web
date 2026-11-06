import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createProposalPointAdmission} from './selfdm-proposal-scope.js';
import {SELFDM_PROPOSAL_GRAY_OWNERS} from './selfdm-proposal-gray-owners.js';

export const SELFDM_PROPOSAL_POINT_PRESENCE='selfdm-proposal-source-bound-native-point-presence/1';
// Unchanged native gray half-pixel Float32 tap convention, as used by the
// existing selfdm-scientific-scope adapter. Coordinates are owner-local.
function linearSamples(input,output,index){
 let p=Math.fround((index+.5)*input/output-.5),first=Math.floor(p);p=Math.fround(p-first);
 if(first<0){first=0;p=0;}if(first>=input-1){first=input-1;p=0;}
 return p===1?[first+1]:p>0?[first,first+1]:[first];
}

/** Geometry only before NMS/Top2048. A fully candidate literal owner keeps the
 * native border/padding/sampler unchanged. Partial candidate/context support
 * uses the EXISTING descriptor admission helper, with exact Original pixel
 * membership replacing only its source-domain query. No RGB is read here. */
export async function prepareSelfDMProposalPointPresence({grayOwners,grayOwner,contextDomain,candidateDomain},{budget,signal,onOwner}={}){
 requireValue(grayOwners?.policy===SELFDM_PROPOSAL_GRAY_OWNERS&&grayOwners.owners?.includes(grayOwner)&&budget?.reserve&&Array.isArray(grayOwner?.bounds)&&Array.isArray(grayOwner?.size),'Canonical native gray owner and admitted point support budget required');
 const controller=new AbortController(),joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 let descriptor,presenceAllocation,credit,finish,closed=false,closing;const done=new Promise(resolve=>finish=resolve);
 const owner={policy:SELFDM_PROPOSAL_POINT_PRESENCE,presence:null,identity:null,metadata:null,
  release(){controller.abort();if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{await done;if(descriptor){await descriptor.release();descriptor=null}if(presenceAllocation){await presenceAllocation.release();presenceAllocation=null}if(credit){await credit();credit=null}owner.presence=null;closed=true})().finally(()=>{closing=null});return closing;},
  state:()=>({closed,retiring:!!closing,descriptorSupport:!!descriptor,presenceOwned:!!presenceAllocation})};
 try{
  onOwner?.(owner);checkAbort(joined);
  const context=await compileOriginalSourceRegions(contextDomain?.descriptor??contextDomain),candidate=await compileOriginalSourceRegions(candidateDomain?.descriptor??candidateDomain);
  requireValue(context.sourceSha256===candidate.sourceSha256&&context.sourceWidth===candidate.sourceWidth&&context.sourceHeight===candidate.sourceHeight&&grayOwners.metadata?.sourceContextFingerprint===context.fingerprint,'Point candidate/context differ from the canonical gray source');
  const bounds=grayOwner.bounds,[width,height]=grayOwner.size,sourceWidth=bounds[2]-bounds[0],sourceHeight=bounds[3]-bounds[1],denseWidth=Math.floor(width/8)*8,denseHeight=Math.floor(height/8)*8;
  requireValue(bounds.length===4&&bounds.every(Number.isSafeInteger)&&sourceWidth>0&&sourceHeight>0&&grayOwner.size.length===2&&[width,height].every(n=>Number.isSafeInteger(n)&&n>=8)&&Number.isSafeInteger(denseWidth*denseHeight),'Native point owner source/resize geometry required');
  const covers=(domain,left,top,right,bottom)=>{for(let y=top;y<bottom;y++)if(!domain.originalRowIntervals(y).some(([x0,x1])=>x0<=left&&x1>=right))return false;return true};
  requireValue(covers(context,...bounds),'Native gray owner includes absent RGB observations');
  const fullCandidate=covers(candidate,...bounds);credit=budget.reserve(16384+grayOwners.fingerprint.length*2);presenceAllocation=allocateOwnedTypedArray(Uint8Array,denseWidth*denseHeight,{budget,owner:'selfdm-proposal',label:'proposal-source-bound-point-presence'});const presence=presenceAllocation.data;
  const admitsResizedRectangle=([left,top,right,bottom])=>{
   const xs=linearSamples(sourceWidth,width,left),xe=linearSamples(sourceWidth,width,right),ys=linearSamples(sourceHeight,height,top),ye=linearSamples(sourceHeight,height,bottom);
   return covers(candidate,bounds[0]+xs[0],bounds[1]+ys[0],bounds[0]+xe.at(-1)+1,bounds[1]+ye.at(-1)+1);
  };
  const admitsResizedPoint=(x,y)=>{const xs=linearSamples(sourceWidth,width,x),ys=linearSamples(sourceHeight,height,y);return covers(candidate,bounds[0]+xs[0],bounds[1]+ys[0],bounds[0]+xs.at(-1)+1,bounds[1]+ys.at(-1)+1)};
  let admitted=0;
  if(fullCandidate){presence.fill(1);admitted=presence.length}
  else{
   descriptor=await createProposalPointAdmission({admitsResizedRectangle},bounds,width,height,{budget,signal:joined});
   for(let y=0;y<denseHeight;y++){if((y&31)===0)await controlCheckpoint(joined);for(let x=0;x<denseWidth;x++)if(admitsResizedPoint(x,y)&&descriptor.admits(x,y)){presence[y*denseWidth+x]=1;admitted++}}
  }
  checkAbort(joined);const hashCredit=budget.reserve(presence.byteLength+64);let gridSha256;
  try{gridSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',presence))].map(v=>v.toString(16).padStart(2,'0')).join('')}finally{await hashCredit()}
  checkAbort(joined);owner.presence=presence;
  owner.identity=JSON.stringify([SELFDM_PROPOSAL_POINT_PRESENCE,context.sourceSha256,context.fingerprint,candidate.fingerprint,grayOwners.fingerprint,bounds,grayOwner.size,gridSha256]);
  owner.metadata={policy:SELFDM_PROPOSAL_POINT_PRESENCE,sourceSha256:context.sourceSha256,contextFingerprint:context.fingerprint,candidateFingerprint:candidate.fingerprint,ownerBounds:[...bounds],ownerSize:[width,height],grid:[denseHeight,denseWidth],gridSha256,admitted,excluded:presence.length-admitted,total:presence.length,fullCandidateOwner:fullCandidate,nativePaddingPreserved:fullCandidate,sourceRGBReads:0,stage:'presence-before-native-NMS-and-one-common-Top2048',supportPolicy:fullCandidate?'full-literal-owner-native-border-and-sampler':'existing-native-gray-taps-and-descriptor-cell-sampler-support',...(descriptor?{descriptorSupport:descriptor.metadata}:{})};
  finish();return owner;
 }catch(primary){finish();await retireCompositeOwners([()=>owner.release()],{primary});throw primary}
 finally{finish()}
}
