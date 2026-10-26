import {requireValue,checkAbort} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {proposalPointWindows} from './selfdm-proposal-point-window.js';
import {mapSelfDMProposalPointCoordinates} from './selfdm-proposal-point-coordinates.js';

const MiB=1024**2,roundMiB=value=>Math.ceil(value/MiB)*MiB,tensor=(data,dims,type='float32')=>({data,dims,type});
export const SELFDM_PROPOSAL_CONTEXT_POINTS='selfdm-proposal-native-owner-dense-and-common-point-post/1';

// This stage owns only its native outputs and admitted copies. Gray/source,
// upstream dense owners and the native graph pool belong to the product parent.
// Native output retirement must ACK before any of its prepared inputs disappear.
function stageOwner(budget,signal,onOwner){
 const controller=new AbortController(),joined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
 const children=new Set(),arrays=new Set(),credits=[];let done,closed=false,closing;
 const completed=new Promise(resolve=>done=resolve);
 const owner={policy:SELFDM_PROPOSAL_CONTEXT_POINTS,raw:null,result:null,
  state:()=>({closed,retiring:!!closing,children:children.size,arrays:arrays.size}),
  release(){controller.abort();if(closed)return Promise.resolve();if(closing)return closing;closing=(async()=>{
   await completed;
   for(const child of [...children].reverse()){await child.release();children.delete(child)}
   for(const array of [...arrays].reverse()){await array.release();arrays.delete(array)}
   while(credits.length){await credits.at(-1)();credits.pop()}
   owner.raw=null;owner.result=null;closed=true;
  })().finally(()=>{closing=null});return closing;}};
 const own=value=>{requireValue(value&&typeof value.release==='function','Native Proposal point owner required');children.add(value);return value};
 const retire=async value=>{if(value&&children.has(value)){await value.release();children.delete(value)}};
 const array=(Type,length,label)=>{const value=allocateOwnedTypedArray(Type,length,{budget,owner:'selfdm-proposal',label});arrays.add(value);return value.data};
 const metadata=bytes=>{credits.push(budget.reserve(bytes))};
 return{owner,joined,own,retire,array,metadata,done,publish(){onOwner?.(owner);checkAbort(joined)}};
}

// The central windows, stride8/halo48 and copies below are the existing native
// runProposalPointWindows dense pass, separated only before its original post.
function copyDense(result,state,geometry,w){
 const {dense_scores:scores,dense_descriptors:descriptors}=result,cols=Math.floor(w.width/8),rows=Math.floor(w.height/8),dw=cols*8,dh=rows*8;
 requireValue(scores?.data instanceof Float32Array&&descriptors?.data instanceof Float32Array&&JSON.stringify(scores.dims)===JSON.stringify([1,1,dh,dw])&&JSON.stringify(descriptors.dims)===JSON.stringify([1,256,rows,cols]),'SuperPoint dense output geometry');
 requireValue(scores.data.every(value=>Number.isFinite(value)&&value>=0&&value<=1.00001)&&descriptors.data.every(Number.isFinite),'SuperPoint dense output values');
 const ox=w.sx/8,oy=w.sy/8;
 for(let y=w.y*8;y<w.y1*8;y++)state.scores.set(scores.data.subarray((y-oy*8)*dw+(w.x-ox)*8,(y-oy*8)*dw+(w.x1-ox)*8),y*geometry.denseWidth+w.x*8);
 const srcPlane=rows*cols,dstPlane=geometry.rows*geometry.cols;
 for(let c=0;c<256;c++)for(let y=w.y;y<w.y1;y++)state.descriptors.set(descriptors.data.subarray(c*srcPlane+(y-oy)*cols+w.x-ox,c*srcPlane+(y-oy)*cols+w.x1-ox),c*dstPlane+y*geometry.cols+w.x);
}

/** One literal gray owner's existing dense CNN. No post, per-owner TopK,
 * descriptor normalization or cross-owner raster is constructed here. */
