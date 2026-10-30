import "../../runtime-context.js?v=0.30.0";
import {createZeroVotePolicy} from './zero-vote-policy.js';
import {ZeroVoteGpu} from './zero-vote-gpu.js';
import {createZeroRetirement} from './zero-native-context-plan.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
import {segmentedZeroVotes} from './zero-stream.js';
import {segmentedZeroRegions} from './zero-region-stream.js';
import {createRgbSurface,createMaskSurface} from './rgb-surface.js';
import {ZERO_PALETTE} from './zero-palette.js';
const semantics='ZERO local JPEG grid votes and globally significant foreign/missing-grid regions; processing clues, not an authenticity verdict. Grid log10 NFA is not a manipulation probability.';
function constantStore(n,value){return {byteLength:n,storage:'constant',readInto(target){target.fill(value);},dispose(){}};}
function maskedVotes(store,original,main,budget){return {byteLength:store.byteLength,storage:store.storage,async readInto(target,offset=0){const release=budget.reserve(Math.min(target.length,65536));try{const prior=new Uint8Array(Math.min(target.length,65536));await store.readInto(target,offset);for(let at=0;at<target.length;at+=prior.length){const part=prior.subarray(0,Math.min(prior.length,target.length-at));await original.readInto(part,offset+at);for(let i=0;i<part.length;i++)if(part[i]===main)target[at+i]=255;}}finally{release();}}};}
export async function createSegmentedZeroAnalysis(image,p,{budget,signal,onProgress,storage='auto',reference=false,maxWorkers=1,adaptive,onOwner,backend='cpu',gpuVotes:sharedGpu}={}){
 const retirement=createZeroRetirement({signal,onOwner});signal=retirement.signal;let finish;retirement.waitUntil(new Promise(r=>finish=r));
 let original,companion,foreign,missing;let gpuVotes;const votePolicy=!reference&&backend==='auto'?createZeroVotePolicy({budget,width:image.surface.descriptor.width,height:image.surface.descriptor.height,maxWorkers}):null;const nativeOwner=value=>retirement.add(()=>value.dispose(),1),regionOwner=value=>retirement.add(()=>value.dispose(),0);
 const storeAcks=new WeakMap();
 const rememberStore=store=>{if(!store||storeAcks.has(store))return;const dispose=store.dispose;let done=false,pending;const retire=()=>{if(done)return Promise.resolve();if(pending)return pending;const task=Promise.resolve().then(()=>dispose.call(store)).then(()=>{done=true;});pending=task;void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});return task;};storeAcks.set(store,retire);store.dispose=retire;};
 const retireStores=async stores=>{let failed=false,primary;for(const store of stores)try{rememberStore(store);await store?.dispose();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;};
 const retireVotes=value=>value?retireStores([value.luminance,value.votes]):undefined;
 // The historical region wrapper releases bookkeeping in finally and marks
 // itself closed before child ACK. Pre-retire both stores so that wrapper is
 // entered only after their true ACK, retaining its credits on refusal.
 const retireRegions=async value=>{if(value){await retireStores([value.mask,value.maskReg]);await value.dispose();}};
 retirement.add(()=>retireVotes(original));retirement.add(()=>retireVotes(companion));retirement.add(()=>retireRegions(foreign));retirement.add(()=>retireRegions(missing));const width=image.surface.descriptor.width,height=image.surface.descriptor.height,n=width*height;
 try{
  gpuVotes=!reference&&['webgpu','auto'].includes(backend)?(sharedGpu??new ZeroVoteGpu(budget)):null;if(gpuVotes&&!sharedGpu)retirement.add(()=>gpuVotes.dispose(),0);
  original=await segmentedZeroVotes(image,{budget,signal,onProgress,storage,reference,maxWorkers,adaptive,backend,gpuVotes,votePolicy,onNativeOwner:nativeOwner});const options={budget,signal,onProgress,storage,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,onOwner:regionOwner};
  foreign=await segmentedZeroRegions(original.votes,width,height,{...options,gridToExclude:original.main_grid});
  if(p.missing&&original.main_grid>=0){companion=await segmentedZeroVotes(image,{budget,signal,onProgress,companion:true,storage,reference,maxWorkers,adaptive,backend,gpuVotes,votePolicy,onNativeOwner:nativeOwner});missing=await segmentedZeroRegions(companion.votes,width,height,{...options,gridMax:0,excludeVotes:original.votes,excludeGrid:original.main_grid});}
  const zero=constantStore(n,0),unknown=constantStore(n,255),planes={luminance:original.luminance,luminance_jpeg:companion?.luminance??zero,votes:original.votes,votes_jpeg:companion?maskedVotes(companion.votes,original.votes,original.main_grid,budget):unknown,mask_f:foreign.mask,mask_f_reg:foreign.maskReg,mask_m:missing?.mask??zero,mask_m_reg:missing?.maskReg??zero};let hasRegion=false;
  const scanCooperate=createCooperator(signal),scanRelease=budget.reserve(Math.min(n,65536));try{const bytes=new Uint8Array(Math.min(n,65536));for(const store of [planes.mask_f_reg,planes.mask_m_reg]){if(hasRegion)break;for(let at=0;at<n;at+=bytes.length){checkAbort(signal);await scanCooperate();checkAbort(signal);const part=bytes.subarray(0,Math.min(bytes.length,n-at));await store.readInto(part,at);if(part.some(v=>v!==0)){hasRegion=true;break;}}}}finally{scanRelease();}
  checkAbort(signal);let references=1,retiring=false;const metadata={method:'ZERO IPOL 2021/390',main_grid:original.main_grid,foreign_regions:foreign.regions,missing_regions:missing?.regions??[],jpeg99_used:p.missing,missing_grid_analyzed:!!companion,reference};
  const release=()=>{if(references)return Promise.resolve();retiring=true;return retirement.dispose();};
  const lease=()=>{let requested=false;return()=>{if(!requested){requested=true;references--;}return release();};};
  const cacheRelease=lease(),retain=()=>{if(retiring)throw new EngineError('DISPOSED','ZERO analysis disposed.');references++;return lease();};
  return {width,height,planes,metadata,grid_log10_nfa:original.grid_log10_nfa,hasRegion,missingEnabled:p.missing,metrics:{backend:(original.metrics.gpuJobs??0)+(companion?.metrics.gpuJobs??0)>0?'webgpu':'cpu',gpuJobs:(original.metrics.gpuJobs??0)+(companion?.metrics.gpuJobs??0),gpuAttemptJobs:(original.metrics.gpuAttemptJobs??0)+(companion?.metrics.gpuAttemptJobs??0),...(votePolicy?{autoPolicy:votePolicy.snapshot()}:{}),kernel:'zero-global-segmented',workers:Math.max(original.metrics.workers,companion?.metrics.workers??1),original:original.metrics,jpeg99:companion?.metrics??null,foreign:foreign.metrics,missing:missing?.metrics??null},retain,dispose:cacheRelease};
 }catch(error){finish();try{await retirement.dispose();}catch{}throw error;}finally{finish();}
}
function viewStore(analysis,view,budget){const {width,height,planes,hasRegion}=analysis,release=analysis.retain();return {byteLength:width*height*3,storage:'computed',dispose:release,async readInto(target,offset=0){requireValue(offset%3===0&&target.length%3===0,'ZERO RGB reads must align to pixels.');const count=target.length/3,chunk=Math.min(count,65536),free=budget.reserve(chunk*3);try{const a=new Uint8Array(chunk),b=new Uint8Array(chunk),c=new Uint8Array(chunk);for(let at=0;at<count;at+=chunk){const size=Math.min(chunk,count-at),first=a.subarray(0,size),second=b.subarray(0,size),third=c.subarray(0,size),position=offset/3+at;
   if(view===1||view===2){await planes[view===1?'votes':'votes_jpeg'].readInto(first,position);for(let i=0;i<size;i++){const out=(at+i)*3,v=first[i];target[out]=v<64?ZERO_PALETTE[v*3]:0;target[out+1]=v<64?ZERO_PALETTE[v*3+1]:0;target[out+2]=v<64?ZERO_PALETTE[v*3+2]:0;}}
   else if(view===3||view===4){await planes[view===3?'mask_f_reg':'mask_m_reg'].readInto(first,position);for(let i=0;i<size;i++)target.fill(first[i],(at+i)*3,(at+i)*3+3);}
   else{await planes.luminance.readInto(first,position);await planes.mask_f_reg.readInto(second,position);await planes.mask_m_reg.readInto(third,position);for(let i=0;i<size;i++){const out=(at+i)*3;target.fill(Math.trunc(first[i]*(hasRegion?.2:1)),out,out+3);if(second[i])target[out]=255;else if(third[i])target[out+2]=255;}}
  }}finally{free();}}};}
