import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,EngineError} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';

export const SELFDM_PROPOSAL_GRAY_OWNERS='selfdm-proposal-ROI-canonical-literal-gray-owners/1';
/** Canonicalize the REAL union again inside this proposal, never intersect
 * the old Map crop list. A formerly split L limb can become one complete ROI;
 * its technical boundary must not become a new gray/CNN/NMS border.
 * The view is retained by the product parent, with row admission >= its width.
 * This owner holds only metadata and its own pending/returned source leases. */
export async function prepareSelfDMProposalGrayOwners(view,proposalBounds,proposalSize,{budget,signal,onOwner}={}){
 requireValue(view?.domain?.descriptor&&view.admittedRectangles&&view.readWindow&&budget?.reserve&&Array.isArray(proposalBounds)&&proposalBounds.length===4&&proposalBounds.every(Number.isSafeInteger)&&Array.isArray(proposalSize)&&proposalSize.length===2&&proposalSize.every(n=>Number.isSafeInteger(n)&&n>0),'Verified native Proposal ROI/source and resize required');
 const origin=view.domain.origin,rect={x:proposalBounds[0]-origin[0],y:proposalBounds[1]-origin[1],width:proposalBounds[2]-proposalBounds[0],height:proposalBounds[3]-proposalBounds[1]};
 requireValue(rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=view.domain.width&&rect.y+rect.height<=view.domain.height,'Native Proposal ROI differs from source chart');checkAbort(signal);
 const owners=[],rows=new Set(),active=new Set(),credits=[];let requested=false,closed=false,closing;
 const parent={policy:SELFDM_PROPOSAL_GRAY_OWNERS,owners,proposalBounds:[...proposalBounds],proposalSize:[...proposalSize],
  state:()=>({closed,retiring:requested,sourceRows:rows.size,activeReads:active.size}),
  release(){requested=true;if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{
   await Promise.allSettled([...active]);for(const row of [...rows])await row.release();while(credits.length){await credits.at(-1)();credits.pop()}closed=true;
  })().finally(()=>{closing=null});return closing;}};
 try{
  onOwner?.(parent);let count=0;for(const r of view.admittedRectangles(rect))count++;credits.push(budget.reserve(4096+count*1024));
  for(const r of view.admittedRectangles(rect)){
   checkAbort(signal);const bounds=[r.x+origin[0],r.y+origin[1],r.x+r.width+origin[0],r.y+r.height+origin[1]],owner={id:'proposal-gray-owner-'+owners.length,bounds,size:[...proposalSize],fullProposal:bounds.every((v,i)=>v===proposalBounds[i])};
   owner.readRows=async(y,n,{signal:readSignal}={})=>{
    requireValue(!requested&&!closed&&Number.isSafeInteger(y)&&y>=0&&Number.isSafeInteger(n)&&n>0&&y+n<=r.height,'Native gray owner is retired or rows differ');checkAbort(signal);checkAbort(readSignal);
    let finish;const done=new Promise(resolve=>finish=resolve);active.add(done);let wrapped;
    try{
     const row=await view.readWindow({x:r.x,y:r.y+y,width:r.width,height:n},{signal:readSignal});let released=false,retiring;
     wrapped={...row,release(){if(released)return Promise.resolve();if(retiring)return retiring;retiring=(async()=>{await row.release();rows.delete(wrapped);released=true})().finally(()=>{retiring=null});return retiring;}};rows.add(wrapped);
     checkAbort(signal);checkAbort(readSignal);if(requested)throw new EngineError('DISPOSED','Native Proposal gray ROI retired during source read.');return wrapped;
    }catch(primary){await retireCompositeOwners([()=>wrapped?.release()],{primary});throw primary}
    finally{active.delete(done);finish()}
   };
   owners.push(owner);
  }
  requireValue(owners.length===count,'Canonical native gray ROI changed during preparation');
  parent.fingerprint=JSON.stringify([SELFDM_PROPOSAL_GRAY_OWNERS,view.domain.fingerprint,proposalBounds,proposalSize,owners.map(o=>o.bounds)]);
  parent.metadata={sourceContextFingerprint:view.domain.fingerprint,coordinatePolicy:'native-owner-local-via-Original-to-common-proposal',canonicalization:'verified admittedRectangles scoped to the proposal itself',nativeResizePerOwner:[...proposalSize],priorMapContextBoundariesUsed:false,RGBReadsDuringPreparation:0};checkAbort(signal);return parent;
 }catch(primary){await retireCompositeOwners([()=>parent.release()],{primary});throw primary}
}
