import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,EngineError} from './errors.js';
import {allocateOwnedTypedArray,registerArrayViews} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {createSourceRegionView} from './source-region-view.js';
import {prepareSelfDMWindowContexts} from './selfdm-window-context-plan.js';
import {createSelfDMWindowContextRun} from './selfdm-window-context-run.js';
import {SelfDMProposalEngine} from './selfdm-proposal.js';
import {SELFDM_PROPOSAL_REFERENCE,verifySelfDMProposalModels} from './selfdm-proposal-assets.js';
import {createSelfDMProposalWindowNativePool} from './selfdm-proposal-window-native-pool.js';
import {prepareSelfDMProposalContextGeometry} from './selfdm-proposal-context-geometry.js';
import {createSelfDMProposalContextCv} from './selfdm-proposal-context-cv.js';
import {runSelfDMProposalContextDeepMask} from './selfdm-proposal-context-deepmask.js';
import {prepareSelfDMProposalGrayOwners} from './selfdm-proposal-gray-owners.js';
import {prepareSelfDMProposalPointPresence} from './selfdm-proposal-point-presence.js';
import {runSelfDMProposalOwnerDense,runSelfDMProposalCommonPoints} from './selfdm-proposal-context-points.js';
import {runSelfDMProposalColourSeeds} from './selfdm-proposal-colour-kernel.js';
import {createSelfDMProposalSuperGlueShapes} from './selfdm-proposal-superglue-shape-graph.js';
import {createSelfDMProposalCRFSupport} from './selfdm-proposal-crf-support.js';
import {proposalCRFWindows} from './selfdm-proposal-pyramid.js';
import {selectProposalBoxes,proposalResize,createFirstMatchPaint,paintMatchedPoints,sourceMatchedPoint,fuseProposalScores} from './selfdm-proposal-process.js';

const MiB=1024**2,tensor=(data,dims,type='float32')=>({data,dims,type}),roundMiB=n=>Math.ceil(n/MiB)*MiB;
export const SELFDM_PROPOSAL_WINDOW_RUN='selfdm-proposal-native-window-complete-chain/1';
const contextData=c=>({id:c.id,bounds:[...c.bounds],localRectangle:{...c.localRectangle},nativeInput:[...c.nativeInput],nativeGrid:[...c.nativeGrid],offset:c.offset,count:c.count,gridIndices:c.gridIndices,candidateGrid:c.candidateGrid,outputSupport:c.outputSupport,candidateGridSha256:c.candidateGridSha256,outputSupportSha256:c.outputSupportSha256,cnnContext:c.cnnContext});
const supportData=s=>({policy:s.policy,width:s.width,height:s.height,origin:[...s.origin],phase:[...s.phase],grid:[...s.grid],contextCounts:s.contextCounts,candidateCounts:s.candidateCounts,candidateCells:s.candidateCells,contextIndices:s.contextIndices,candidateIndices:s.candidateIndices,tensors:s.tensors});
/** Pure scientific packet: the retryable result owner stays with its parent. */
export function selfDMProposalWindowData(result){const{release,...data}=result;return data;}


/** ONE source-owned analysis, with its actual mode and canonical domains.
 * This new route is not registered in a public factory/gate by this module.
 * Full candidate rectangles keep the historical engine directly. The native
 * sources, callbacks, graph pool and stage operators remain the received ones.
 */
