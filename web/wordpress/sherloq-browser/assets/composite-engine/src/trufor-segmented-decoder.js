import {createNeuralTensor} from './neural-tensor-store.js';
import {executionSummary} from './neural-execution-summary.js';
import {requireValue,checkAbort} from './errors.js';
const MiB=1024**2,f=Math.fround;
/** Streaming equivalent of native weighted_statistics_pooling. All pixels
 * contribute to one image-level normalization. No average of tile scores. */
export class TruforStatistics {
 constructor(){this.weightMax=-Infinity;this.weight=0;this.first=0;this.second=0;this.lowMax=-Infinity;this.lowSum=0;this.highMax=-Infinity;this.highSum=0;}
 add(x,logWeight=0){
  requireValue(Number.isFinite(x)&&Number.isFinite(logWeight),'Nonfinite TruFor score input.');
  if(logWeight>this.weightMax){const scale=Math.exp(this.weightMax-logWeight);this.weight*=scale;this.first*=scale;this.second*=scale;this.weightMax=logWeight;}
  const weight=Math.exp(logWeight-this.weightMax);this.weight+=weight;this.first+=weight*x;this.second+=weight*x*x;
  const low=logWeight-x,high=logWeight+x;
  if(low>this.lowMax){this.lowSum*=Math.exp(this.lowMax-low);this.lowMax=low;}this.lowSum+=Math.exp(low-this.lowMax);
  if(high>this.highMax){this.highSum*=Math.exp(this.highMax-high);this.highMax=high;}this.highSum+=Math.exp(high-this.highMax);
 }
 values(){requireValue(this.weight>0,'Empty TruFor score population.');const z=this.weightMax+Math.log(this.weight);return Float32Array.of(-(this.lowMax+Math.log(this.lowSum)-z),this.highMax+Math.log(this.highSum)-z,this.first/this.weight,this.second/this.weight);}
}
function cropFor(featureHeight,outputHeight,top,rows){return {start:Math.max(0,Math.floor(((2*top+1)*featureHeight-outputHeight)/(2*outputHeight))),stop:Math.min(featureHeight,Math.floor(((2*(top+rows)-1)*featureHeight-outputHeight)/(2*outputHeight))+2)};}
function sampleGrid(fh,fw,height,width,top,rows,start,stop,budget){
 const release=budget.reserve(rows*width*8);
 try{const data=new Float32Array(rows*width*2),ch=stop-start;
  for(let y=0;y<rows;y++){const sy=f(Math.min(fh-1,Math.max(0,f(f((top+y+.5)*f(fh/height))-.5)))-start),gy=f(f(f(sy+.5)*f(2/ch))-1);
   for(let x=0;x<width;x++){const sx=Math.min(fw-1,Math.max(0,f(f((x+.5)*f(fw/width))-.5))),gx=f(f(f(sx+.5)*f(2/fw))-1),at=(y*width+x)*2;data[at]=gx;data[at+1]=gy;}}
  return {data,dims:[1,rows,width,2],release};
 }catch(e){release();throw e;}
}
export async function truforSegmentedDecode(features,width,height,{manifest,pool,budget,getTemporarySession,signal,onProgress,backend='auto',windowBytes=32*MiB,storage='auto'}={}){
 requireValue(features.length===4&&[width,height].every(x=>Number.isSafeInteger(x)&&x>0),'Invalid TruFor decoder geometry.');
 const owned=new Set(),executions=executionSummary(),make=async(c,h,w)=>{const selected=storage==='auto'?(c*h*w*4>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory'):storage,t=await createNeuralTensor(c,h,w,{budget,signal,storage:selected,getTemporarySession});owned.add(t);return t;},drop=async t=>{if(owned.delete(t))await t.dispose();};
 const run=async(name,feeds,workspaceBytes,outputBytes)=>{const result=await pool.run(name,feeds,{signal,onProgress,backend,workspaceBytes:16*MiB+Math.ceil(workspaceBytes),outputBytes});executions.add(name,result.metrics);return result;};
 const h=features[0].height,w=features[0].width,step=Math.max(1,Math.floor(windowBytes/(w*512*4*12)));
 async function head(description){
  const target=await make(description.channels,h,w);
  for(let top=0;top<h;top+=step){const rows=Math.min(step,h-top),projected=[];let fused;
   try{
    for(let i=0;i<4;i++){
     const t=features[i],{start,stop}=i===0?{start:top,stop:top+rows}:cropFor(t.height,h,top,rows),part=await t.readRows(start,stop-start,{signal});let grid;
     try{if(i>0)grid=sampleGrid(t.height,t.width,h,w,top,rows,start,stop,budget);projected.push(await run(description.projects[i],{x:{data:part.data,dims:part.dims},...(grid?{grid:{data:grid.data,dims:grid.dims}}:{})},part.data.byteLength*4+512*rows*w*4*4,512*rows*w*4));}finally{grid?.release();part.release();}
    }
    const feeds=Object.fromEntries(projected.map((p,i)=>['c'+(i+1),p.result.result]));fused=await run(description.fuse,feeds,rows*w*512*4*12,rows*w*description.channels*4);await target.writeRows(top,rows,fused.result.result.data,{signal});
   }finally{fused?.release();for(const p of projected)p.release();}
  }return target;
 }
 try{
  const logits=await head(manifest.heads[0]),confidence=await head(manifest.heads[1]),map=await make(1,height,width),confidenceMap=await make(1,height,width),statistics=[new TruforStatistics(),new TruforStatistics()],rowsPerStep=Math.max(1,Math.floor(windowBytes/(width*4*24)));
  for(let top=0;top<height;top+=rowsPerStep){
   checkAbort(signal);const rows=Math.min(rowsPerStep,height-top),{start,stop}=cropFor(h,height,top,rows),pred=await logits.readRows(start,stop-start,{signal});let conf,grid,output;
   try{conf=await confidence.readRows(start,stop-start,{signal});grid=sampleGrid(h,w,height,width,top,rows,start,stop,budget);output=await run(manifest.final,{pred:{data:pred.data,dims:pred.dims},conf:{data:conf.data,dims:conf.dims},grid:{data:grid.data,dims:grid.dims}},rows*width*4*24,rows*width*4*4);
    const result=output.result;await map.writeRows(top,rows,result.map.data,{signal});await confidenceMap.writeRows(top,rows,result.confidence.data,{signal});
    for(let i=0;i<rows*width;i++){const c=result.raw_confidence.data[i],d=result.difference.data[i],logWeight=c>=0?-Math.log1p(Math.exp(-c)):c-Math.log1p(Math.exp(c));statistics[0].add(c);statistics[1].add(d,logWeight);}
   }finally{output?.release();grid?.release();conf?.release();pred.release();}onProgress?.({phase:'trufor-output-rows',completed:top+rows,total:height});
  }
  await drop(logits);await drop(confidence);
  const stats=new Float32Array(8);stats.set(statistics[0].values());stats.set(statistics[1].values(),4);const output=await run(manifest.score,{stats:{data:stats,dims:[1,8]}},65536,4);let score;try{score=output.result.result.data[0];requireValue(Number.isFinite(score),'Nonfinite TruFor score.');}finally{output.release();}
  return {map,confidence:confidenceMap,score,statistics:stats,executions:executions.values(),async release(){for(const t of [...owned])await drop(t);}};
 }catch(e){for(const t of [...owned])await drop(t);throw e;}
}