export async function segmentedZeroResult(analysis,p,{budget}={}){
 const {width,height,planes}=analysis,records=[],release=budget.reserve(4096+768*(analysis.metadata.foreign_regions.length+analysis.metadata.missing_regions.length));
 try{const surface=createRgbSurface(viewStore(analysis,p.view,budget),{width,height,budget});records.push(surface);const maskRecords={};for(const key of ['mask_f','mask_f_reg','mask_m','mask_m_reg']){const release=analysis.retain(),store={byteLength:width*height,storage:planes[key].storage,dispose:release,async readInto(target,offset){await planes[key].readInto(target,offset);for(let i=0;i<target.length;i++)target[i]=target[i]>0?1:0;}};const mask=createMaskSurface(store,{width,height,budget,range:[0,1],semantics:key+' ZERO evidence; not an authenticity verdict.'});records.push(mask);maskRecords[key]={surface:mask};}
  return {surface,maskRecords,zeroAnalysis:analysis,semantics,data:{width,height,metadata:structuredClone(analysis.metadata),grid_log10_nfa:analysis.grid_log10_nfa.slice(),regionBounds:'inclusive xyxy',palette:Uint8Array.from(ZERO_PALETTE),arrayLayout:'segmented; scientific arrays available through NPZ surface export'}};
 }catch(error){await Promise.allSettled(records.map(record=>record.dispose()));throw error;}finally{release();}
}