export function createSelfDMProposalWindowRun({original,window,models,backend='auto',cloneWindowMode='independent'},{budget,profile,signal,onOwner,onProgress,cvAsset,runtimes,workerFactory,resourceOperation,prepareContexts=prepareSelfDMWindowContexts,prepareGeometry=prepareSelfDMProposalContextGeometry,nativePoolFactory=createSelfDMProposalWindowNativePool,cvFactory=createSelfDMProposalContextCv,initialMapFactory=createSelfDMWindowContextRun,legacyFactory=(...args)=>new SelfDMProposalEngine(...args),colourFactory=runSelfDMProposalColourSeeds}={}){
 requireValue(budget?.reserve&&profile?.maxWorkers>0&&['auto','cpu','webgpu'].includes(backend)&&['independent','global'].includes(cloneWindowMode),'Native Proposal source, actual mode/backend and shared profile required');
 models=verifySelfDMProposalModels(models);
 const lifetime=new AbortController(),sourceLifetime=new AbortController(),joined=signal?AbortSignal.any([signal,lifetime.signal]):lifetime.signal,children=new Set(),credits=[],backings=[],records=[];
 let plan,view,geometry,cv,pool,operation,ownOperation=false,work,active,requested=false,closed=false,closing,answer;
 const own=value=>{requireValue(value&&typeof(value.release??value.dispose)==='function','Native Proposal child owner required');children.add(value);return value};
 const retire=async value=>{if(value&&children.has(value)){await(value.release??value.dispose).call(value);children.delete(value)}};
 const array=(Type,length,label)=>{const allocation=own(allocateOwnedTypedArray(Type,length,{budget,owner:'selfdm-proposal',label}));return allocation.data};
 const admit=bytes=>{credits.push(budget.reserve(bytes))};
 const adopted=value=>{backings.push(registerArrayViews(budget,value,{owner:'selfdm-proposal',label:'native-proposal-composed-fields'}));return value};
 async function retireWork(){
  for(const child of [...children].reverse())await retire(child);
  if(pool){await pool.dispose();pool=null}if(cv){await cv.dispose();cv=null}
  sourceLifetime.abort();
  if(view){await view.dispose();view=null}if(geometry){await geometry.release();geometry=null}if(plan){await plan.release();plan=null}
  while(backings.length){await backings.at(-1)();backings.pop()}while(credits.length){await credits.at(-1)();credits.pop()}
  if(operation&&ownOperation){await operation.release();operation=null}answer=null;
 }
 function dispose(){
  requested=true;lifetime.abort();if(closed)return Promise.resolve();if(closing)return closing;
  closing=(async()=>{await Promise.allSettled([active]);await retireWork();closed=true})().finally(()=>{closing=null});return closing;
 }
 const graph=async(name,input,options)=>{
  checkAbort(joined);admit(4096);
  const value=await pool.run(name,input,{...options,signal:joined,resourceOperation:operation});
  records.push({stage:name,...value.metrics,timings:value.timings,heapBytes:value.heapBytes,graphTransform:value.graphTransform??null,...(value.qualificationGpu?{qualificationGpu:value.qualificationGpu}:{})});return value;
 };
 const state=()=>({closed,retiring:requested,active:!!active,children:children.size,sourceOwned:!!plan,viewOwned:!!view,geometryOwned:!!geometry,nativePoolOwned:!!pool,cvOwned:!!cv,records});
 async function calculate(){
  try{
   checkAbort(joined);operation=resourceOperation??budget.beginOperation?.({owner:'selfdm-proposal',id:'complete-native-window'});ownOperation=!resourceOperation&&!!operation;
   plan=await prepareContexts({original,window},{budget,lifetimeSignal:sourceLifetime.signal,onOwner:value=>{plan=value}});checkAbort(joined);
   if(plan.status==='empty')return{status:'empty',cloneWindowMode,contexts:[],metadata:{policy:SELFDM_PROPOSAL_WINDOW_RUN,cloneWindowMode,analysisWindow:{id:window.id,kind:window.kind,bounds:[...window.bounds],fingerprint:window.fingerprint},actualNativePipelines:0},release:dispose};
   geometry=await prepareGeometry(plan,{budget,signal:joined,cloneWindowMode});checkAbort(joined);
   const origin=[...plan.contextDomain.origin],width=plan.contextDomain.width,height=plan.contextDomain.height,area=width*height;
   admit(65536+plan.contexts.length*8192);
   if(plan.ordinaryRectangleEligible){
    const context=plan.contexts[0],w=context.bounds[2]-context.bounds[0],h=context.bounds[3]-context.bounds[1],legacy=own(legacyFactory({format:'rgb8',width:w,height:h,readRows:context.readRows},budget,profile));
    const result=own(await legacy.analyze({}, {models,backend,signal:joined,onProgress,cv:cvAsset,runtimes}));checkAbort(joined);
    requireValue(result.raw instanceof Float32Array&&result.raw.length===w*h,'Historical Proposal rectangle output contract');
    return{...result,status:'complete',nativeContexts:plan.contexts.map(c=>({id:c.id,bounds:[...c.bounds],nativeInput:[512,512],nativeGrid:[64,64]})),cloneWindowMode,origin:[context.bounds[0],context.bounds[1]],metadata:{...result.metadata,policy:SELFDM_PROPOSAL_WINDOW_RUN,cloneWindowMode,nativeRectangleDirect:true,sourceSha256:original.sha256,modelSha256s:Object.fromEntries(Object.entries(models).map(([name,asset])=>[name,asset.sha256])),analysisWindow:{id:window.id,kind:window.kind,bounds:[...window.bounds],fingerprint:window.fingerprint},contextFingerprint:plan.contextDomain.fingerprint,candidateFingerprint:plan.candidateDomain.fingerprint},release:dispose};
   }
   // Canonical product windows have the same admitted source/candidate pixels.
   // A separate context-only DeepMask support adapter is still an explicit
   // open case; never let an unhandled candidate restriction enter Top500.
   if(plan.candidateDomain.countIncluded!==plan.contextDomain.countIncluded)throw new EngineError('NATIVE_PROPOSAL_DEEPMASK_CANDIDATE_SUPPORT_REQUIRED','Context-only DeepMask mask support must be qualified before this candidate restriction can enter the native Top500.',{details:{beforeRgbAndAnyEncoder:true}});
   for(const c of plan.contexts)for(let y=c.bounds[1];y<c.bounds[3];y++)if(!plan.candidateDomain.originalRowIntervals(y).some(([x0,x1])=>x0<=c.bounds[0]&&x1>=c.bounds[2]))throw new EngineError('NATIVE_PROPOSAL_DEEPMASK_CANDIDATE_SUPPORT_REQUIRED','Context-only DeepMask mask support must be qualified before this candidate restriction can enter the native Top500.',{details:{contextId:c.id,beforeRgbAndAnyEncoder:true}});
   view=await createSourceRegionView(original.surface,plan.contextDomain,{budget,signal:sourceLifetime.signal,maxReadPixels:Math.max(262144,width)});checkAbort(joined);
   pool=nativePoolFactory({models,budget,profile,backend,workerFactory,runtimes});cv=cvFactory({budget,profile,lifetimeSignal:joined,resourceOperation:operation,cv:cvAsset,workerFactory});
   // Constructor envelope only; every actual stage still receives the original
   // requested backend through the common native pool, including auto fallback.
   const constructorBackend=backend==='auto'?(globalThis.navigator?.gpu?'webgpu':'cpu'):backend;
   const map=own(initialMapFactory({original,window,model:models.selfdm,modelUrl:models.selfdm.url,backend:constructorBackend,cloneWindowMode},{budget,profile,signal:joined,prepareContexts:async()=>({...plan,release(){}}),nativeStagesFactory:()=>pool.createInitialStages({onRun:graph})}));
   const initial=await map.execute();checkAbort(joined);requireValue(initial.status==='complete'&&initial.contexts.length===plan.contexts.length,'Complete native initial Map contexts required');
   const initialChart=array(Float32Array,area,'proposal-window-initial-chart');
   for(const item of initial.contexts){
    requireValue(item.status==='complete'&&item.raw instanceof Float32Array&&item.raw.length===512**2,'Native initial Map512 context field required');
    const c=item.context,w=c.bounds[2]-c.bounds[0],h=c.bounds[3]-c.bounds[1],resized=own(await cv.resizeMap(item.raw,[512,512],[w,h],{signal:joined,onOwner:own}));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ox=c.bounds[0]+x,oy=c.bounds[1]+y;if(plan.candidateDomain.containsOriginal(ox,oy))initialChart[(oy-origin[1])*width+ox-origin[0]]=resized.raw.data[y*w+x]}
    await retire(resized);
   }
   const deep=own(await runSelfDMProposalContextDeepMask({geometry,backend},{budget,profile,cv,runGraph:graph,signal:joined,resourceOperation:operation,onProgress,onOwner:own}));checkAbort(joined);
   admit(deep.raw.candidates.length*256+16384);const rectangles=[];
   for(const candidate of deep.raw.candidates){
    const box=own(await cv.maskBox(candidate,{signal:joined,onOwner:own}));if(box.raw.found)rectangles.push(Array.from(box.raw.box,(v,i)=>v+candidate.contextBounds[i%2]-origin[i%2]));else rectangles.push(null);await retire(box);
   }
   const mean=(rect,score,w)=>{let sum=0,count=0;for(let y=rect[1];y<rect[3];y++)for(let x=rect[0];x<rect[2];x++)if(plan.candidateDomain.containsOriginal(x+origin[0],y+origin[1])){sum+=score[y*w+x];count++}return count?Math.fround(sum/count):0};
   const boxes=selectProposalBoxes(rectangles,initialChart,width,height,{mean}),resize=proposalResize(boxes),[rw,rh]=resize,proposals=[];
   admit(16384+boxes.length*4096);
   if(boxes.length>=2){const prepared=await Promise.allSettled(boxes.map(async(_,index)=>{
    checkAbort(joined);const box=boxes[index][0],originalBounds=box.map((v,i)=>v+origin[i%2]),grayOwners=own(await prepareSelfDMProposalGrayOwners(view,originalBounds,resize,{budget,signal:joined,onOwner:own})),pointOwners=[];
    for(const grayOwner of grayOwners.owners){
     const presence=own(await prepareSelfDMProposalPointPresence({grayOwners,grayOwner,contextDomain:plan.contextDomain,candidateDomain:plan.candidateDomain},{budget,signal:joined,onOwner:own}));
     const gray=own(await cv.gray(grayOwner,resize,{signal:joined,onOwner:own})),dense=own(await runSelfDMProposalOwnerDense({gray:gray.raw.gray,width:rw,height:rh,backend},{budget,profile,runGraph:graph,signal:joined,resourceOperation:operation,onProgress,onOwner:own}));
     pointOwners.push({id:grayOwner.id,bounds:grayOwner.bounds,size:resize,presence:presence.presence,presenceIdentity:presence.identity,dense:dense.raw});
    }
    requireValue(pointOwners.length>0,'Selected native Proposal ROI lost every admitted gray observation');
    const points=own(await runSelfDMProposalCommonPoints({owners:pointOwners,proposalBounds:originalBounds,proposalSize:resize,backend},{budget,profile,runGraph:graph,signal:joined,resourceOperation:operation,onOwner:own}));
    const color=own(await colourFactory({view,rect:{x:box[0],y:box[1],width:box[2]-box[0],height:box[3]-box[1]},resize},{budget,profile,signal:joined,resourceOperation:operation,onOwner:own}));
    requireValue(color.raw.labels instanceof Int32Array&&color.raw.labels.length===rw*rh&&Number.isSafeInteger(color.raw.labelCount)&&color.raw.labelCount>=0,'Received common native SEEDS labels required');await color.retireNative();
    proposals[index]={index,bounds:originalBounds,localBounds:box,points:points.result,pointRaw:points.raw,color:color.raw,count:points.result.scores.data.length};
    onProgress?.({phase:'selfdm-proposal-native-window-points',proposal:index,total:boxes.length});
   }));const failed=prepared.find(value=>value.status==='rejected');if(failed)throw failed.reason;checkAbort(joined);}
   let matchedPoints=[],fused,paints=[];const pairReceipts=[];
   if(boxes.length>=2){
    for(const p of proposals){admit(p.color.labels.length*16+(p.color.labelCount+1)*8+4096);const paint=createFirstMatchPaint(p.color.labels.slice(),p.color.labelCount);adopted(paint);paints.push(paint)}
    const shapes=own(createSelfDMProposalSuperGlueShapes([resize,resize],{budget}));
    for(let i=0;i<proposals.length;i++)for(let j=i+1;j<proposals.length;j++){
     const a=proposals[i],b=proposals[j];if(!a.count||!b.count)continue;checkAbort(joined);
     const result=own(await graph('proposal-superglue-shape',{...shapes.inputs,keypoints0:a.points.keypoints,keypoints1:b.points.keypoints,scores0:a.points.scores,scores1:b.points.scores,descriptors0:a.points.descriptors,descriptors1:b.points.descriptors},{backend,workspaceBytes:Math.max(192*MiB,roundMiB((a.count*a.count+b.count*b.count+a.count*b.count)*24)),gpuWasmWorkspaceBytes:128*MiB,outputBytes:(a.count+b.count)*12}));
     const out=result.result;for(const side of[0,1]){const count=side?b.count:a.count,other=side?a.count:b.count,m=out['matches'+side],s=out['matching_scores'+side];requireValue(m?.data instanceof BigInt64Array&&s?.data instanceof Float32Array&&m.data.length===count&&s.data.length===count&&JSON.stringify(m.dims)===JSON.stringify([1,count])&&JSON.stringify(s.dims)===JSON.stringify([1,count])&&s.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1.00001)&&m.data.every(v=>v>=-1n&&v<BigInt(other)),'Native SuperGlue pair output contract')}
     const points0=paintMatchedPoints(paints[i],a.points.keypoints.data,out.matches0.data,out.matching_scores0.data,rw),points1=paintMatchedPoints(paints[j],b.points.keypoints.data,out.matches1.data,out.matching_scores1.data,rw);
     if(points1.length){admit((points0.length+points1.length)*64);matchedPoints.push(...points0.map(p=>sourceMatchedPoint(p,a.bounds,rw,rh)),...points1.map(p=>sourceMatchedPoint(p,b.bounds,rw,rh)))}
     pairReceipts.push({i,j,count0:a.count,count1:b.count,matched0:points0.length,matched1:points1.length,metrics:result.metrics,timings:result.timings});await retire(result);
    }
    const resized=new Array(proposals.length);
    for(let i=0;i<paints.length;i++)if(paints[i].painted){const source=array(Float32Array,paints[i].scores.length,'proposal-native-paint-float32');source.set(paints[i].scores);const box=boxes[i][0],value=own(await cv.resizeMap(source,resize,[box[2]-box[0],box[3]-box[1]],{signal:joined,onOwner:own}));resized[i]=value.raw.data}
    admit(area*9);const fusion=fuseProposalScores(boxes,resized,initialChart,width,height,matchedPoints);adopted({score:fusion.score});fused={...fusion,data:array(Float32Array,area,'proposal-native-fused-unary')};fused.data.set(fusion.score);
   }else{fused={data:array(Float32Array,area,'proposal-native-initial-fallback'),fellBackToInitial:true};fused.data.set(initialChart)}
   checkAbort(joined);
   // Keep the EXISTING native CRF window/halo/AvgPool phase schedule. Each
   // support has unique local addresses; only its central output is published.
   // Technical halo overlap never creates an extra central observation.
   const crfWindows=proposalCRFWindows(width,height),crfRecords=new Array(crfWindows.length),finalChart=crfWindows.length===1?null:array(Float32Array,area,'proposal-native-CRF-chart');
   let nextCRF=0,crfFailed=false,crfFailure;
   async function refineWindow(index){
    checkAbort(joined);const w=crfWindows[index],n=w.width*w.height,windowOrigin=[origin[0]+w.sx,origin[1]+w.sy];let nc=0,np=0;
    const rowIntervals=(domain,y)=>domain.originalRowIntervals(windowOrigin[1]+y).map(([x0,x1])=>[Math.max(windowOrigin[0],x0),Math.min(windowOrigin[0]+w.width,x1)]).filter(([x0,x1])=>x1>x0);
    for(let y=0;y<w.height;y++){for(const[x0,x1]of rowIntervals(plan.contextDomain,y))nc+=x1-x0;for(const[x0,x1]of rowIntervals(plan.candidateDomain,y))np+=x1-x0}
    if(!np){crfRecords[index]={window:{...w},origin:windowOrigin,status:'empty-candidate',actualNativePipelines:0};return}
    const contextIndices=array(Uint32Array,nc,'proposal-CRF-window-context-indices'),candidateIndices=array(Uint32Array,np,'proposal-CRF-window-candidate-indices');let ci=0,pi=0;
    for(let y=0;y<w.height;y++){for(const[x0,x1]of rowIntervals(plan.contextDomain,y))for(let x=x0;x<x1;x++)contextIndices[ci++]=y*w.width+x-windowOrigin[0];for(const[x0,x1]of rowIntervals(plan.candidateDomain,y))for(let x=x0;x<x1;x++)candidateIndices[pi++]=y*w.width+x-windowOrigin[0]}
    const support=own(createSelfDMProposalCRFSupport({width:w.width,height:w.height,origin:windowOrigin,contextIndices,candidateIndices},{budget,signal:joined})),bgr=array(Float32Array,nc*3,'proposal-CRF-window-packed-BGR'),unary=array(Float32Array,np*2,'proposal-CRF-window-packed-unary');
    let at=0;
    for(let y=0;y<w.height;y++)for(const[x0,x1]of rowIntervals(plan.contextDomain,y)){
     checkAbort(joined);const row=own(await view.readWindow({x:x0-origin[0],y:w.sy+y,width:x1-x0,height:1},{signal:joined})),rgb=row.pixels.data;
     requireValue(rgb instanceof Uint8Array&&rgb.length===(x1-x0)*3,'Native CRF admitted window RGB row geometry');for(let x=0;x<x1-x0;x++){bgr[at]=rgb[x*3+2];bgr[nc+at]=rgb[x*3+1];bgr[nc*2+at]=rgb[x*3];at++}await retire(row);
    }
    requireValue(at===nc,'CRF unique local RGB observations were skipped or duplicated');
    for(let i=0;i<np;i++){const local=candidateIndices[i],x=local%w.width,y=Math.floor(local/w.width),p=fused.data[(w.sy+y)*width+w.sx+x];requireValue(Number.isFinite(p)&&p>=0&&p<=1.00001,'Native fused unary window probability contract');unary[i]=Math.fround(1-p);unary[np+i]=p}
    const fields=['context_slots','candidate_slots','context_presence','candidate_presence','local_yx','origin_yx','candidate_pixels','slot_shape','coarse_shape','dense_flat_shape','dense_unary_shape'],options={backend,workspaceBytes:32*MiB+n*512};
    const pooled=own(await graph('proposal-crf-pool',{context_bgr:tensor(bgr,[1,3,1,nc]),candidate_unary:tensor(unary,[1,2,1,np]),...Object.fromEntries(fields.map(key=>[key,support.tensors[key]]))},{...options,outputBytes:n*40}));
    const related=own(await graph('proposal-crf-relations',{...Object.fromEntries(['/If_7_output_0','/If_15_output_0','/If_23_output_0'].map(key=>[key,pooled.result[key]])),candidate_cells:support.tensors.candidate_cells},{...options,outputBytes:n*8}));
    const decoded=own(await graph('proposal-crf-decode',{'/ReduceSum_2_output_0':related.result['/ReduceSum_2_output_0'],'/LogSoftmax_output_0':pooled.result['/LogSoftmax_output_0'],chart_shape:support.tensors.chart_shape},{...options,outputBytes:n*4}));
    const values=Object.values(decoded.result);requireValue(values.length===1&&values[0].data instanceof Float32Array&&JSON.stringify(values[0].dims)===JSON.stringify([1,w.height,w.width])&&values[0].data.every(v=>Number.isFinite(v)&&v>=0&&v<=1.00001),'Native CRF window probability contract');checkAbort(joined);
    const probability=values[0].data;
    if(finalChart)for(let y=w.y;y<w.y1;y++)finalChart.set(probability.subarray((y-w.sy)*w.width+w.x-w.sx,(y-w.sy)*w.width+w.x1-w.sx),y*width+w.x);
    crfRecords[index]={window:{...w},origin:windowOrigin,status:'complete',contextIndices,candidateIndices,support:supportData(support),pool:pooled.result,relations:related.result,decode:decoded.result,probability,actualNativePipelines:3};
    onProgress?.({phase:'selfdm-proposal-native-CRF-window',index,total:crfWindows.length,window:{...w},origin:windowOrigin});
   }
   const crfWorkers=Array.from({length:Math.min(crfWindows.length,profile.maxWorkers)},async()=>{while(nextCRF<crfWindows.length&&!crfFailed){const index=nextCRF++;try{await refineWindow(index)}catch(primary){if(!crfFailed){crfFailed=true;crfFailure=primary}throw primary}}});
   await Promise.allSettled(crfWorkers);if(crfFailed)throw crfFailure;checkAbort(joined);
   const finalProbability=finalChart??crfRecords[0]?.probability;requireValue(finalProbability instanceof Float32Array&&finalProbability.length===area,'Native CRF central chart assembly incomplete');
   const crf={windows:crfRecords,windowGeometry:'existing proposalCRFWindows256 with native halos/phase and central copy once',...(crfRecords.length===1?crfRecords[0]:{})};
   const providers=[...new Set(records.map(r=>r.provider).filter(Boolean))];
   return{status:'complete',nativeContexts:plan.contexts.map(c=>({id:c.id,bounds:[...c.bounds],nativeInput:[512,512],nativeGrid:[64,64]})),cloneWindowMode,origin,width,height,raw:finalProbability,dataNatif:{initial:{contexts:initial.contexts.map(item=>({context:contextData(item.context),status:item.status,raw:item.raw,shape:item.shape??[1,1,512,512],...(item.nativeExecution?{nativeExecution:item.nativeExecution}:{})})),execution:initial.execution,chart:initialChart},deepMask:deep.raw,selected:{rectangles,boxes,resize},proposals,supergluePairs:pairReceipts,matchedPoints,fusion:{data:fused.data,fellBackToInitial:fused.fellBackToInitial},crf},metrics:{backendRequested:backend,providers,actualNativePipelines:records.length,stages:records,pool:pool.snapshot(),cv:cv.metrics()},metadata:{algorithm:'SelfDM + Proposal SuperGlue',...SELFDM_PROPOSAL_REFERENCE,policy:SELFDM_PROPOSAL_WINDOW_RUN,cloneWindowMode,sourceSha256:original.sha256,modelSha256s:Object.fromEntries(Object.entries(models).map(([name,asset])=>[name,asset.sha256])),contextFingerprint:plan.contextDomain.fingerprint,candidateFingerprint:plan.candidateDomain.fingerprint,analysisWindow:{id:window.id,kind:window.kind,bounds:[...window.bounds],fingerprint:window.fingerprint},originalOrigin:origin,sourceDimensions:[width,height],coordinateFrame:'source-window-chart; context bounds and matchedPoints Original',proposals:boxes,resize,matchedPoints:matchedPoints.length,fellBackToInitial:fused.fellBackToInitial,actualNativePipelines:records.length,nativeStageTraversal:{initialMap:records.filter(r=>r.stage.startsWith('proposal-map-')).length,deepMask:records.filter(r=>r.stage==='deepmask').length,superpoint:records.filter(r=>r.stage==='superpoint').length,nativePointPost:records.filter(r=>r.stage.startsWith('proposal-point-')).length,superglue:pairReceipts.length,crf:records.filter(r=>r.stage.startsWith('proposal-crf-')).length},backendRequested:backend,providers},release:dispose};
  }catch(primary){requested=true;lifetime.abort();await retireCompositeOwners([retireWork],{primary});throw primary}
 }
 const owner={policy:SELFDM_PROPOSAL_WINDOW_RUN,execute(){if(requested||closed)return Promise.reject(new EngineError('DISPOSED','Native Proposal window retired'));if(!work){work=calculate().then(value=>answer=value);active=work;void work.finally(()=>{active=null}).catch(()=>{})}return work},dispose,state};
 onOwner?.(owner);return owner;
}