export async function runSelfDMProposalOwnerDense({gray,width,height,backend='auto'},{budget,profile,runGraph,signal,onOwner,onProgress,resourceOperation}={}){
 requireValue(gray instanceof Float32Array&&gray.length===width*height&&gray.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&budget?.reserve&&Number.isSafeInteger(profile?.maxWorkers)&&profile.maxWorkers>0&&typeof runGraph==='function'&&['auto','cpu','webgpu'].includes(backend),'Native literal gray owner, budget/profile and graph pool required');
 const s=stageOwner(budget,signal,onOwner),{owner,joined}=s;let failed=false,failure,next=0;const pairs=new Set(),receipts=[];
 const retirePair=async pair=>{await s.retire(pair.result);pair.result=null;await s.retire(pair.input);pair.input=null;pairs.delete(pair)};
 try{
  s.publish();const geometry=proposalPointWindows(width,height);s.metadata(65536+geometry.windows.length*2048);
  const scores=s.array(Float32Array,geometry.denseWidth*geometry.denseHeight,'proposal-owner-dense-scores'),descriptors=s.array(Float32Array,geometry.cols*geometry.rows*256,'proposal-owner-dense-descriptors');
  const state={scores,descriptors};
  const workers=Array.from({length:Math.min(geometry.windows.length,profile.maxWorkers)},async()=>{
   while(next<geometry.windows.length&&!failed){
    const index=next++,w=geometry.windows[index],pair={input:null,result:null};pairs.add(pair);
    try{
     checkAbort(joined);pair.input=s.own(allocateOwnedTypedArray(Float32Array,w.width*w.height,{budget,owner:'selfdm-proposal',label:'proposal-owner-point-window-input'}));
     for(let y=0;y<w.height;y++)pair.input.data.set(gray.subarray((w.sy+y)*width+w.sx,(w.sy+y)*width+w.sx+w.width),y*w.width);
     const area=w.width*w.height,cols=Math.floor(w.width/8),rows=Math.floor(w.height/8),outputBytes=(cols*rows*256+cols*rows*64)*4;
     pair.result=s.own(await runGraph('superpoint',{image:tensor(pair.input.data,[1,1,w.height,w.width])},{signal:joined,backend,workspaceBytes:roundMiB(Math.max(32*MiB,area*64*4*3)),outputBytes,gpuWasmWorkspaceBytes:128*MiB,resourceOperation}));
     checkAbort(joined);copyDense(pair.result.result,state,geometry,w);
     receipts.push({tile:index,window:{...w},metrics:pair.result.metrics,timings:pair.result.timings,heapBytes:pair.result.heapBytes,...(pair.result.qualificationGpu?{qualificationGpu:pair.result.qualificationGpu}:{})});
     await retirePair(pair);onProgress?.({phase:'selfdm-proposal-point-owner-window',tile:index,total:geometry.windows.length,completed:receipts.length});
    }catch(primary){if(!failed){failed=true;failure=primary}throw primary}
   }
  });
  await Promise.allSettled(workers);if(failed)throw failure;checkAbort(joined);
  requireValue(!pairs.size&&receipts.length===geometry.windows.length,'Native Proposal dense owner has unfinished windows');
  owner.raw={scores,descriptors,geometry:{width,height,...geometry},receipts,metadata:{policy:SELFDM_PROPOSAL_CONTEXT_POINTS,stage:'native-dense-owner',width,height,backendRequested:backend,maximumCores:profile.maxWorkers,actualNativePipelines:receipts.length,nativeStride:8,nativeHalo:48,centralCells:32,postExecuted:false}};
  s.done();return owner;
 }catch(primary){s.done();await retireCompositeOwners([()=>owner.release()],{primary});throw primary}
 finally{s.done()}
}

/** Received native per-owner NMS/border4, ONE shared Top2048, then the native
 * local descriptor sampler. Presence is an explicit precomputed candidate
 * support with its durable identity; this function never invents membership.
 * Dense fields/presence and their owners remain borrowed until this owner ACKs. */
