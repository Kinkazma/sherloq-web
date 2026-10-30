import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort} from './errors.js';
import {waveletParams} from './wavelets.js';
import {blockingParams} from './wavelet-blocking.js';
import {prepareSourceRegionDomain,sourceRegionDomainShape,sourceRegionCacheIdentity,sourceRegionTransportBytes} from './source-region-dispatch.js';
import {sourceRegionCoordinateBytes} from './source-region-localize.js';
import {createSourceRegionView} from './source-region-view.js';
import {blockingWorkerOwnership} from './segmented-blocking.js';
import {WaveletStripPool,waveletStripOwnershipMetadataBytes,waveletStripOwnershipSnapshot,waveletStripOwnershipCurrent,appendWaveletCleanup} from './wavelet-strip-pool.js';

const MiB=1024**2,ARENA=128*MiB,BLOCK=65536,MAX_AXIS=65536,MAX_RECTS=8192;
const unavailable=reason=>{throw new EngineError('OPTIONAL_PREVIEW_PLAN_UNAVAILABLE',reason);};
function integer(n,min=0){if(!Number.isSafeInteger(n)||n<min)unavailable('Unsafe or unavailable native-plan metadata.');return n;}
function sum(...v){return integer(v.reduce((a,b)=>a+integer(b),0));}
const product=(...v)=>integer(v.reduce((a,b)=>a*integer(b),1));
export function waveletPreviewFilterLength(name){
 const match=/^(db|sym|coif|bior)(\d+)(?:\.(\d+))?$/.exec(name??'');if(!match)unavailable('Unknown native wavelet.');
 const[,family,a,b]=match,n=Number(a),m=Number(b);
 if(family==='db'&&n>=1&&n<=20&&!b||family==='sym'&&n>=2&&n<=20&&!b)return 2*n;
 if(family==='coif'&&n>=1&&n<=5&&!b)return 6*n;
 if(family==='bior'&&['1.1','1.3','1.5','2.2','2.4','2.6','2.8','3.1','3.3','3.5','3.7','3.9','4.4','5.5','6.8'].includes(a+'.'+b))return 2*m+(n===1?0:2);
 unavailable('Unknown native wavelet.');
}
function stage(width,height,filter,axis,up,maximum){
 const span=axis===0?height:width,total=axis===0?width:height,step=Math.max(1,Math.floor(BLOCK/span)),out=up?2*span-filter+2:Math.floor((span+filter-1)/2),count=Math.ceil(total/step),pixels=Math.max(step*span,(up?1:2)*step*out);
 integer(out,1);integer(pixels,1);return{count,pixels,workers:Math.min(maximum,count)};
}
/** Geometry only. The native decomposition always uses maximumLevel, even for
 * level0/threshold0. No RGB, coefficients or worker are prepared by this plan. */
