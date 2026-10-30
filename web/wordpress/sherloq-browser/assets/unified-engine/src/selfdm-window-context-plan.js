import "../../runtime-context.js?v=0.30.0";
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from './errors.js';
export const SELFDM_WINDOW_CONTEXT_POLICY='selfdm-literal-native-contexts-common-window-bank/1';
const support=(length,index)=>{let p=Math.fround((index+.5)*length/512-.5),first=Math.floor(p),weight=Math.fround(p-first);if(first<0){first=0;weight=0;}if(first>=length-1){first=length-1;weight=0;}return[weight===1?first+1:first,weight===0?first:Math.min(length-1,first+1)];};
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
/** Geometry only before RGB. Every context is a disjoint literal admitted crop
 * and retains native512 input/64latent grids. Candidate support is determined
 * before either operand of the common attention/correlation sees a position.
 * No invalid RGB is materialized. Source ownership remains with the caller. */
export async function prepareSelfDMWindowContexts({original,window},{budget,lifetimeSignal,onOwner}={}){
 requireValue(original?.surface?.readWindow&&window?.contextDomain&&window?.candidateDomain&&window.fingerprint&&budget?.reserve,'Canonical SelfDM window, immutable Original and shared budget required');
 const metadata=budget.reserve(65536),controller=new AbortController(),signal=lifetimeSignal?AbortSignal.any([controller.signal,lifetimeSignal]):controller.signal,contexts=[],credits=[];let view,closed=false,closing,finished,finish,freed=false;
 finished=new Promise(resolve=>finish=resolve);
 const owner={contexts,policy:SELFDM_WINDOW_CONTEXT_POLICY,get closed(){return closed;},release(){closed=true;controller.abort();if(closing)return closing;closing=(async()=>{await finished;await view?.dispose();view=null;while(credits.length){await credits.at(-1)();credits.pop();}if(!freed){await metadata();freed=true;}})();void closing.finally(()=>closing=null).catch(()=>{});return closing;}};
 try{
  onOwner?.(owner);const context=await compileOriginalSourceRegions(window.contextDomain),candidate=await compileOriginalSourceRegions(window.candidateDomain);checkAbort(signal);
  requireValue(context.sourceSha256===original.sha256&&candidate.sourceSha256===original.sha256&&context.sourceWidth===candidate.sourceWidth&&context.sourceHeight===candidate.sourceHeight,'SelfDM domains differ from immutable Original');
  owner.contextDomain=context;owner.candidateDomain=candidate;owner.window={id:window.id,kind:window.kind,bounds:[...window.bounds],fingerprint:window.fingerprint};
  if(context.empty||candidate.empty){owner.status='empty';owner.nativeCandidateRows=0;owner.fingerprint=JSON.stringify([SELFDM_WINDOW_CONTEXT_POLICY,window.fingerprint,'empty']);finish();return owner;}
  view=await createSourceRegionView(original.surface,context,{budget,signal,maxReadPixels:Math.max(262144,context.width)});checkAbort(signal);
  const containsRect=([x,y,r,b])=>{for(let yy=y;yy<b;yy++)if(!candidate.originalRowIntervals(yy).some(([a,c])=>a<=x&&c>=r))return false;return true;};
  let offset=0;
  for(const rect of view.admittedRectangles()){
   await controlCheckpoint(signal);const bounds=[rect.x+context.origin[0],rect.y+context.origin[1],rect.x+rect.width+context.origin[0],rect.y+rect.height+context.origin[1]],free=budget.reserve(512**2+4096*32+512*256+65536);credits.push(free);
   const outputSupport=new Uint8Array(512**2),candidateGrid=new Uint8Array(4096),full=containsRect(bounds),indices=[];
   if(full){outputSupport.fill(1);candidateGrid.fill(1);for(let i=0;i<4096;i++)indices.push(i);}
   else{
    const xs=Array.from({length:512},(_,i)=>support(rect.width,i)),ys=Array.from({length:512},(_,i)=>support(rect.height,i)),admitted=(x0,y0,x1,y1)=>containsRect([bounds[0]+x0,bounds[1]+y0,bounds[0]+x1+1,bounds[1]+y1+1]);
    for(let y=0;y<512;y++){if((y&15)===0)await controlCheckpoint(signal);for(let x=0;x<512;x++)if(admitted(xs[x][0],ys[y][0],xs[x][1],ys[y][1]))outputSupport[y*512+x]=1;}
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){const a=Math.max(0,x*8-4),b=Math.min(511,x*8+4),c=Math.max(0,y*8-4),d=Math.min(511,y*8+4);if(admitted(xs[a][0],ys[c][0],xs[b][1],ys[d][1])){const at=y*64+x;candidateGrid[at]=1;indices.push(at);}}
   }
   if(!indices.length&&outputSupport.some(Boolean))throw new EngineError('NEURAL_SCOPE_BELOW_GRID','The admitted candidate support has no native SelfDM64 centre; it cannot become a negative result.',{details:{bounds,policy:SELFDM_WINDOW_CONTEXT_POLICY}});
   const gridIndices=Uint16Array.from(indices),id=String(window.id)+':native-context-'+contexts.length,descriptor={id,bounds,localRectangle:{...rect},nativeInput:[512,512],nativeGrid:[64,64],offset,count:gridIndices.length,gridIndices,candidateGrid,outputSupport,candidateGridSha256:await hash(candidateGrid),outputSupportSha256:await hash(outputSupport),cnnContext:'Literal admitted crop and native BGR512/mean/VGG padding. No uncut-masked-CNN equivalence claimed.'};
   descriptor.readRows=async(y,rows,{signal:readSignal}={})=>{requireValue(!closed&&Number.isSafeInteger(y)&&Number.isSafeInteger(rows)&&y>=0&&rows>0&&y+rows<=rect.height,'Invalid native SelfDM crop rows or released owner');checkAbort(readSignal);return view.readWindow({x:rect.x,y:rect.y+y,width:rect.width,height:rows},{signal:readSignal});};
   contexts.push(descriptor);offset+=gridIndices.length;
  }
  checkAbort(signal);requireValue(offset>0,'Nonempty SelfDM candidate domain lost every native position');owner.status='ready';owner.nativeCandidateRows=offset;owner.ordinaryRectangleEligible=contexts.length===1&&contexts[0].count===4096&&context.countIncluded===context.width*context.height&&candidate.countIncluded===context.countIncluded;owner.fingerprint=JSON.stringify([SELFDM_WINDOW_CONTEXT_POLICY,original.sha256,window.fingerprint,context.fingerprint,candidate.fingerprint,contexts.map(v=>[v.bounds,v.offset,v.count,v.candidateGridSha256])]);finish();return owner;
 }catch(primary){finish();await retireCompositeOwners([()=>owner.release()],{primary});throw primary;}finally{finish();}
}