export async function runSelfDMProposalCommonPoints({owners,proposalBounds,proposalSize,backend='auto'},{budget,profile,runGraph,signal,onOwner,resourceOperation}={}){
 const rect=v=>Array.isArray(v)&&v.length===4&&v.every(Number.isSafeInteger)&&v[2]>v[0]&&v[3]>v[1],size=v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isSafeInteger(n)&&n>0);
 requireValue(rect(proposalBounds)&&size(proposalSize)&&Array.isArray(owners)&&owners.length>0&&budget?.reserve&&Number.isSafeInteger(profile?.maxWorkers)&&profile.maxWorkers>0&&typeof runGraph==='function'&&['auto','cpu','webgpu'].includes(backend),'Native Proposal dense owners and common post pool required');
 const s=stageOwner(budget,signal,onOwner),{owner,joined}=s,records=[],receipts=[];
 const graph=async(name,inputs,outputBytes,options)=>{
  checkAbort(joined);const value=s.own(await runGraph(name,inputs,{signal:joined,backend,workspaceBytes:options.workspace,gpuWasmWorkspaceBytes:options.gpuWasmWorkspaceBytes,outputBytes,resourceOperation}));checkAbort(joined);
  receipts.push({stage:name,metrics:value.metrics,timings:value.timings,heapBytes:value.heapBytes,...(value.qualificationGpu?{qualificationGpu:value.qualificationGpu}:{})});return value;
 };
 try{
  s.publish();s.metadata(65536+owners.length*4096);
  let scoreLength=0,descriptorLength=0;
  for(const o of owners){const g=o.dense?.geometry;requireValue(g&&Number.isSafeInteger(g.cols)&&g.cols>0&&Number.isSafeInteger(g.rows)&&g.rows>0&&g.denseWidth===g.cols*8&&g.denseHeight===g.rows*8&&o.dense.scores instanceof Float32Array&&o.dense.scores.length===g.denseWidth*g.denseHeight&&o.dense.descriptors instanceof Float32Array&&o.dense.descriptors.length===g.cols*g.rows*256&&o.presence instanceof Uint8Array&&o.presence.length===o.dense.scores.length&&o.presence.every(v=>v===0||v===1)&&typeof o.presenceIdentity==='string'&&o.presenceIdentity.length>0&&rect(o.bounds)&&o.bounds[0]>=proposalBounds[0]&&o.bounds[1]>=proposalBounds[1]&&o.bounds[2]<=proposalBounds[2]&&o.bounds[3]<=proposalBounds[3]&&size(o.size)&&o.size[0]===g.width&&o.size[1]===g.height,'Exact native dense owner geometry and identified candidate support required');scoreLength+=o.dense.scores.length;descriptorLength+=o.dense.descriptors.length;}
  const denseBytes=(scoreLength+descriptorLength)*4;requireValue(Number.isSafeInteger(denseBytes),'Proposal point common post extent overflow');
  const options={workspace:roundMiB(32*MiB+scoreLength*4*12+descriptorLength*4*2),gpuWasmWorkspaceBytes:roundMiB(Math.max(128*MiB,denseBytes*2+64*MiB))};
  let count=0;
  for(let index=0;index<owners.length;index++){
   const o=owners[index],g=o.dense.geometry,shape=s.array(BigInt64Array,4,'proposal-owner-descriptor-shape');shape.set([1n,256n,BigInt(g.rows),BigInt(g.cols)]);
   const nms=await graph('proposal-point-owner-nms',{dense_scores:tensor(o.dense.scores,[1,1,g.denseHeight,g.denseWidth]),candidate_presence:tensor(o.presence,[1,1,g.denseHeight,g.denseWidth],'bool'),proposal_descriptor_shape:tensor(shape,[4],'int64')},o.dense.scores.length*20,options);
   const points=nms.result?.['/Gather_5_output_0'],scores=nms.result?.['/Gather_6_output_0'];requireValue(points?.data instanceof BigInt64Array&&scores?.data instanceof Float32Array&&points.data.length===scores.data.length*2&&scores.data.every(Number.isFinite)&&JSON.stringify(points.dims)===JSON.stringify([scores.data.length,2])&&JSON.stringify(scores.dims)===JSON.stringify([scores.data.length]),'Native owner NMS count/type/shape changed');
   for(let row=0;row<scores.data.length;row++){const y=Number(points.data[row*2]),x=Number(points.data[row*2+1]);requireValue(Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=0&&y>=0&&x<g.denseWidth&&y<g.denseHeight&&o.presence[y*g.denseWidth+x]===1,'Absent or invalid native point survived NMS')}
   records.push({id:o.id,bounds:[...o.bounds],size:[...o.size],presenceIdentity:o.presenceIdentity,presence:o.presence,nms:nms.result,survivors:scores.data.length});count+=scores.data.length;
  }
  s.metadata(count*48+owners.length*128);
  const identities=s.array(BigInt64Array,count*2,'proposal-common-point-identities'),allScores=s.array(Float32Array,count,'proposal-common-point-scores');let offset=0;
  for(let index=0;index<records.length;index++){const r=records[index];for(let row=0;row<r.survivors;row++){identities[(offset+row)*2]=BigInt(index);identities[(offset+row)*2+1]=BigInt(row);allScores[offset+row]=r.nms['/Gather_6_output_0'].data[row]}offset+=r.survivors}
  const ranked=await graph('proposal-point-rank',{'/Gather_5_output_0':tensor(identities,[count,2],'int64'),'/Gather_6_output_0':tensor(allScores,[count])},Math.min(count,2048)*20,options),selected=ranked.result?.['/If_output_0'],rankScores=ranked.result?.['/If_output_1'];
  const n=Math.min(count,2048);requireValue(selected?.data instanceof BigInt64Array&&rankScores?.data instanceof Float32Array&&selected.data.length===n*2&&rankScores.data.length===n&&rankScores.data.every(Number.isFinite)&&JSON.stringify(selected.dims)===JSON.stringify([n,2])&&JSON.stringify(rankScores.dims)===JSON.stringify([n]),'One common native Top2048 shape/count changed');
  const selectedByOwner=owners.map(()=>[]),keypoints=s.array(Float32Array,n*2,'proposal-common-keypoints'),descriptors=s.array(Float32Array,n*256,'proposal-common-descriptors'),originalXY=s.array(Float64Array,n*2,'proposal-common-original-points'),localXY=s.array(Float32Array,n*2,'proposal-common-local-points');
  for(let row=0;row<n;row++){const index=Number(selected.data[row*2]),local=Number(selected.data[row*2+1]);requireValue(Number.isSafeInteger(index)&&index>=0&&index<records.length&&Number.isSafeInteger(local)&&local>=0&&local<records[index].survivors,'Native ranking changed an opaque owner/row identity');selectedByOwner[index].push({row,local})}
  for(let index=0;index<records.length;index++){
   const r=records[index],o=owners[index],g=o.dense.geometry,rows=selectedByOwner[index],yx=s.array(BigInt64Array,rows.length*2,'proposal-selected-owner-yx');
   for(let row=0;row<rows.length;row++){yx[row*2]=r.nms['/Gather_5_output_0'].data[rows[row].local*2];yx[row*2+1]=r.nms['/Gather_5_output_0'].data[rows[row].local*2+1]}
   const coordinates=s.own(mapSelfDMProposalPointCoordinates({pointsYX:yx,bounds:r.bounds,size:r.size,proposalBounds,proposalSize},{budget}));
   const sample=await graph('proposal-point-sampler',{dense_descriptors:tensor(o.dense.descriptors,[1,256,g.rows,g.cols]),'/Cast_3_output_0':tensor(coordinates.localXY,[rows.length,2])},rows.length*256*4,options);
   requireValue(sample.result?.descriptors?.data instanceof Float32Array&&sample.result.descriptors.data.every(Number.isFinite)&&JSON.stringify(sample.result.descriptors.dims)===JSON.stringify([1,256,rows.length]),'Native local descriptor sampler changed');
   for(let k=0;k<rows.length;k++){const row=rows[k].row;keypoints.set(coordinates.proposalXY.subarray(k*2,k*2+2),row*2);originalXY.set(coordinates.originalXY.subarray(k*2,k*2+2),row*2);localXY.set(coordinates.localXY.subarray(k*2,k*2+2),row*2);for(let c=0;c<256;c++)descriptors[c*n+row]=sample.result.descriptors.data[c*rows.length+k]}
   r.selected={rows,pointsYX:yx,coordinates:{localXY:coordinates.localXY,originalXY:coordinates.originalXY,proposalXY:coordinates.proposalXY,metadata:coordinates.metadata},sample:sample.result};
  }
  checkAbort(joined);owner.result={keypoints:tensor(keypoints,[1,n,2]),scores:tensor(rankScores.data,[1,n]),descriptors:tensor(descriptors,[1,256,n])};
  owner.raw={owners:records,identities,allScores,rank:ranked.result,output:owner.result,selectedLocalXY:localXY,selectedOriginalXY:originalXY,proposalBounds:[...proposalBounds],proposalSize:[...proposalSize],receipts,metadata:{policy:SELFDM_PROPOSAL_CONTEXT_POINTS,backendRequested:backend,maximumCores:profile.maxWorkers,oneCommonTopK:true,nativeMaximumKeypoints:2048,allOwnerSurvivors:count,selectedCount:n,actualNativePipelines:receipts.length,noAdditionalNormalizationDeduplicationOrPointFilter:true}};
  s.done();return owner;
 }catch(primary){s.done();await retireCompositeOwners([()=>owner.release()],{primary});throw primary}
 finally{s.done()}
}
