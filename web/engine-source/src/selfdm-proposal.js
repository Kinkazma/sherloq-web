import {EngineError,requireValue,checkAbort} from './errors.js';
import {NeuralGraphPool} from './neural-graph-pool.js';
import {WaveletStripPool} from './wavelet-strip-pool.js';
import {createSelfDMPrepare} from './selfdm-prepare.js';
import {validateRgbRows} from './rgb-row-source.js';
import {allocateOwnedTypedArray,registerArrayViews} from './allocation.js';
import {sparseStageCache} from './sparse-stage-cache.js';
import {SELFDM_PROPOSAL_REFERENCE,SELFDM_PROPOSAL_CV,verifySelfDMProposalModels,selfDMProposalRuntimes} from './selfdm-proposal-assets.js';
import {selectProposalBoxes,proposalResize,createFirstMatchPaint,paintMatchedPoints,sourceMatchedPoint,fuseProposalScores} from './selfdm-proposal-process.js';

const MiB=1024**2,SIDE=512,PLANE=SIDE**2,MASK=112**2;
let nextId=0;
function bytes(value,seen=new Set()){
 if(ArrayBuffer.isView(value)){if(seen.has(value.buffer))return 0;seen.add(value.buffer);return value.buffer.byteLength;}
 if(typeof value==='string')return value.length*2;if(!value||typeof value!=='object')return 8;
 return Object.values(value).reduce((sum,item)=>sum+bytes(item,seen)+24,64);
}
function tensors(value){return Object.fromEntries(Object.entries(value).filter(([,item])=>ArrayBuffer.isView(item)));}
function probability(output,dims,label){requireValue(output?.data instanceof Float32Array&&JSON.stringify(output.dims)===JSON.stringify(dims)&&output.data.every(value=>Number.isFinite(value)&&value>=0&&value<=1.00001),label+' probability contract');return output.data;}
function pins(budget,value){return registerArrayViews(budget,tensors(value),{owner:'selfdm-proposal',label:'selfdm-proposal-checkpoint'});}

