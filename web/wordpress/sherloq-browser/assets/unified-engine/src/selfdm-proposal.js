import "../../runtime-context.js?v=0.16.0";
import {EngineError,requireValue,checkAbort,serializeEngineError} from './errors.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {createSelfDMPrepare} from './selfdm-prepare.js';
import {validateRgbRows} from './rgb-row-source.js';
import {allocateOwnedTypedArray,allocateTypedArray,registerArrayViews} from './allocation.js';
import {sparseStageCache} from './sparse-stage-cache.js';
import {SELFDM_PROPOSAL_REFERENCE,SELFDM_PROPOSAL_CV,verifySelfDMProposalModels,selfDMProposalRuntimes} from './selfdm-proposal-assets.js';
import {selectProposalBoxes,proposalResize,createFirstMatchPaint,paintMatchedPoints,sourceMatchedPoint,fuseProposalScores} from './selfdm-proposal-process.js';
import {proposalDeepMaskWindows,proposalSourcePatch,proposalCRFWindows,proposalSeedsBytes} from './selfdm-proposal-pyramid.js';
import {runProposalPointWindows} from './selfdm-proposal-point-window.js';

const MiB=1024**2,SIDE=512,MASK=112**2;
let nextId=0;
function bytes(value,seen=new Set()){
 if(ArrayBuffer.isView(value)){if(seen.has(value.buffer))return 0;seen.add(value.buffer);return value.buffer.byteLength;}
 if(typeof value==='string')return value.length*2;if(!value||typeof value!=='object')return 8;
 return Object.values(value).reduce((sum,item)=>sum+bytes(item,seen)+24,64);
}
function tensors(value){return Object.fromEntries(Object.entries(value).filter(([,item])=>ArrayBuffer.isView(item)));}
function probability(output,dims,label){requireValue(output?.data instanceof Float32Array&&JSON.stringify(output.dims)===JSON.stringify(dims)&&output.data.every(value=>Number.isFinite(value)&&value>=0&&value<=1.00001),label+' probability contract');return output.data;}
function pins(budget,value){return registerArrayViews(budget,tensors(value),{owner:'selfdm-proposal',label:'selfdm-proposal-checkpoint'});}

/** Complete pinned SelfDM+DeepMask+Proposal SuperGlue+SEEDS+ConvCRF.
 * Learned jobs share one ORT pool/global CPU broker and reuse idle runtimes.
 * Source CV work uses the same broker through persistent strip workers. Every
 * scientific checkpoint is compact, budgeted and evictable between analyses.
 * The512px initial network is projected onto the original coordinate grid;
 * receptive-field windows bound later graphs without resizing the source.
 */