export function waveletPreviewContext(width,height,filter,{warm=false,maxWorkers=1}={}){
 integer(filter,2);for(const n of[width,height,maxWorkers])integer(n,1);if(width>MAX_AXIS||height>MAX_AXIS)unavailable('Native factory axis exceeds the optional-plan bound.');
 const levels=[];let q=Math.floor(Math.min(width,height)/(filter-1)),L=0;while(q>=2){L++;q=Math.floor(q/2);}let w=width,h=height,previousDetails=0,decomposition=L?0:8*w*h,cache=L?0:8*w*h,reconstruction=0,lastR=0;const stores=[],stages=[];
 if(!warm)stores.push(product(8,w,h));
 for(let k=1;k<=L;k++){
  const nw=Math.floor((w+filter-1)/2),nh=Math.floor((h+filter-1)/2),A=product(nw,nh),T=product(w,nh),prev=product(w,h),u=2*nw-filter+2,v=2*nh-filter+2,B=product(u,nh),R=product(u,v);
  decomposition=Math.max(decomposition,product(8,sum(previousDetails,Math.max(prev+2*T,2*T+2*A,T+4*A))));
  levels.push({w:nw,h:nh,A,T,u,v,B,R});previousDetails=sum(previousDetails,3*A);cache=sum(cache,24*A);
  if(!warm){stores.push(8*T,8*T,8*A,8*A,8*A,8*A);stages.push(stage(w,h,filter,0,false,maxWorkers),stage(w,nh,filter,1,false,maxWorkers),stage(w,nh,filter,1,false,maxWorkers));}
  w=nw;h=nh;
 }
 if(L)cache=sum(cache,8*levels[L-1].A);
 for(let k=L-1;k>=0;k--){const a=levels[k];reconstruction=Math.max(reconstruction,8*((k<L-1?levels[k+1].R:0)+2*a.B+a.R));stores.push(8*a.B,8*a.B,8*a.R);stages.push(stage(a.w,a.h,filter,1,true,maxWorkers),stage(a.w,a.h,filter,1,true,maxWorkers),stage(a.u,a.h,filter,0,true,maxWorkers));lastR=a.R;}
 stores.push(product(3,width,height));const cmax=Math.max(0,...stages.map(s=>s.workers)),staging=Math.max(0,...stages.map(s=>product(192,s.workers,s.pixels)));
 return{width,height,maximumLevel:L,cacheBytes:integer(cache),decompositionBytes:integer(decomposition),reconstructionBytes:integer(reconstruction),renderBytes:sum(L?8*lastR:0,3*width*height),stages,stores,Cmax:cmax,workerBytes:sum(cmax*ARENA,staging),workerStaging:staging};
}
export function blockingPreviewContext(width,height,block,{warm=false,maxWorkers=1,ownedSlots=[]}={}){
 for(const n of[width,height,block,maxWorkers])integer(n,1);if(width>MAX_AXIS||height>MAX_AXIS||block>100)unavailable('Native factory geometry exceeds the optional-plan bound.');
 const dh=Math.floor((height+15)/2),dw=Math.floor((width+15)/2),S=product(width,height),V=product(width,dh),D=product(dw,dh),nw=Math.floor(dw/block),nh=Math.floor(dh/block);if(!nw||!nh)unavailable('Native block does not fit this context.');
 const N=product(nw,nh),columns=Math.max(1,Math.floor(BLOCK/(block*block))),stages=warm?[]:[stage(width,height,16,0,false,maxWorkers),stage(width,dh,16,1,false,maxWorkers)];stages.push({count:Math.ceil(nw/columns)*nh,pixels:Math.min(columns,nw)*block*block,workers:Math.min(maxWorkers,Math.ceil(nw/columns)*nh)});
 const Cmax=Math.max(...stages.map(s=>s.workers)),workerStaging=Math.max(...stages.map(s=>product(192,s.workers,s.pixels)));let workerGrowth=product(Math.max(0,Cmax-ownedSlots.length),ARENA);
 for(const slot of ownedSlots){integer(slot.bytes);if(slot.busy||slot.retiring||slot.owner.error)unavailable('Owned endpoint is not idle and reusable.');workerGrowth=sum(workerGrowth,Math.max(0,ARENA-slot.bytes));}
 return{width,height,detailWidth:dw,detailHeight:dh,noiseWidth:nw,noiseHeight:nh,cacheBytes:warm?0:8*D,transformBytes:warm?0:8*Math.max(S+V,V+D),noiseBytes:8*N,renderBytes:3*S,stores:[...(!warm?[8*S,8*V,8*D]:[]),8*N,3*S],stages,Cmax,workerGrowth,workerStaging};
}
function planeMatches(plane,w,h){return plane?.width===w&&plane?.height===h&&plane.store?.byteLength===8*w*h;}
function waveletCacheMatches(cache,context,name){if(cache?.wavelet!==name||cache.width!==context.width||cache.height!==context.height||cache.maximumLevel!==context.maximumLevel||!Array.isArray(cache.details)||cache.details.length!==context.maximumLevel)return false;let w=context.width,h=context.height;const filter=waveletPreviewFilterLength(name);for(const bands of cache.details){w=Math.floor((w+filter-1)/2);h=Math.floor((h+filter-1)/2);if(!Array.isArray(bands)||bands.length!==3||!bands.every(p=>planeMatches(p,w,h)))return false;}return planeMatches(cache.a,w,h);}
function sessionInfo(image){const owner=image.session,ensure=image.ensureTemporarySession;let pageBytes=MiB;try{if(owner){if(typeof owner.snapshot!=='function')unavailable('Temporary session does not expose its page contract.');const state=owner.snapshot();if(!state||typeof state!=='object')unavailable('Temporary session metadata is unavailable.');pageBytes=state.pageBytes??MiB;}}catch(error){if(error?.code==='OPTIONAL_PREVIEW_PLAN_UNAVAILABLE')throw error;unavailable('Temporary session metadata refused.');}integer(pageBytes,1);return{owner,ensure,pageBytes,migration:!!(owner||ensure)};}
export function waveletPreviewPlan({operation,domain,rectangles,params,image,budget,pools,cacheRecord,profile={},cpuKernel='auto',runtimeBytes=32*MiB,mainHeapBytes=0,transportBytes=0,coordinateBytes=0}){
 const wavelet=operation==='detail.wavelets';if(!wavelet&&operation!=='noise.blocking')unavailable('No complete plan for this operation.');
 const M=wavelet||cpuKernel==='auto'?profile.maxWorkers:1;integer(M,1);integer(runtimeBytes);integer(mainHeapBytes);integer(transportBytes);integer(coordinateBytes);if(mainHeapBytes>ARENA)unavailable('Unknown main wavelet arena capacity.');
 if(profile.workerFactory!==undefined||profile.workerURL!==undefined||profile.workerHeapBytes!==undefined||profile.workerPixelBytes!==undefined)unavailable('Overridden native endpoint capacity is not certified by this plan.');
 const d=image.surface?.descriptor,w=domain.width,h=domain.height,I=domain.countIncluded;for(const n of[w,h,I,d?.width,d?.height])integer(n,1);if(w>MAX_AXIS||h>MAX_AXIS||I>w*h)unavailable('Unknown native grid.');
 const session=sessionInfo(image),identity=wavelet?JSON.stringify([domain.sourceSha256,domain.fingerprint,params.wavelet]):domain.sourceSha256+'/'+domain.fingerprint,previous=cacheRecord?.record?.[wavelet?'waveletCache':'blockingCache'],cached=!previous?.disposed&&previous?.sourceRegionIdentity===identity?previous:null;
 if(cacheRecord?.retiring)unavailable('Derived record is still awaiting retirement.');
 for(const row of pools.pools)if(row.owner.running||row.slots.some(s=>s.busy||s.retiring)||row.cleanupOwners.some(o=>o.requested||o.pending||o.failed))unavailable('A native endpoint or cleanup is not quiescent.');
 if(cached&&!(cached.entries instanceof Map))unavailable('Unknown native bank.');
 const contexts=[],stores=[{bytes:3*w*h,chunk:4*MiB},{bytes:w*h,chunk:4*MiB}];let K=0,observed=0,prefixC=0,prefixN=0,bank=0,worker=0,workerStaging=0;const identities=[];
 for(const r of rectangles){if(++K>MAX_RECTS)unavailable('Optional geometry metadata bound exceeded.');for(const n of[r.x,r.y,r.width,r.height])integer(n);if(!r.width||!r.height||r.x+r.width>w||r.y+r.height>h)unavailable('Native rectangle exceeds its source grid.');const S=product(r.width,r.height);observed=sum(observed,S);const key=[r.x,r.y,r.width,r.height].join('/'),old=cached?.entries.get(key);if(cached&&!old)unavailable('Native cache geometry is incomplete.');
  const c=wavelet?waveletPreviewContext(r.width,r.height,waveletPreviewFilterLength(params.wavelet),{warm:!!old,maxWorkers:M}):blockingPreviewContext(r.width,r.height,params.block,{warm:!!old,maxWorkers:M});
  if(wavelet){if(old&&!waveletCacheMatches(old,c,params.wavelet))unavailable('Native coefficient bank metadata differs.');bank=Math.max(bank,prefixC+(old?0:c.decompositionBytes),prefixC+(old?0:c.cacheBytes)+c.reconstructionBytes,prefixC+(old?0:c.cacheBytes)+c.renderBytes,prefixC+48*S);if(!old)prefixC=sum(prefixC,c.cacheBytes);worker=Math.max(worker,c.workerBytes);}
  else{if(old&&(!planeMatches(old.detail,c.detailWidth,c.detailHeight)||old.sourceMode!=='loaded image grayscale'||old.sourceDimensions?.[0]!==r.width||old.sourceDimensions?.[1]!==r.height))unavailable('Native detail bank metadata differs.');
   if(old){const owner=blockingWorkerOwnership(old,{budget,profile});identities.push(()=>{const now=blockingWorkerOwnership(old,{budget,profile});return now.owner===owner.owner&&now.pool===owner.pool&&now.compatible===owner.compatible&&planeMatches(old.detail,c.detailWidth,c.detailHeight)&&old.sourceMode==='loaded image grayscale'&&old.sourceDimensions?.[0]===r.width&&old.sourceDimensions?.[1]===r.height;});if(owner.compatible){const row=pools.pools.find(row=>row.owner===owner.pool);if(!row)unavailable('Native cache pool is absent from the ownership registry.');const planned=blockingPreviewContext(r.width,r.height,params.block,{warm:true,maxWorkers:M,ownedSlots:row.slots});c.workerGrowth=planned.workerGrowth;}}
   bank=Math.max(bank,prefixC+prefixN+c.transformBytes,prefixC+c.cacheBytes+prefixN+c.noiseBytes+c.renderBytes,prefixC+prefixN+27*S);prefixC=sum(prefixC,c.cacheBytes);prefixN=sum(prefixN,c.noiseBytes);worker=sum(worker,c.workerGrowth);workerStaging=Math.max(workerStaging,c.workerStaging);
  }
  contexts.push(c);for(const bytes of c.stores)stores.push({bytes:integer(bytes),chunk:Math.max(8192,8*BLOCK)});if(old)identities.push(()=>cached.entries.get(key)===old&&(!wavelet||waveletCacheMatches(old,c,params.wavelet)));
 }
 if(!K||observed!==I||cached&&cached.entries.size!==K)unavailable('Native context population differs from the admitted domain.');
 const chunks=stores.reduce((n,s)=>sum(n,Math.ceil(s.bytes/s.chunk)),0),migration=session.migration?stores.reduce((n,s)=>sum(n,2*Math.min(s.bytes,session.pageBytes)),0):0;
 const components={runtime:Math.max(32*MiB,runtimeBytes),mainArenaGrowth:Math.max(0,ARENA-mainHeapBytes),resultAndScope:4*w*h,banksAndStorageGuard:integer(bank),nativeWorkerGrowth:integer(worker),activeWorkerStaging:integer(workerStaging),nativeWorkspace:(wavelet?192:128)*BLOCK,stripGuard:4*MiB,parentStaging:589824,metadata:sum(12*transportBytes,4*coordinateBytes,262144,24576*K,1024*chunks),sourceAndIO:sum(16*Math.max(MiB,session.pageBytes),16*Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height,w,h,32768)),migrationWorkspace:migration};
 return{bytes:sum(...Object.values(components)),operation,completeResidentAlternative:true,policy:'logical conservative full native plan; not measured heap',components,geometry:{contexts:K,includedPixels:observed},contexts,stores,session,current(){return image.session===session.owner&&image.ensureTemporarySession===session.ensure&&(!session.owner||sessionInfo(image).pageBytes===session.pageBytes)&&(!cached||!cached.disposed)&&identities.every(f=>f());}};
}