/** Complete pinned512px SelfDM+DeepMask+Proposal SuperGlue+SEEDS+ConvCRF.
 * Learned jobs share one ORT pool/global CPU broker and reuse idle runtimes.
 * Source CV work uses the same broker through persistent strip workers. Every
 * scientific checkpoint is compact, budgeted and evictable between analyses.
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
 kernel(kind,operation){
  let pool=this.cvPools.get(kind);if(pool){pool.resourceOperation=operation;return pool;}
  const settings=kind.startsWith('pyramid')?{heap:16,io:24}:kind.startsWith('roi')?{heap:96,io:12}:{heap:32,io:8};
  const url=new URL('./selfdm-proposal-worker.js',import.meta.url);
  pool=this.stripPoolFactory(this.budget,{resourceOwner:'selfdm-proposal',resourceOperation:operation,maxWorkers:this.profile.maxWorkers,workerHeapBytes:settings.heap*MiB,workerPixelBytes:settings.io*MiB,workerURL:url,
   workerFactory:()=>this.workerFactory?this.workerFactory(url):new Worker(url,{type:'module'})});
  pool.proposalHeapBytes=settings.heap*MiB;this.cvPools.set(kind,pool);return pool;
 }
 async analyze(params={},hooks={}){
  requireValue(!this.running&&!this.disposed,'SelfDM Proposal engine busy or disposed');
  if(this.image.width!==SIDE||this.image.height!==SIDE)throw new EngineError('METHOD_DIMENSIONS_UNQUALIFIED','SelfDM + Proposal SuperGlue is currently qualified for512×512 source pixels.',{details:{method:'selfdm-proposal',requiredWidth:SIDE,requiredHeight:SIDE,width:this.image.width,height:this.image.height,automaticDownscale:false,initialMapSubstitution:false}});
  requireValue(['auto','cpu'].includes(hooks.backend??'auto'),'SelfDM Proposal complete chain is qualified on CPU');
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
  const graph=async(name,inputs,workspaceBytes,outputBytes)=>{
   const value=await this.pool.run(name,inputs,{signal,backend:'cpu',workspaceBytes,outputBytes,resourceOperation:operation,onProgress:event=>hooks.onProgress?.({...event,stage:name})});
   records.push({stage:name,...value.metrics,timings:value.timings,heapBytes:value.heapBytes,inferenceExecutions:1,cacheHit:false});return value;
  };
  const memo=async(name,compute)=>{
   const value=await cached.memo(name,compute);
   if(hits[name]===true){records.push({stage:name,provider:'wasm',inferenceExecutions:0,preflightExecutions:0,cacheHit:true,sourceMetrics:value.metrics});report('selfdm-proposal-cache',undefined,{stage:name});}
   return value;
  };
  let sourceWindow,source,finalResult;
  try{
   checkAbort(signal);
   if(this.image.data){requireValue(this.image.data.length===PLANE*3,'Source RGB geometry');source=this.image.data;}
   else{sourceWindow=await this.image.readRows(0,SIDE,{signal});source=validateRgbRows(sourceWindow,SIDE,SIDE);}
   const initial=await memo('initial',async()=>{
    const prepare=createSelfDMPrepare({budget:this.budget});let prepared,result;
    try{prepared=await prepare.run({width:SIDE,height:SIDE,data:source,side:SIDE},{signal});result=await graph('selfdm',{rgb:{data:prepared.tensor,dims:prepared.shape}},320*MiB,PLANE*4);
     const raw=probability(result.result.probability,[1,1,SIDE,SIDE],'SelfDM');scratch.push(result.release);result=null;return adopt({data:raw});
    }finally{result?.release();prepared?.release();prepare.dispose();}
   });report('selfdm-proposal-initial',.1);
   const compact=[];
   // Independent scales may overlap under the common RAM/CPU admissions.
   // Await every active sibling even after a failure: its input lease and
   // completed checkpoint must survive until its own useful work finishes.
   let scalesCompleted=0;
   const scales=await Promise.allSettled(Array.from({length:7},async(_,index)=>{
    compact[index]=await memo('scale'+index,async()=>{
     let prepared;
     const kernel=this.kernel('pyramid/'+index,operation);
     report('selfdm-proposal-preparation',undefined,{scale:index,state:'started'});
     await kernel.run({count:1,pixels:1,key:'selfdm-proposal-pyramid',signal,prepare:async()=>({command:'pyramid',source:source.slice(),width:SIDE,height:SIDE,scale:2**(-2.5+index*.5)}),consume:value=>{const data=own(Float32Array,value.data.length,'proposal-scale-input');data.set(value.data);prepared={data,dims:value.shape};},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit the useful Proposal preparation worker.');}});
     report('selfdm-proposal-preparation',undefined,{scale:index,state:'done'});
     const [,,height,width]=prepared.dims,rows=Math.ceil(height/16)-9,cols=Math.ceil(width/16)-9,slots=rows*cols;
     let result;
     try{result=await graph('deepmask',{normalizedRgb:prepared},Math.ceil(height*width*3*4*40/MiB)*MiB,slots*(MASK+1)*4);
      const masks=probability(result.result.mask,[1,slots,112,112],'DeepMask'),scores=probability(result.result.score,[1,1,rows,cols],'DeepMask scores');
      const indices=Array.from({length:slots},(_,i)=>i).sort((a,b)=>scores[b]-scores[a]||a-b).slice(0,Math.min(500,slots));
      const data=own(Float32Array,indices.length*MASK,'proposal-compact-masks'),keptScores=own(Float32Array,indices.length,'proposal-compact-scores'),keptSlots=own(Int32Array,indices.length,'proposal-compact-slots');
      indices.forEach((slot,row)=>{data.set(masks.subarray(slot*MASK,(slot+1)*MASK),row*MASK);keptScores[row]=scores[slot];keptSlots[row]=slot;});
      return adopt({data,scores:keptScores,slots:keptSlots,rows,cols,index,metrics:result.metrics});
     }finally{result?.release();}
    });report('selfdm-proposal-scale',.1+.4*(++scalesCompleted)/7,{scale:index});
   }));
   const scaleFailure=scales.find(value=>value.status==='rejected');if(scaleFailure)throw scaleFailure.reason;
   this.trimNeural();
   const selected=await memo('boxes',async()=>{
    const candidates=[];
    for(const scale of compact)for(let row=0;row<scale.slots.length;row++)candidates.push({score:scale.scores[row],scale:scale.index,row,slot:scale.slots[row],data:scale.data.subarray(row*MASK,(row+1)*MASK),cols:scale.cols});
    candidates.sort((a,b)=>b.score-a.score||a.scale-b.scale||a.slot-b.slot);candidates.length=Math.min(500,candidates.length);
    const rectangles=new Array(candidates.length),kernel=this.kernel('projection',operation);
    await kernel.run({count:candidates.length,pixels:1,key:'selfdm-proposal-projections',signal,prepare:async i=>{const candidate=candidates[i];return {command:'mask-box',width:SIDE,height:SIDE,mask:candidate.data.slice(),scale:2**(-2.5+candidate.scale*.5),row:Math.floor(candidate.slot/candidate.cols),col:candidate.slot%candidate.cols,heapBytes:kernel.proposalHeapBytes,cvURL};},consume:(value,index)=>{rectangles[index]=value.found?Array.from(value.box):null;},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit the useful Proposal projection worker.');}});
    const boxes=selectProposalBoxes(rectangles,initial.data,SIDE,SIDE);return adopt({boxes,resize:proposalResize(boxes)});
   });report('selfdm-proposal-boxes',.55,{proposals:selected.boxes.length});
   const [rw,rh]=selected.resize,proposals=[];
   const pointJobs=await Promise.allSettled(Array.from({length:selected.boxes.length>=2?selected.boxes.length:0},async(_,index)=>{
    proposals[index]=await memo('point'+index,async()=>{
     let roi;const kernel=this.kernel('roi/'+index,operation);
     await kernel.run({count:1,pixels:1,key:'selfdm-proposal-roi',signal,prepare:async()=>({command:'roi',source:source.slice(),width:SIDE,height:SIDE,box:selected.boxes[index][0],resize:selected.resize,heapBytes:kernel.proposalHeapBytes,cvURL}),consume:value=>{const gray=own(Float32Array,value.gray.length,'proposal-gray'),labels=own(Int32Array,value.labels.length,'proposal-labels');gray.set(value.gray);labels.set(value.labels);roi={gray,labels,labelCount:value.labelCount};},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit the useful Proposal region worker.');}});
     let result;try{result=await graph('superpoint',{image:{data:roi.gray,dims:[1,1,rh,rw]}},192*MiB,(2048*(2+1+256))*4);
      const {keypoints,scores,descriptors}=result.result,count=scores?.data?.length;
      requireValue(Number.isInteger(count)&&count<=2048&&keypoints.data instanceof Float32Array&&scores.data instanceof Float32Array&&descriptors.data instanceof Float32Array&&keypoints.data.length===count*2&&descriptors.data.length===count*256&&JSON.stringify(keypoints.dims)===JSON.stringify([1,count,2])&&JSON.stringify(scores.dims)===JSON.stringify([1,count])&&JSON.stringify(descriptors.dims)===JSON.stringify([1,256,count]),'SuperPoint output geometry');
      requireValue(keypoints.data.every(Number.isFinite)&&scores.data.every(Number.isFinite)&&descriptors.data.every(Number.isFinite),'SuperPoint finite output');
      for(let i=0;i<count;i++)requireValue(keypoints.data[i*2]>=0&&keypoints.data[i*2]<rw&&keypoints.data[i*2+1]>=0&&keypoints.data[i*2+1]<rh,'SuperPoint coordinates outside proposal');
      scratch.push(result.release);result=null;return adopt({...roi,keypoints:keypoints.data,scores:scores.data,descriptors:descriptors.data,count});
     }finally{result?.release();}
    });
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
    const resized=new Array(proposals.length),kernel=this.kernel('projection',operation),painted=paints.map((value,index)=>value.painted?index:null).filter(index=>index!==null);
    if(painted.length)await kernel.run({count:painted.length,pixels:1,key:'selfdm-proposal-fusion-resize',signal,prepare:async slot=>{const i=painted[slot];return {command:'resize',width:SIDE,height:SIDE,map:new Float32Array(paints[i].scores),resize:selected.resize,target:[selected.boxes[i][0][2]-selected.boxes[i][0][0],selected.boxes[i][0][3]-selected.boxes[i][0][1]],heapBytes:kernel.proposalHeapBytes,cvURL};},consume:(value,slot)=>{const index=painted[slot];resized[index]=own(Float32Array,value.data.length,'proposal-resized-score');resized[index].set(value.data);},local:()=>{throw new EngineError('MEMORY_LIMIT','Shared memory cannot admit Proposal fusion resize.');}});
    admit(PLANE*9);const fusion=fuseProposalScores(selected.boxes,resized,initial.data,SIDE,SIDE,matchedPoints),data=own(Float32Array,PLANE,'proposal-fused-probability');data.set(fusion.score);
    return adopt({data,matchedPoints:matchedPoints.length,fellBackToInitial:fusion.fellBackToInitial});
   });report('selfdm-proposal-fused',.9,{matchedPoints:fused.matchedPoints,fellBackToInitial:fused.fellBackToInitial});this.trimNeural();
   const unary=own(Float32Array,PLANE*2,'proposal-crf-unary'),image=own(Float32Array,PLANE*3,'proposal-crf-image');
   for(let i=0;i<PLANE;i++){unary[PLANE+i]=fused.data[i];unary[i]=Math.fround(1-fused.data[i]);image[i]=source[i*3+2];image[PLANE+i]=source[i*3+1];image[PLANE*2+i]=source[i*3];}
   finalResult=await graph('crf',{unary:{data:unary,dims:[1,2,SIDE,SIDE]},image:{data:image,dims:[1,3,SIDE,SIDE]}},96*MiB,PLANE*4);
   const raw=probability(finalResult.result.probability,[1,SIDE,SIDE],'ConvCRF'),release=finalResult.release;
   const metrics={provider:'wasm',preflightExecutions:0,inferenceExecutions:records.reduce((sum,item)=>sum+item.inferenceExecutions,0),cacheHits:records.filter(item=>item.cacheHit).length,heapBytes:Math.max(0,...records.map(item=>item.heapBytes??0)),memoryMaximumBytes:Math.max(0,...records.map(item=>item.memoryMaximumBytes??0)),stages:records,pool:this.pool.snapshot(),cv:Object.fromEntries([...this.cvPools].map(([name,pool])=>[name,pool.metrics()]))};
   const timings=Object.fromEntries(['modelLoadMs','inferenceMs','outputCopyMs'].map(name=>[name,records.reduce((sum,item)=>sum+(item.timings?.[name]??0),0)]));
   report('complete',1,{proposals:selected.boxes.length,matchedPoints:fused.matchedPoints});finalResult=null;return {width:SIDE,height:SIDE,raw,heapBytes:metrics.heapBytes,metrics,timings,metadata:{algorithm:'SelfDM + Proposal SuperGlue',...SELFDM_PROPOSAL_REFERENCE,proposals:selected.boxes,resize:selected.resize,matchedPoints:fused.matchedPoints,fellBackToInitial:fused.fellBackToInitial,inputColorOrder:'BGR initial map; RGB DeepMask; upstream RGB passed to BGR2GRAY/SEEDS',coordinateFrame:'input-rectangle-pixels',sourceCoordinates:true},release};
  }finally{
   finalResult?.release();sourceWindow?.release();for(const release of scratch.reverse())release();cached.finish({publish:!this.disposed});operation?.release();this.running=false;finish();
  }
 }
}
