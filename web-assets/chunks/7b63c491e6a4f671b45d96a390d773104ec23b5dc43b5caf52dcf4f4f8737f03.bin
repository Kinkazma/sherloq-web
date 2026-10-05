import {createNeuralTensor} from './neural-tensor-store.js';
import {executionSummary} from './neural-execution-summary.js';
import {requireValue,checkAbort} from './errors.js';
const MiB=1024**2,f=Math.fround;
/** CAT-Net's complete dual HRNet. Local operators retain their receptive halos;
 * every fusion samples the global branch dimensions with native half-pixel
 * coordinates. No independent tile prediction or altered padding to 32 pixels. */
export async function catnetSegmentedNetwork(rgb,codes,table,{manifest,pool,budget,getTemporarySession,signal,onProgress,backend='auto',windowBytes=128*MiB,storage='auto'}={}){
 requireValue(rgb.channels===3&&codes.channels===1&&rgb.width===codes.width&&rgb.height===codes.height&&rgb.width%8===0&&rgb.height%8===0,'Invalid CAT-Net padded inputs.');
 const owned=new Set(),executions=executionSummary();
 const make=async(c,h,w)=>{const selected=storage==='auto'?(c*h*w*4>Math.min(budget.limit/12,(budget.limit-budget.total())/4)?'temporary':'memory'):storage,t=await createNeuralTensor(c,h,w,{budget,signal,storage:selected,getTemporarySession});owned.add(t);return t;};
 const drop=async t=>{if(owned.delete(t))await t.dispose();};
 const run=async(name,feeds,workspaceBytes,outputBytes)=>{const output=await pool.run(name,feeds,{signal,onProgress,backend,workspaceBytes:32*MiB+Math.ceil(workspaceBytes),outputBytes});executions.add(name,output.metrics);return output;};
 async function local(input,op,extra={}){
  const {stride:s,radius:r,channels:c}=op,h=Math.ceil(input.height/s),w=Math.ceil(input.width/s),target=await make(c,h,w),step=Math.max(1,Math.floor(windowBytes/(input.width*(op.activationChannels??Math.max(c,input.channels,64))*4*6*s)));
  for(let top=0;top<h;top+=step){
   checkAbort(signal);const rows=Math.min(step,h-top),lo=Math.max(0,Math.floor((top*s-r)/s)*s),hi=Math.min(input.height,Math.ceil(((top+rows-1)*s+r+1)/s)*s),part=await input.readRows(lo,hi-lo,{signal});let output,release;
   try{
    const oh=Math.ceil((hi-lo)/s),count=c*rows*w;output=await run(op.name,{x:{data:part.data,dims:part.dims},...extra},Math.max(part.data.byteLength,c*oh*w*4,(op.activationChannels??Math.max(c,input.channels,64))*(hi-lo)*input.width*4)*6,c*oh*w*4);
    const tensor=output.result.result;requireValue(tensor.dims[1]===c&&tensor.dims[2]===oh&&tensor.dims[3]===w,'CAT-Net local output geometry mismatch.');release=budget.reserve(count*4);const core=new Float32Array(count),crop=top-lo/s;
    for(let channel=0;channel<c;channel++)core.set(tensor.data.subarray((channel*oh+crop)*w,(channel*oh+crop+rows)*w),channel*rows*w);
    await target.writeRows(top,rows,core,{signal});
   }finally{release?.();output?.release();part.release();}
   onProgress?.({phase:'catnet-local-rows',model:op.name,completed:top+rows,total:h});
  }return target;
 }
 function concat(inputs){
  const {width,height}=inputs[0],channels=inputs.reduce((sum,t)=>sum+t.channels,0);requireValue(inputs.every(t=>t.width===width&&t.height===height),'CAT-Net branch concatenation mismatch.');
  return {width,height,channels,async readRows(top,rows,options){const release=budget.reserve(channels*rows*width*4);try{const data=new Float32Array(channels*rows*width);let at=0;for(const t of inputs){const part=await t.readRows(top,rows,options);try{data.set(part.data,at);at+=part.data.length;}finally{part.release();}}return {data,dims:[1,channels,rows,width],release};}catch(e){release();throw e;}}};
 }
 function resized(input,height,width){
  if(input.height===height&&input.width===width)return input;
  return {width,height,channels:input.channels,async readRows(top,rows,options){
   const fh=input.height,fw=input.width,lo=Math.max(0,Math.floor(((2*top+1)*fh-height)/(2*height))),hi=Math.min(fh,Math.floor(((2*(top+rows)-1)*fh-height)/(2*height))+2),part=await input.readRows(lo,hi-lo,options);let gridRelease,output;
   try{
    gridRelease=budget.reserve(rows*width*8);const grid=new Float32Array(rows*width*2);
    for(let y=0;y<rows;y++){
     const sy=f(Math.min(fh-1,Math.max(0,f(f((top+y+.5)*f(fh/height))-.5)))-lo),gy=f(f(f(sy+.5)*f(2/(hi-lo)))-1);
     for(let x=0;x<width;x++){const sx=Math.min(fw-1,Math.max(0,f(f((x+.5)*f(fw/width))-.5))),gx=f(f(f(sx+.5)*f(2/fw))-1);grid[(y*width+x)*2]=gx;grid[(y*width+x)*2+1]=gy;}
    }
    output=await run(manifest.sample,{x:{data:part.data,dims:part.dims},grid:{data:grid,dims:[1,rows,width,2]}},part.data.byteLength*4+rows*width*input.channels*16,rows*width*input.channels*4);
    return {data:output.result.result.data,dims:[1,input.channels,rows,width],release:output.release};
   }catch(e){output?.release();throw e;}finally{gridRelease?.();part.release();}
  }};
 }
 async function transition(inputs,description){
  const outputs=[];for(const d of description)outputs.push(d.operator?await local(inputs[d.source],d.operator):inputs[d.source]);
  for(const t of inputs)if(!outputs.includes(t))await drop(t);return outputs;
 }
 async function stage(inputs,description){
  for(const module of description){
   const branches=[];for(let j=0;j<inputs.length;j++){branches.push(await local(inputs[j],module.branches[j]));await drop(inputs[j]);}
   const fused=[];
   for(let i=0;i<module.fuse.length;i++){
    const target=await make(branches[i].channels,branches[i].height,branches[i].width),step=Math.max(1,Math.floor(windowBytes/(target.width*target.channels*16)));
    // Accumulate j in the original network order; activation follows the sum.
    for(let j=0;j<branches.length;j++){
     const op=module.fuse[i][j],source=op?await local(branches[j],op):branches[j],sample=resized(source,target.height,target.width);
     for(let top=0;top<target.height;top+=step){
      const rows=Math.min(step,target.height-top),part=await sample.readRows(top,rows,{signal});let previous;
      try{if(j>0){previous=await target.readRows(top,rows,{signal});for(let k=0;k<part.data.length;k++)part.data[k]=f(previous.data[k]+part.data[k]);}if(j===branches.length-1)for(let k=0;k<part.data.length;k++)part.data[k]=Math.max(0,part.data[k]);await target.writeRows(top,rows,part.data,{signal});}finally{previous?.release();part.release();}
     }
     if(op)await drop(source);
    }fused.push(target);
   }
   for(const t of branches)await drop(t);inputs=fused;onProgress?.({phase:'catnet-high-resolution-fusion',model:module.branches[0].name,completed:1,total:1});
  }return inputs;
 }
 try{
  let rgbFeatures=[await local(rgb,manifest.rgbStem)];
  for(let i=0;i<manifest.rgbStages.length;i++)rgbFeatures=await stage(await transition(rgbFeatures,manifest.rgbTransitions[i]),manifest.rgbStages[i]);
  let stem=await local(codes,manifest.dctStem,{table}),dctFeatures=[await local(stem,manifest.dctLayer)];await drop(stem);
  for(let i=0;i<manifest.dctStages.length;i++)dctFeatures=await stage(await transition(dctFeatures,manifest.dctTransitions[i]),manifest.dctStages[i]);
  const joined=[rgbFeatures[0],...dctFeatures.map((t,i)=>concat([rgbFeatures[i+1],t]))];let features=await transition(joined,manifest.fusionTransition);
  for(const t of [...rgbFeatures,...dctFeatures])if(!features.includes(t))await drop(t);
  features=await stage(features,manifest.fusionStage);
  const {width:w,height:h}=features[0],native=await local(concat(features.map(t=>resized(t,h,w))),manifest.head);
  for(const t of features)await drop(t);
  const full=await make(1,rgb.height,rgb.width),sample=resized(native,rgb.height,rgb.width),step=Math.max(1,Math.floor(windowBytes/(rgb.width*32)));
  for(let top=0;top<rgb.height;top+=step){const rows=Math.min(step,rgb.height-top),part=await sample.readRows(top,rows,{signal});try{await full.writeRows(top,rows,part.data,{signal});}finally{part.release();}}
  return {native_map:native,padded_map:full,releasePaddedMap:()=>drop(full),executions:executions.values(),async release(){for(const t of [...owned])await drop(t);}};
 }catch(e){for(const t of [...owned])await drop(t);throw e;}
}