/** Own all planning metadata until its real cleanup, including failure paths.
 * The zero-endpoint owner participates in the existing retryable registry. */
export async function prepareWaveletPreviewHeadroom({task,original,budget,externalCaches,sourceRegions,profile,cpuKernel,runtimeBytes,mainHeapBytes,signal}){
 let view,leases=[],failed=false,primary,cleanupStarted=false;const pool=new WaveletStripPool(budget,{workerFactory:null}),owner=pool.ownCleanup(async()=>{if(view){await view.dispose();view=null;}while(leases.length){leases[0]();leases.shift();}});const release=()=>{cleanupStarted=true;return owner.retire();};let ownedTask=task,decision={status:'retired-unknown-owner',policy:'logical conservative full native plan'};
 const finish=async decision=>{if(decision.status==='retained')return{task:ownedTask,decision,release};const planningMetadataPeakCredit=leases.reduce((n,held)=>n+held.bytes,0);await release();return{task,decision:{...decision,planningMetadataBytes:0,planningMetadataPeakCredit},release};};
 try{
  const T=sourceRegionTransportBytes(task.sourceRegionDomain,{allowAliases:true}),Q=sourceRegionCoordinateBytes(task),hasParams=Object.hasOwn(task,'params'),P=hasParams?sourceRegionTransportBytes(task.params,{allowAliases:true,allowUndefined:true}):0,cloneBytes=sum(4*T,4*Q,4*P,65536);
  if(budget.total()+cloneBytes>budget.limit){await externalCaches.prepare(budget.limit,{signal});return await finish({...decision,status:'retired-insufficient-complete-headroom',reason:'The literal planning copy does not fit with the optional cache.'});}
  // Detach the financed recipe before the first ACK can yield to its caller.
  leases.push(budget.reserve(cloneBytes));ownedTask={...task,sourceRegionDomain:structuredClone(task.sourceRegionDomain),...(hasParams?{params:structuredClone(task.params)}:{})};
  await externalCaches.prepare(runtimeBytes,{signal});if(externalCaches.size===0)return await finish({...decision,status:'retired-insufficient-complete-headroom',reason:'Complete planning metadata does not fit with the optional cache.'});
  const resident=budget.reserve(runtimeBytes);let domain;
  try{domain=await prepareSourceRegionDomain(original,ownedTask.sourceRegionDomain,{signal});}finally{resident();}
  const params=ownedTask.operation==='detail.wavelets'?waveletParams(ownedTask.params):blockingParams(ownedTask.params);
  if(!['membership','native-regions'].includes(sourceRegionDomainShape(domain))){await externalCaches.prepare(budget.limit,{signal});return await finish({...decision,reason:'Ordinary and rectangle adapters retain their existing admission.'});}
  if(domain.width>MAX_AXIS||domain.height>MAX_AXIS)unavailable('Native factory axis exceeds the optional-plan bound.');
  // Finance the geometry iterator's active/next span maps before enumeration,
  // independently of the later native metadata and registry snapshot credits.
  const iteratorBytes=sum(131072,32*T,2048*domain.width);await externalCaches.prepare(sum(runtimeBytes,iteratorBytes),{signal});if(externalCaches.size===0)return await finish({...decision,status:'retired-insufficient-complete-headroom',reason:'Geometry planning metadata does not fit with the optional cache.'});leases.push(budget.reserve(iteratorBytes));
  view=await createSourceRegionView({...original.surface,sha256:original.sha256},domain.descriptor,{budget,signal});let K=0;for(const r of view.admittedRectangles()){if(++K>MAX_RECTS)unavailable('Optional context metadata bound exceeded.');checkAbort(signal);}
  const captureBytes=sum(24576*K,waveletStripOwnershipMetadataBytes(budget));await externalCaches.prepare(sum(runtimeBytes,captureBytes),{signal});if(externalCaches.size===0)return await finish({...decision,status:'retired-insufficient-complete-headroom',reason:'Ownership snapshot metadata does not fit with the optional cache.'});leases.push(budget.reserve(captureBytes));
  const cacheId=await sourceRegionCacheIdentity(ownedTask.imageId,domain),peek=sourceRegions.peekNativePreviewOwner(cacheId),pools=waveletStripOwnershipSnapshot(budget),record=peek?.record,cache=record?.[ownedTask.operation==='detail.wavelets'?'waveletCache':'blockingCache'];
  const plan=waveletPreviewPlan({operation:ownedTask.operation,domain,rectangles:view.admittedRectangles(),params,image:original,budget,pools,cacheRecord:peek,profile,cpuKernel,runtimeBytes,mainHeapBytes,transportBytes:T,coordinateBytes:Q});
  const source={sha256:original.sha256,surface:original.surface,descriptor:original.surface.descriptor,width:original.surface.descriptor.width,height:original.surface.descriptor.height},poolConfig=pools.pools.map(row=>({owner:row.owner,factory:row.owner.factory,url:row.owner.workerURL}));
  const current=()=>{const now=sourceRegions.peekNativePreviewOwner(cacheId);return original.sha256===source.sha256&&original.surface===source.surface&&original.surface.descriptor===source.descriptor&&source.descriptor.width===source.width&&source.descriptor.height===source.height&&poolConfig.every(row=>row.owner.factory===row.factory&&row.owner.workerURL===row.url)&&now?.entry===peek?.entry&&now?.record===record&&now?.retiring===peek?.retiring&&record?.[ownedTask.operation==='detail.wavelets'?'waveletCache':'blockingCache']===cache&&waveletStripOwnershipCurrent(pools)&&plan.current();};
  if(!current())unavailable('Native owner changed before headroom admission.');const retained=externalCaches.snapshot().map(row=>row.id);await externalCaches.prepare(plan.bytes,{signal});
  if(!current()){await externalCaches.prepare(budget.limit,{signal});decision={...decision,status:'retired-stale-snapshot',reason:'Native ownership changed while awaiting optional-cache retirement.'};}
  else decision={...decision,status:externalCaches.snapshot().some(row=>retained.includes(row.id))?'retained':'retired-insufficient-complete-headroom',bytes:plan.bytes,planningMetadataBytes:leases.reduce((n,held)=>n+held.bytes,0),components:plan.components,geometry:plan.geometry};
  checkAbort(signal);return await finish(decision);
 }catch(error){if(error?.code==='OPTIONAL_PREVIEW_PLAN_UNAVAILABLE'){try{await externalCaches.prepare(budget.limit,{signal});return await finish({...decision,reason:error.message});}catch(refusal){failed=true;primary=refusal;throw refusal;}}failed=true;primary=error;throw error;}
 finally{if(failed&&!cleanupStarted)try{await release();}catch(cleanup){appendWaveletCleanup(primary,cleanup);}}
}
