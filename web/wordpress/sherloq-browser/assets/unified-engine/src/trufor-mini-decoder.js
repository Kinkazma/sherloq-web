import "../../runtime-context.js?v=0.33.1";
import {cropFor,sampleGrid} from './trufor-mini-geometry.js';
import {createNeuralTensor,noteNeuralTensorTaskYield} from './neural-tensor-store.js';
import {executionSummary} from './neural-execution-summary.js';
import {requireValue,checkAbort,controlCheckpoint,createCooperator} from './errors.js';
const MiB=1024**2;

/** Mean of exactly ceil(N * .01) strongest localization values. This is an
 * empirical map summary, never the absent official TruFor detector head.
 * A float32 min-heap preserves exact membership while streaming the field.
 */
export async function truforMiniTopMean(tensor,{budget,signal,chunkBytes=MiB}={}){
 requireValue(Number.isSafeInteger(tensor.length)&&tensor.length>0&&Number.isSafeInteger(chunkBytes)&&chunkBytes>=4,'Invalid Mini score population.');
 const count=Math.max(1,Math.ceil(tensor.length*.01)),chunk=Math.min(tensor.length,Math.floor(chunkBytes/4)),release=budget.reserve((count+chunk)*4);
 try{
  const heap=new Float32Array(count),values=new Float32Array(chunk);let filled=0;
  function down(index,value){while(index*2+1<count){let child=index*2+1;if(child+1<count&&heap[child+1]<heap[child])child++;if(heap[child]>=value)break;heap[index]=heap[child];index=child;}heap[index]=value;}
  for(let at=0;at<tensor.length;at+=chunk){
   await controlCheckpoint(signal);const size=Math.min(chunk,tensor.length-at);await tensor.readInto(values.subarray(0,size),at,{signal});
   for(let i=0;i<size;i++){
    const value=values[i];requireValue(Number.isFinite(value)&&value>=0&&value<=1,'Nonfinite or out-of-range Mini localization response.');
    if(filled<count){heap[filled++]=value;if(filled===count)for(let j=Math.floor(count/2)-1;j>=0;j--)down(j,heap[j]);}
    else if(value>heap[0])down(0,value);
   }
  }
  let sum=0;for(let i=0;i<count;i++){if(i%65536===0)await controlCheckpoint(signal);sum+=heap[i];}
  checkAbort(signal);return sum/count;
 }finally{release();}
}

/** The identical float32 heap, fed by native map bands already returned by
 * the final graph. Band boundaries do not change insertion or summation order.
 * Only the heap is retained; the caller owns every supplied band.
 */
export function createTruforMiniTopMeanAccumulator(length,{budget,signal}={}){
 requireValue(Number.isSafeInteger(length)&&length>0,'Invalid Mini score population.');checkAbort(signal);
 const count=Math.max(1,Math.ceil(length*.01)),lease=budget.reserve(count*4);let heap;
 try{heap=new Float32Array(count);}catch(error){lease();throw error;}
 let filled=0,seen=0,closed=false,busy=false;const cooperate=createCooperator(signal);
 function down(index,value){while(index*2+1<count){let child=index*2+1;if(child+1<count&&heap[child+1]<heap[child])child++;if(heap[child]>=value)break;heap[index]=heap[child];index=child;}heap[index]=value;}
 function alive(){requireValue(!closed,'Mini score accumulator is closed.');checkAbort(signal);}
 return {
  async add(values){
   alive();requireValue(!busy&&values instanceof Float32Array&&seen+values.length<=length,'Invalid or concurrent Mini map band.');busy=true;
   try{
    for(let i=0;i<values.length;i++){
     if(i%65536===0)await cooperate();
     const value=values[i];requireValue(Number.isFinite(value)&&value>=0&&value<=1,'Nonfinite or out-of-range Mini localization response.');
     if(filled<count){heap[filled++]=value;if(filled===count)for(let j=Math.floor(count/2)-1;j>=0;j--)down(j,heap[j]);}
     else if(value>heap[0])down(0,value);
    }
    seen+=values.length;alive();
   }finally{busy=false;}
  },
  async finish(){
   alive();requireValue(!busy&&seen===length&&filled===count,'Incomplete Mini score population.');
   let sum=0;for(let i=0;i<count;i++){if(i%65536===0)await cooperate();sum+=heap[i];}
   alive();return sum/count;
  },
  release(){if(closed)return;closed=true;heap=null;lease();}
 };
}

/** Frozen eight-unit affine localization readout. The eight channels are
 * already projected by the four Mini fusion operators. Interpolate their
 * logits to the native grid BEFORE sigmoid, without confidence/global heads.
 */