export class SelfDMProposalEngine{
 constructor(image,budget,profile,{poolFactory=(...args)=>new NeuralGraphPool(...args),stripPoolFactory=(...args)=>new WaveletStripPool(...args),workerFactory}={}){
  requireValue(image?.format==='rgb8'&&Number.isSafeInteger(image.width)&&Number.isSafeInteger(image.height)&&(image.data instanceof Uint8Array||typeof image.readRows==='function'),'SelfDM Proposal RGB image required');
  requireValue(budget&&typeof budget.reserve==='function'&&Number.isInteger(profile?.maxWorkers)&&profile.maxWorkers>0,'SelfDM Proposal shared budget/profile required');
  this.image=image;this.budget=budget;this.profile=profile;this.poolFactory=poolFactory;this.stripPoolFactory=stripPoolFactory;this.workerFactory=workerFactory;
  this.prefix='selfdm-proposal-'+(++nextId)+'/';this.lifetime=new AbortController();this.disposed=false;this.running=false;this.cvPools=new Map();this.independentZoneWorker=true;
 }
 async dispose(){if(this.disposed)return;this.disposed=true;this.lifetime.abort();await this.finished;this.pool?.dispose();for(const pool of this.cvPools.values())pool.clear();this.cvPools.clear();this.budget.clearPrefix(this.prefix);}
 releaseIdle(){if(!this.running){for(const slot of [...this.pool?.slots??[]])if(!slot.busy)this.pool.drop(slot);for(const pool of this.cvPools.values())pool.clear();this.cvPools.clear();}}
 trimNeural(){const idle=(this.pool?.slots??[]).filter(slot=>!slot.busy).sort((a,b)=>b.cap-a.cap);for(const slot of idle.slice(1))this.pool.drop(slot);}
 kernel(kind,operation,{heap=32*MiB,io=8*MiB}={}){
  let pool=this.cvPools.get(kind);if(pool){pool.resourceOperation=operation;return pool;}
  const url=new URL('./selfdm-proposal-worker.js',import.meta.url);
  pool=this.stripPoolFactory(this.budget,{resourceOwner:'selfdm-proposal',resourceOperation:operation,maxWorkers:this.profile.maxWorkers,workerHeapBytes:heap,workerPixelBytes:io,workerURL:url,
   workerFactory:()=>this.workerFactory?this.workerFactory(url):new Worker(url,{type:'module'})});
  pool.proposalHeapBytes=heap;this.cvPools.set(kind,pool);return pool;
 }
 async analyze(params={},hooks={}){
  requireValue(!this.running&&!this.disposed,'SelfDM Proposal engine busy or disposed');
  const width=this.image.width,height=this.image.height,PLANE=width*height;
  requireValue(width>=8&&height>=8&&Number.isSafeInteger(PLANE*12),'Proposal dimensions must produce every native pyramid scale');
  requireValue(['auto','cpu','webgpu'].includes(hooks.backend??'auto'),'SelfDM Proposal backend');
  const models=verifySelfDMProposalModels(hooks.models),key=Object.values(models).map(value=>value.sha256).join('/'),cvURL=hooks.cv?.url??new URL('../vendor/selfdm-proposal/seeds.wasm',import.meta.url).href;
  requireValue(!hooks.cv||hooks.cv.bytes===SELFDM_PROPOSAL_CV.bytes&&hooks.cv.sha256===SELFDM_PROPOSAL_CV.sha256,'Pinned Proposal CV identity required');
  if(this.identity!==key){requireValue(!this.pool||this.pool.slots.every(slot=>!slot.busy),'Proposal neural identity changed during work');this.pool?.dispose();this.budget.clearPrefix(this.prefix);this.identity=key;this.pool=this.poolFactory(this.budget,this.profile,{assets:models,runtimes:hooks.runtimes??selfDMProposalRuntimes(),resourceOwner:'selfdm-proposal',...(this.workerFactory?{workerFactory:this.workerFactory}:{})});}
  this.running=true;let finish;this.finished=new Promise(resolve=>{finish=resolve;});
  const controller=new AbortController(),signal=AbortSignal.any([controller.signal,this.lifetime.signal,...(hooks.signal?[hooks.signal]:[])]),operation=this.budget.beginOperation?.({owner:'selfdm-proposal',id:'complete-chain'});
  const scratch=[],hits={},records=[],cached=sparseStageCache(this.budget,this.prefix+key+'/',{signal,hits,byteLength:bytes});
  const admit=n=>{const release=this.budget.reserve(n);scratch.push(release);return release;};
  const own=(Type,length,label)=>{const value=allocateOwnedTypedArray(Type,length,{budget:this.budget,owner:'selfdm-proposal',label});scratch.push(value.release);return value.data;};
  const adopt=value=>{cached.adopt(value,pins(this.budget,value));const arrayBytes=Object.values(tensors(value)).reduce((sum,array)=>sum+array.byteLength,0);admit(Math.max(0,bytes(value)-arrayBytes));return value;};
  const report=(phase,fraction,extra={})=>hooks.onProgress?.({phase,fraction,...extra});
  const graph=async(name,inputs,workspaceBytes,outputBytes,details={})=>{
   // Static literal Casts are folded during export, preserving values/dtypes
   // while removing the ORT unassigned-provider failure. All learned/CRF
   // graphs share the requested backend; OpenCV stages remain native CPU.
   const backend=hooks.backend??'auto';
   const value=await this.pool.run(name,inputs,{signal,backend,workspaceBytes,outputBytes,gpuWasmWorkspaceBytes:details.gpuWasmWorkspaceBytes??models[name].gpuWasmWorkspaceBytes,resourceOperation:operation,onProgress:event=>hooks.onProgress?.({...event,stage:name})});
   records.push({stage:name,...details,...value.metrics,timings:value.timings,heapBytes:value.heapBytes,inferenceExecutions:1,cacheHit:false,...(value.qualificationGpu?{qualificationGpu:value.qualificationGpu}:{})});return value;
  };
  const memo=async(name,compute)=>{
   const value=await cached.memo(name,compute);
   if(hits[name]===true){records.push({stage:name,provider:'wasm',inferenceExecutions:0,preflightExecutions:0,cacheHit:true,sourceMetrics:value.metrics});report('selfdm-proposal-cache',undefined,{stage:name});}
   return value;
  };
  let finalResult,completedResult=false,crfRecord,crfReservation;
  const crfKey=this.prefix+key+'/crf-state';
  const sourceRect=async(x,y,w,h)=>{
   const owned=allocateOwnedTypedArray(Uint8Array,w*h*3,{budget:this.budget,owner:'selfdm-proposal',label:'proposal-source-window'});
   try{if(this.image.data){requireValue(this.image.data.length===PLANE*3,'Source RGB geometry');for(let row=0;row<h;row++)owned.data.set(this.image.data.subarray(((y+row)*width+x)*3,((y+row)*width+x+w)*3),row*w*3);}
    else for(let row=0;row<h;row++){
     const window=await this.image.readRows(y+row,1,{signal});let primary;
     try{const data=validateRgbRows(window,width,1);owned.data.set(data.subarray(x*3,(x+w)*3),row*w*3);}
     catch(error){primary=error;throw error;}
     finally{try{window?.release?.();}catch(cleanup){if(primary){if(typeof primary==='object')primary.details={...primary.details,cleanupErrors:[...(primary.details?.cleanupErrors??[]),{stage:'proposal-source-row',row:y+row,error:serializeEngineError(cleanup)}]};}else throw cleanup;}}
    }
    return owned;
   }catch(error){owned.release();throw error;}
  };
  try{
   checkAbort(signal);
   const initial=await memo('initial',async()=>{
    const prepare=createSelfDMPrepare({budget:this.budget});let prepared,result;
    const readRows=this.image.readRows?this.image.readRows.bind(this.image):async(y,rows)=>({pixels:{format:'rgb8',width,height:rows,data:this.image.data.subarray(y*width*3,(y+rows)*width*3)},release(){}});
    try{prepared=await prepare.run({width,height,readRows,side:SIDE},{signal});result=await graph('selfdm',{rgb:{data:prepared.tensor,dims:prepared.shape}},320*MiB,SIDE*SIDE*4);
     const raw=probability(result.result.probability,[1,1,SIDE,SIDE],'SelfDM');
     if(width===SIDE&&height===SIDE){scratch.push(result.release);result=null;return adopt({data:raw});}
     let data;const heap=Math.ceil((16*MiB+(SIDE*SIDE+PLANE)*4)/MiB)*MiB,kernel=this.kernel('initial-resize',operation,{heap,io:(SIDE*SIDE+PLANE)*4});
     await kernel.run({count:1,pixels:1,key:'selfdm-initial-native-resize',signal,prepare:async()=>({command:'resize',width,height,map:raw.slice(),resize:[SIDE,SIDE],target:[width,height],heapBytes:heap,cvURL}),consume:value=>{data=own(Float32Array,PLANE,'proposal-initial-map');data.set(value.data);},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared budget cannot admit native SelfDM map projection.');}});
     return adopt({data});
    }finally{result?.release();prepared?.release();prepare.dispose();}
   });report('selfdm-proposal-initial',.1);
   const compact=[];
   // Independent scales may overlap under the common RAM/CPU admissions.
   // Await every active sibling even after a failure: its input lease and
   // completed checkpoint must survive until its own useful work finishes.
   let scalesCompleted=0;
   const scales=await Promise.allSettled(Array.from({length:7},async(_,index)=>{
    const scale=2**(-2.5+index*.5),geometry=proposalDeepMaskWindows(width,height,scale),{rows,cols,windows,ow,oh}=geometry,capacity=Math.min(500,rows*cols);
    // One replaceable Top500 bank per scale, not500 full images per tile.
    // Completed windows are checkpointed in place; an interrupted scale resumes
    // only its missing windows and keeps already consumed native candidates.
    const bank=await memo('scale'+index,async()=>adopt({data:own(Float32Array,capacity*MASK,'proposal-compact-masks'),scores:own(Float32Array,capacity,'proposal-compact-scores'),slots:own(Int32Array,capacity,'proposal-compact-slots'),done:own(Uint8Array,windows.length,'proposal-completed-windows'),count:0,rows,cols,index}));
    for(let tileIndex=0;tileIndex<windows.length;tileIndex++){
     if(bank.done[tileIndex])continue;
     const window=windows[tileIndex],patch=proposalSourcePatch(width,height,ow,oh,window),inputBytes=window.width*window.height*12,sourceBytes=patch.width*patch.height*3;
     const heap=Math.ceil((16*MiB+inputBytes+sourceBytes)/MiB)*MiB,kernel=this.kernel('pyramid/'+index+'/'+heap,operation,{heap,io:sourceBytes+inputBytes});
     let prepared,result,sourceLease;
     try{
      report('selfdm-proposal-preparation',undefined,{scale:index,tile:tileIndex,state:'started'});
      await kernel.run({count:1,pixels:1,key:'selfdm-proposal-pyramid',signal,prepare:async()=>{sourceLease?.release();sourceLease=await sourceRect(patch.x,patch.y,patch.width,patch.height);return {command:'pyramid',source:sourceLease.data,width,height,scale,window,patch,heapBytes:heap,cvURL};},consume:value=>{prepared=allocateOwnedTypedArray(Float32Array,value.data.length,{budget:this.budget,owner:'selfdm-proposal',label:'proposal-scale-input'});prepared.data.set(value.data);prepared.dims=value.shape;},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit the useful Proposal preparation worker.');}});
      sourceLease?.release();sourceLease=null;
      const localRows=Math.ceil(window.height/16)-9,localCols=Math.ceil(window.width/16)-9,slots=localRows*localCols;
      result=await graph('deepmask',{normalizedRgb:{data:prepared.data,dims:prepared.dims}},Math.ceil(inputBytes*40/MiB)*MiB,slots*(MASK+1)*4,{scale:index,tile:tileIndex,window});
      const masks=probability(result.result.mask,[1,slots,112,112],'DeepMask'),scores=probability(result.result.score,[1,1,localRows,localCols],'DeepMask scores'),candidates=[];
      for(let row=0;row<bank.count;row++)candidates.push({score:bank.scores[row],slot:bank.slots[row],kept:row});
      for(let y=window.row0;y<window.row1;y++)for(let x=window.col0;x<window.col1;x++){const local=(y-window.y/16)*localCols+x-window.x/16;candidates.push({score:scores[local],slot:y*cols+x,local});}
      candidates.sort((a,b)=>b.score-a.score||a.slot-b.slot);candidates.length=Math.min(capacity,candidates.length);
      const used=new Set(candidates.filter(value=>value.kept!==undefined).map(value=>value.kept)),free=[];
      for(let row=0;row<capacity;row++)if(!used.has(row))free.push(row);
      for(const candidate of candidates)if(candidate.kept===undefined){const row=free.pop();bank.data.set(masks.subarray(candidate.local*MASK,(candidate.local+1)*MASK),row*MASK);bank.scores[row]=candidate.score;bank.slots[row]=candidate.slot;used.add(row);}
      // Banks fill to capacity on their first sufficiently populated window;
      // before then occupied slots are packed, without duplicating the masks.
      const occupied=[...used].sort((a,b)=>a-b);for(let row=0;row<occupied.length;row++){const old=occupied[row];if(old!==row){bank.data.copyWithin(row*MASK,old*MASK,(old+1)*MASK);bank.scores[row]=bank.scores[old];bank.slots[row]=bank.slots[old];}}
      bank.count=candidates.length;bank.done[tileIndex]=1;bank.metrics=result.metrics;
      report('selfdm-proposal-deepmask-window',undefined,{scale:index,completed:tileIndex+1,total:windows.length});
     }finally{result?.release();prepared?.release();sourceLease?.release();}
    }
    compact[index]=bank;report('selfdm-proposal-scale',.1+.4*(++scalesCompleted)/7,{scale:index});
   }));
   const scaleFailure=scales.find(value=>value.status==='rejected');if(scaleFailure)throw scaleFailure.reason;
   this.trimNeural();
   const selected=await memo('boxes',async()=>{
    const candidates=[];
    for(const scale of compact)for(let row=0;row<scale.count;row++)candidates.push({score:scale.scores[row],scale:scale.index,row,slot:scale.slots[row],data:scale.data.subarray(row*MASK,(row+1)*MASK),cols:scale.cols});
    candidates.sort((a,b)=>b.score-a.score||a.scale-b.scale||a.slot-b.slot);candidates.length=Math.min(500,candidates.length);
    const heap=48*MiB,rectangles=new Array(candidates.length),kernel=this.kernel('projection',operation,{heap});
    await kernel.run({count:candidates.length,pixels:1,key:'selfdm-proposal-projections',signal,prepare:async i=>{const candidate=candidates[i];return {command:'mask-box',width,height,mask:candidate.data.slice(),scale:2**(-2.5+candidate.scale*.5),row:Math.floor(candidate.slot/candidate.cols),col:candidate.slot%candidate.cols,heapBytes:kernel.proposalHeapBytes,cvURL};},consume:(value,index)=>{rectangles[index]=value.found?Array.from(value.box):null;},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit the useful Proposal projection worker.');}});
    const boxes=selectProposalBoxes(rectangles,initial.data,width,height);return adopt({boxes,resize:proposalResize(boxes)});
   });report('selfdm-proposal-boxes',.55,{proposals:selected.boxes.length});
   const [rw,rh]=selected.resize,proposals=[];
   const pointJobs=await Promise.allSettled(Array.from({length:selected.boxes.length>=2?selected.boxes.length:0},async(_,index)=>{
    const roi=await memo('roi'+index,async()=>{
     const box=selected.boxes[index][0],patch={x:box[0],y:box[1],width:box[2]-box[0],height:box[3]-box[1]},sourceBytes=patch.width*patch.height*3,heap=proposalSeedsBytes(rw,rh,sourceBytes);
     let roi,sourceLease;const kernel=this.kernel('roi/'+index,operation,{heap,io:sourceBytes+rw*rh*8});
     try{await kernel.run({count:1,pixels:1,key:'selfdm-proposal-roi',signal,prepare:async()=>{sourceLease?.release();sourceLease=await sourceRect(patch.x,patch.y,patch.width,patch.height);return {command:'roi',source:sourceLease.data,width,height,box,patch,resize:selected.resize,heapBytes:heap,cvURL};},consume:value=>{const gray=own(Float32Array,value.gray.length,'proposal-gray'),labels=own(Int32Array,value.labels.length,'proposal-labels');gray.set(value.gray);labels.set(value.labels);roi={gray,labels,labelCount:value.labelCount};},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit the useful Proposal region worker.');}});}finally{sourceLease?.release();}
     return adopt(roi);
    });
    const point=await memo('point'+index,async()=>{
     let result;try{result=await runProposalPointWindows({gray:roi.gray,width:rw,height:rh,budget:this.budget,cacheKey:this.prefix+key+'/point-dense'+index,runGraph:(...args)=>graph(...args),maxWorkers:this.profile.maxWorkers,signal,onProgress:event=>hooks.onProgress?.({...event,proposal:index}),publishCheckpoint:()=>!this.disposed});
      const {keypoints,scores,descriptors}=result.result,count=scores?.data?.length;
      requireValue(Number.isInteger(count)&&count<=2048&&keypoints.data instanceof Float32Array&&scores.data instanceof Float32Array&&descriptors.data instanceof Float32Array&&keypoints.data.length===count*2&&descriptors.data.length===count*256&&JSON.stringify(keypoints.dims)===JSON.stringify([1,count,2])&&JSON.stringify(scores.dims)===JSON.stringify([1,count])&&JSON.stringify(descriptors.dims)===JSON.stringify([1,256,count]),'SuperPoint output geometry');
      requireValue(keypoints.data.every(Number.isFinite)&&scores.data.every(Number.isFinite)&&descriptors.data.every(Number.isFinite),'SuperPoint finite output');
      for(let i=0;i<count;i++)requireValue(keypoints.data[i*2]>=0&&keypoints.data[i*2]<rw&&keypoints.data[i*2+1]>=0&&keypoints.data[i*2+1]<rh,'SuperPoint coordinates outside proposal');
      scratch.push(result.release);result=null;return adopt({keypoints:keypoints.data,scores:scores.data,descriptors:descriptors.data,count});
     }finally{result?.release();}
    });proposals[index]={...roi,...point};
   }));const pointFailure=pointJobs.find(value=>value.status==='rejected');if(pointFailure)throw pointFailure.reason;
   const fused=await memo('fused',async()=>{
    if(selected.boxes.length<2){const data=own(Float32Array,PLANE,'proposal-initial-fallback');data.set(initial.data);return adopt({data,matchedPoints:0,fellBackToInitial:true});}
    const paints=proposals.map(value=>{admit(value.labels.byteLength*3+value.labels.length*8+value.labelCount*8);return createFirstMatchPaint(value.labels.slice(),value.labelCount);}),matchedPoints=[];
    for(let i=0;i<proposals.length;i++)for(let j=i+1;j<proposals.length;j++){
     const a=proposals[i],b=proposals[j];if(!a.count||!b.count)continue;
     let result;try{result=await graph('superglue',{image0:{data:a.gray,dims:[1,1,rh,rw]},image1:{data:b.gray,dims:[1,1,rh,rw]},keypoints0:{data:a.keypoints,dims:[1,a.count,2]},keypoints1:{data:b.keypoints,dims:[1,b.count,2]},scores0:{data:a.scores,dims:[1,a.count]},scores1:{data:b.scores,dims:[1,b.count]},descriptors0:{data:a.descriptors,dims:[1,256,a.count]},descriptors1:{data:b.descriptors,dims:[1,256,b.count]}},Math.max(192*MiB,Math.ceil((a.count*a.count+b.count*b.count+a.count*b.count)*24/MiB)*MiB),(a.count+b.count)*12);
      const out=result.result;
      for(const side of [0,1]){const count=side?b.count:a.count,other=side?a.count:b.count,m=out['matches'+side],s=out['matching_scores'+side];requireValue(m?.data instanceof BigInt64Array&&s?.data instanceof Float32Array&&m.data.length===count&&s.data.length===count&&JSON.stringify(m.dims)===JSON.stringify([1,count])&&JSON.stringify(s.dims)===JSON.stringify([1,count])&&s.data.every(value=>Number.isFinite(value)&&value>=0&&value<=1.00001)&&m.data.every(value=>value>=-1n&&value<BigInt(other)),'SuperGlue output contract');}
      const points0=paintMatchedPoints(paints[i],a.keypoints,out.matches0.data,out.matching_scores0.data,rw),points1=paintMatchedPoints(paints[j],b.keypoints,out.matches1.data,out.matching_scores1.data,rw);
      if(points1.length){admit((points0.length+points1.length)*64);matchedPoints.push(...points0.map(point=>sourceMatchedPoint(point,selected.boxes[i][0],rw,rh)),...points1.map(point=>sourceMatchedPoint(point,selected.boxes[j][0],rw,rh)));}
     }finally{result?.release();}
    }
    const resized=new Array(proposals.length),heap=Math.ceil((16*MiB+rw*rh*4+PLANE*4)/MiB)*MiB,kernel=this.kernel('fusion-resize',operation,{heap,io:rw*rh*4+PLANE*4}),painted=paints.map((value,index)=>value.painted?index:null).filter(index=>index!==null);
    if(painted.length)await kernel.run({count:painted.length,pixels:1,key:'selfdm-proposal-fusion-resize',signal,prepare:async slot=>{const i=painted[slot];return {command:'resize',width,height,map:new Float32Array(paints[i].scores),resize:selected.resize,target:[selected.boxes[i][0][2]-selected.boxes[i][0][0],selected.boxes[i][0][3]-selected.boxes[i][0][1]],heapBytes:heap,cvURL};},consume:(value,slot)=>{const index=painted[slot];resized[index]=own(Float32Array,value.data.length,'proposal-resized-score');resized[index].set(value.data);},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit Proposal fusion resize.');}});
    admit(PLANE*9);const fusion=fuseProposalScores(selected.boxes,resized,initial.data,width,height,matchedPoints),data=own(Float32Array,PLANE,'proposal-fused-probability');data.set(fusion.score);
    return adopt({data,matchedPoints:matchedPoints.length,fellBackToInitial:fusion.fellBackToInitial});
   });report('selfdm-proposal-fused',.9,{matchedPoints:fused.matchedPoints,fellBackToInitial:fused.fellBackToInitial});this.trimNeural();
   // One scientific final grid; per-window graph scratch is bounded and retired
   // immediately. A published central window is never recomputed on retry.
   const windows=proposalCRFWindows(width,height);
   crfRecord=this.budget.get(crfKey);
   if(crfRecord){this.budget.take(crfKey);crfReservation=this.budget.reserve(crfRecord.byteLength);records.push({stage:'crf-state',provider:'wasm',inferenceExecutions:0,preflightExecutions:0,cacheHit:true});}
   else{
    const byteLength=PLANE*4+windows.length+256;crfReservation=this.budget.reserve(byteLength);
    try{const value={data:allocateTypedArray(Float32Array,PLANE,{label:'proposal-crf-checkpoint'}),done:allocateTypedArray(Uint8Array,windows.length,{label:'proposal-crf-completed-windows'})},pin=registerArrayViews(this.budget,value,{owner:'selfdm-proposal',label:'proposal-crf-checkpoint'});crfRecord={value,byteLength,onEvict(){pin();}};}
    catch(error){crfReservation();crfReservation=null;throw error;}
   }
   const crfState=crfRecord.value;
   let next=0;
   const crfJobs=await Promise.allSettled(Array.from({length:Math.min(windows.length,this.profile.maxWorkers)},async()=>{
    while(next<windows.length){const index=next++,w=windows[index];if(crfState.done[index])continue;const n=w.width*w.height;
     let pixels,unary,image,result;
     try{
      pixels=await sourceRect(w.sx,w.sy,w.width,w.height);unary=allocateOwnedTypedArray(Float32Array,n*2,{budget:this.budget,owner:'selfdm-proposal',label:'proposal-crf-unary'});image=allocateOwnedTypedArray(Float32Array,n*3,{budget:this.budget,owner:'selfdm-proposal',label:'proposal-crf-image'});
      for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++){const i=y*w.width+x,p=fused.data[(w.sy+y)*width+w.sx+x];unary.data[n+i]=p;unary.data[i]=Math.fround(1-p);image.data[i]=pixels.data[i*3+2];image.data[n+i]=pixels.data[i*3+1];image.data[n*2+i]=pixels.data[i*3];}
      pixels.release();pixels=null;
      result=await graph('crf',{unary:{data:unary.data,dims:[1,2,w.height,w.width]},image:{data:image.data,dims:[1,3,w.height,w.width]},origin:{data:Float32Array.from([w.sy,w.sx]),dims:[2]}},Math.ceil((32*MiB+n*512)/MiB)*MiB,n*4,{tile:index,window:w});
      const raw=probability(result.result.probability,[1,w.height,w.width],'ConvCRF');
      for(let y=w.y;y<w.y1;y++)crfState.data.set(raw.subarray((y-w.sy)*w.width+w.x-w.sx,(y-w.sy)*w.width+w.x1-w.sx),y*width+w.x);
      crfState.done[index]=1;report('selfdm-proposal-crf-window',.9+.1*crfState.done.reduce((sum,value)=>sum+value,0)/windows.length,{tile:index,total:windows.length});
     }finally{result?.release();pixels?.release();unary?.release();image?.release();}
    }
   }));const crfFailure=crfJobs.find(value=>value.status==='rejected');if(crfFailure)throw crfFailure.reason;
   // Transfer the completed cache grid into the returned output lease, without
   // duplicating its buffer. The cache keeps a shared backing pin for resumes.
   const outputReservation=crfReservation.split(PLANE*4),outputPin=registerArrayViews(this.budget,{raw:crfState.data},{owner:'selfdm-proposal',label:'proposal-result'});let released=false;
   const raw=crfState.data,release=()=>{if(!released){released=true;outputPin();outputReservation();}};finalResult={release};
   const providers=[...new Set(records.filter(value=>value.inferenceExecutions).map(value=>value.provider))];
   const metrics={provider:providers.includes('webgpu')?'hybrid-webgpu-wasm':'wasm',preflightExecutions:0,inferenceExecutions:records.reduce((sum,item)=>sum+item.inferenceExecutions,0),cacheHits:records.filter(item=>item.cacheHit).length,heapBytes:Math.max(0,...records.map(item=>item.heapBytes??0)),memoryMaximumBytes:Math.max(0,...records.map(item=>item.memoryMaximumBytes??0)),stages:records,pool:this.pool.snapshot(),cv:Object.fromEntries([...this.cvPools].map(([name,pool])=>[name,pool.metrics()]))};
   const timings=Object.fromEntries(['modelLoadMs','inferenceMs','outputCopyMs'].map(name=>[name,records.reduce((sum,item)=>sum+(item.timings?.[name]??0),0)]));
   report('complete',1,{proposals:selected.boxes.length,matchedPoints:fused.matchedPoints});finalResult=null;completedResult=true;return {width,height,raw,heapBytes:metrics.heapBytes,metrics,timings,metadata:{algorithm:'SelfDM + Proposal SuperGlue',...SELFDM_PROPOSAL_REFERENCE,sourceDimensions:[width,height],proposals:selected.boxes,resize:selected.resize,matchedPoints:fused.matchedPoints,fellBackToInitial:fused.fellBackToInitial,inputColorOrder:'BGR initial map/CRF; RGB DeepMask; upstream RGB passed to BGR2GRAY/SEEDS',coordinateFrame:'input-rectangle-pixels',sourceCoordinates:true},release};
  }finally{
   finalResult?.release();for(const release of scratch.reverse())release();crfReservation?.();cached.finish({publish:!this.disposed});if(crfRecord){if(completedResult||this.disposed)crfRecord.onEvict();else this.budget.put(crfKey,crfRecord);}operation?.release();this.running=false;finish();
  }
 }
}
