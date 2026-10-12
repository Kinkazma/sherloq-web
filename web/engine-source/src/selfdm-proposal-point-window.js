import {requireValue,checkAbort} from './errors.js';
import {allocateOwnedTypedArray,allocateTypedArray,registerArrayViews} from './allocation.js';

const MiB=1024**2,STRIDE=8,HALO=48,CORE=32;

/** The native SuperPoint dense heads have stride8 and receptive field84.
 * Origins aligned to stride8 plus48px halo preserve their global coordinates.
 * Keep the source's final remainder: odd source dimensions affect its last
 * coarse cell even though the native score grid ends at floor(size/8)*8.
 */
export function proposalPointWindows(width,height){
 requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>=8&&height>=8,'SuperPoint source dimensions');
 const cols=Math.floor(width/STRIDE),rows=Math.floor(height/STRIDE),windows=[];
 for(let y=0;y<rows;y+=CORE)for(let x=0;x<cols;x+=CORE){
  const x1=Math.min(cols,x+CORE),y1=Math.min(rows,y+CORE),sx=Math.max(0,x*STRIDE-HALO),sy=Math.max(0,y*STRIDE-HALO),ex=Math.min(width,x1*STRIDE+HALO),ey=Math.min(height,y1*STRIDE+HALO);
  windows.push({x,y,x1,y1,sx,sy,width:ex-sx,height:ey-sy});
 }
 return {cols,rows,denseWidth:cols*STRIDE,denseHeight:rows*STRIDE,windows};
}

function copyDense(result,state,geometry,w){
 const {dense_scores:scores,dense_descriptors:descriptors}=result,cols=Math.floor(w.width/8),rows=Math.floor(w.height/8),dw=cols*8,dh=rows*8;
 requireValue(scores?.data instanceof Float32Array&&descriptors?.data instanceof Float32Array&&JSON.stringify(scores.dims)===JSON.stringify([1,1,dh,dw])&&JSON.stringify(descriptors.dims)===JSON.stringify([1,256,rows,cols]),'SuperPoint dense output geometry');
 requireValue(scores.data.every(value=>Number.isFinite(value)&&value>=0&&value<=1.00001)&&descriptors.data.every(Number.isFinite),'SuperPoint dense output values');
 const ox=w.sx/8,oy=w.sy/8;
 for(let y=w.y*8;y<w.y1*8;y++)state.scores.set(scores.data.subarray((y-oy*8)*dw+(w.x-ox)*8,(y-oy*8)*dw+(w.x1-ox)*8),y*geometry.denseWidth+w.x*8);
 const srcPlane=rows*cols,dstPlane=geometry.rows*geometry.cols;
 for(let c=0;c<256;c++)for(let y=w.y;y<w.y1;y++)state.descriptors.set(descriptors.data.subarray(c*srcPlane+(y-oy)*cols+w.x-ox,c*srcPlane+(y-oy)*cols+w.x1-ox),c*dstPlane+y*geometry.cols+w.x);
}

/** Dense CNN work is independently admitted by the common neural pool; NMS,
 * border filtering, TopK and descriptor sampling run once on the complete
 * native grid. Only one mutable grid and completion bitmap are retained.
 * A failed graph download keeps consumed central windows, without retaining
 * every window output or copying a full field at periodic checkpoints.
 */
export async function runProposalPointWindows({gray,width,height,budget,cacheKey,runGraph,maxWorkers,signal,onProgress,publishCheckpoint=()=>true}){
 requireValue(gray instanceof Float32Array&&gray.length===width*height&&budget&&typeof runGraph==='function'&&typeof cacheKey==='string'&&Number.isInteger(maxWorkers)&&maxWorkers>0,'SuperPoint window input contract');
 checkAbort(signal);const geometry=proposalPointWindows(width,height),{windows,cols,rows,denseWidth,denseHeight}=geometry;
 const scoreLength=denseWidth*denseHeight,descriptorLength=cols*rows*256,byteLength=(scoreLength+descriptorLength)*4+windows.length+256;
 let record=budget.get(cacheKey),reservation,completed=false;
 if(record){
  requireValue(record.value.width===width&&record.value.height===height,'SuperPoint checkpoint geometry');budget.take(cacheKey);
  try{reservation=budget.reserve(record.byteLength);}catch(error){budget.put(cacheKey,record);throw error;}
 }
 else{
  reservation=budget.reserve(byteLength);
  try{
   const value={width,height,scores:allocateTypedArray(Float32Array,scoreLength,{label:'proposal-point-dense-scores'}),descriptors:allocateTypedArray(Float32Array,descriptorLength,{label:'proposal-point-dense-descriptors'}),done:allocateTypedArray(Uint8Array,windows.length,{label:'proposal-point-done-windows'})};
   const pin=registerArrayViews(budget,value,{owner:'selfdm-proposal',label:'proposal-point-checkpoint'});
   record={value,byteLength,onEvict(){pin();record.value=null;}};
  }catch(error){reservation();throw error;}
 }
 const state=record.value;let next=0,failure;
 const initialCompleted=state.done.reduce((sum,value)=>sum+value,0);
 try{
  const siblings=await Promise.allSettled(Array.from({length:Math.min(windows.length,maxWorkers)},async()=>{
   while(next<windows.length&&!failure){
    const index=next++,w=windows[index];if(state.done[index])continue;
    let input,result;
    try{
     checkAbort(signal);input=allocateOwnedTypedArray(Float32Array,w.width*w.height,{budget,owner:'selfdm-proposal',label:'proposal-point-window-input'});
     for(let y=0;y<w.height;y++)input.data.set(gray.subarray((w.sy+y)*width+w.sx,(w.sy+y)*width+w.sx+w.width),y*w.width);
     const area=w.width*w.height,localCols=Math.floor(w.width/8),localRows=Math.floor(w.height/8),outputBytes=(localCols*localRows*256+localCols*localRows*64)*4;
     result=await runGraph('superpoint',{image:{data:input.data,dims:[1,1,w.height,w.width]}},Math.ceil(Math.max(32*MiB,area*64*4*3)/MiB)*MiB,outputBytes,{tile:index,window:w});
     copyDense(result.result,state,geometry,w);state.done[index]=1;
     onProgress?.({phase:'selfdm-proposal-point-window',tile:index,total:windows.length,completed:state.done.reduce((sum,value)=>sum+value,0)});
    }catch(error){failure??=error;throw error;}
    finally{result?.release();input?.release();}
   }
  }));
  const rejected=siblings.find(value=>value.status==='rejected');if(rejected)throw failure??rejected.reason;checkAbort(signal);
  const denseBytes=(scoreLength+descriptorLength)*4,workspace=Math.ceil((32*MiB+scoreLength*4*12+descriptorLength*4*2)/MiB)*MiB,gpuWasmWorkspaceBytes=Math.ceil(Math.max(128*MiB,denseBytes*2+64*MiB)/MiB)*MiB;
  // A single global postprocess keeps native NMS/TopK boundaries and its exact
  // descriptor grid. Its buffers scale with final dense fields, not with the
  //64-channel full-resolution CNN activation that previously exhausted RAM.
  const result=await runGraph('superpoint-post',{dense_scores:{data:state.scores,dims:[1,1,denseHeight,denseWidth]},dense_descriptors:{data:state.descriptors,dims:[1,256,rows,cols]}},workspace,2048*259*4,{denseWindows:windows.length,reusedWindows:initialCompleted,gpuWasmWorkspaceBytes});
  completed=true;return result;
 }finally{
  reservation();if(completed||!publishCheckpoint())record.onEvict();else budget.put(cacheKey,record);
 }
}