export async function truforMiniDecode(features,width,height,{manifest,pool,budget,getTemporarySession,signal,onProgress,backend='auto',windowBytes=32*MiB,storage='auto'}={}){
 requireValue(features.length===4&&features.every(t=>t.channels===8)&&[width,height].every(v=>Number.isSafeInteger(v)&&v>0)&&Number.isSafeInteger(windowBytes)&&windowBytes>0,'Invalid Mini decoder geometry.');
 const owned=new Set(),executions=executionSummary();let scoreAccumulator=null;
 const make=async(h,w)=>{const selected=storage==='auto'?(h*w*4>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory'):storage,t=await createNeuralTensor(1,h,w,{budget,signal,storage:selected,cooperation:'bounded',getTemporarySession});owned.add(t);return t;};
 const drop=async t=>{if(owned.has(t)){await t.dispose();owned.delete(t);}};
 const releaseAll=async()=>{const outcomes=await Promise.allSettled([...owned].map(drop)),failed=outcomes.find(x=>x.status==='rejected');if(failed)throw failed.reason;};
 const run=async(name,feeds,workspaceBytes,outputBytes)=>{const answer=await pool.run(name,feeds,{backend,signal,onProgress,workspaceBytes:16*MiB+Math.ceil(workspaceBytes),outputBytes});noteNeuralTensorTaskYield(budget);executions.add(name,answer.metrics);return answer;};
 try{
  const h=features[0].height,w=features[0].width,logit=await make(h,w),step=Math.max(1,Math.floor(windowBytes/(w*8*4*24)));
  for(let top=0;top<h;top+=step){
   checkAbort(signal);const rows=Math.min(step,h-top),parts=[],grids=[],feeds={};let output;
   try{
    for(let i=0;i<features.length;i++){
     const feature=features[i],{start,stop}=i===0?{start:top,stop:top+rows}:cropFor(feature.height,h,top,rows),part=await feature.readRows(start,stop-start,{signal});parts.push(part);feeds['c'+(i+1)]={data:part.data,dims:part.dims};
     if(i>0){const grid=sampleGrid(feature.height,feature.width,h,w,top,rows,start,stop,budget);grids.push(grid);feeds['grid'+(i+1)]={data:grid.data,dims:grid.dims};}
    }
    output=await run(manifest.decoder,feeds,rows*w*8*4*24,rows*w*4);const data=output.result.result.data;
    requireValue(data instanceof Float32Array&&data.length===rows*w,'Invalid Mini affine readout output.');await logit.writeRows(top,rows,data,{signal});
   }finally{output?.release();for(const grid of grids)grid.release();for(const part of parts)part.release();}
   onProgress?.({phase:'trufor-mini-decoder',completed:top+rows,total:h});
  }
  const map=await make(height,width),finalStep=Math.max(1,Math.floor(windowBytes/(width*4*24)));
  // A tight budget can keep the original deferred readback. If a later native
  // graph is refused, release this optional heap and retry that same real band.
  try{scoreAccumulator=createTruforMiniTopMeanAccumulator(width*height,{budget,signal});}catch(error){if(error?.code!=='MEMORY_LIMIT'&&error?.code!=='MEMORY_ALLOCATION')throw error;}
  async function nativeBand(top,rows){
   checkAbort(signal);const {start,stop}=cropFor(h,height,top,rows);let part,grid,output;
   try{
    part=await logit.readRows(start,stop-start,{signal});grid=sampleGrid(h,w,height,width,top,rows,start,stop,budget);const feeds={logit:{data:part.data,dims:part.dims},grid:{data:grid.data,dims:grid.dims}};
    output=await run(manifest.final,feeds,rows*width*4*24,rows*width*4);
    const data=output.result.result.data;requireValue(data instanceof Float32Array&&data.length===rows*width,'Invalid Mini native localization output.');await map.writeRows(top,rows,data,{signal});if(scoreAccumulator)await scoreAccumulator.add(data);
   }finally{output?.release();grid?.release();part?.release();}
  }
  for(let top=0;top<height;top+=finalStep){
   const rows=Math.min(finalStep,height-top);
   try{await nativeBand(top,rows);}catch(error){if(!scoreAccumulator||!['MEMORY_LIMIT','MEMORY_ALLOCATION'].includes(error?.code))throw error;scoreAccumulator.release();scoreAccumulator=null;await nativeBand(top,rows);}
   onProgress?.({phase:'trufor-mini-native-map',completed:top+rows,total:height});
  }
  await drop(logit);const score=scoreAccumulator?await scoreAccumulator.finish():await truforMiniTopMean(map,{budget,signal});checkAbort(signal);
  return {map,score,executions:executions.values(),release:releaseAll};
 }catch(error){try{await releaseAll();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))error.cleanupError=cleanup;}throw error;}finally{scoreAccumulator?.release();}
}
