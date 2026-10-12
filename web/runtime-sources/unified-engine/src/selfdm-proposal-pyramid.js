import "../../runtime-context.js?v=0.16.0";
import {allocateTypedArray,wasmAllocationFailure} from './allocation.js';
import {requireValue} from './errors.js';

// The uncropped ResNet trunk has stride16/receptive field411. Keep its actual
// halo; selected grid indices always refer to the complete global pyramid.
export function proposalDeepMaskWindows(width,height,scale,edge=16){
 const ow=Math.floor(width*scale),oh=Math.floor(height*scale),pw=ow+160,ph=oh+160;
 requireValue(ow>0&&oh>0&&Number.isInteger(edge)&&edge>0,'Proposal scale geometry');
 const cols=Math.ceil(pw/16)-9,rows=Math.ceil(ph/16)-9,windows=[];
 const axis=(size,a,b)=>[Math.max(0,Math.floor((16*a+72-205-16)/16)*16),Math.min(size,Math.ceil((16*(b-1)+72+205+17)/16)*16)];
 if(pw<=704&&ph<=704)windows.push({x:0,y:0,width:pw,height:ph,col0:0,row0:0,col1:cols,row1:rows});
 else for(let row=0;row<rows;row+=edge)for(let col=0;col<cols;col+=edge){
  const col1=Math.min(cols,col+edge),row1=Math.min(rows,row+edge),[x,x1]=axis(pw,col,col1),[y,y1]=axis(ph,row,row1);
  windows.push({x,y,width:x1-x,height:y1-y,col0:col,row0:row,col1,row1});
 }
 return {ow,oh,rows,cols,windows};
}

export function proposalSourcePatch(width,height,ow,oh,window){
 const axis=(size,out,a,b)=>{
  const first=Math.max(0,a-80),last=Math.min(out-1,b-1-80);
  if(first>last)return [0,1];
  const scale=out>1?Math.fround((size-1)/(out-1)):0;
  const lo=Math.min(size-1,Math.floor(Math.fround(scale*first))),hi=Math.min(size-1,Math.floor(Math.fround(scale*last))+1);
  return [lo,hi+1];
 };
 const [x,x1]=axis(width,ow,window.x,window.x+window.width),[y,y1]=axis(height,oh,window.y,window.y+window.height);
 return {x,y,width:x1-x,height:y1-y};
}

export function prepareProposalPyramid(rgb,width,height,scale,module,{window,patch}={}){
 const ow=Math.floor(width*scale),oh=Math.floor(height*scale);
 window??={x:0,y:0,width:ow+160,height:oh+160};patch??={x:0,y:0,width,height};
 requireValue(rgb instanceof Uint8Array&&rgb.length===patch.width*patch.height*3&&[width,height,ow,oh].every(value=>Number.isSafeInteger(value)&&value>0),'Proposal RGB pyramid geometry');
 const n=window.width*window.height*3,input=module._malloc(rgb.byteLength),output=module._malloc(n*4);
 if(!input||!output){if(input)module._free(input);if(output)module._free(output);throw wasmAllocationFailure(module,'Proposal pyramid window allocation failed.',rgb.byteLength+n*4);}
 try{
  module.HEAPU8.set(rgb,input);
  // Fixed FMA policy matches the native vectorized kernel. Small generic CPU
  // paths have ordinary Float32 roundoff, separately measured end to end.
  requireValue(module._proposal_pyramid_patch(input,width,height,ow,oh,window.x,window.y,window.width,window.height,patch.x,patch.y,patch.width,patch.height,4,output)===0,'Proposal pyramid patch source coverage');
  const data=allocateTypedArray(Float32Array,n,{label:'selfdm-proposal-pyramid-output'});data.set(module.HEAPF32.subarray(output/4,output/4+n));
  return {data,shape:[1,3,window.height,window.width]};
 }finally{module._free(input);module._free(output);}
}

// Native AvgPool4 phase, three-blur halo and bilinear crop. Absolute origin is
// also a graph input, preserving coordinate rounding on odd image dimensions.
export function proposalCRFWindows(width,height,edge=256){
 const axis=(size,a,b)=>{
  const phase=Math.ceil(((4-size%4)%4)/2),first=Math.max(0,Math.floor((a+phase+.5)/4-.5)-5),last=Math.min(Math.ceil(size/4),Math.ceil((b-1+phase+.5)/4-.5)+6);
  let start=Math.max(0,first*4-phase),end=Math.min(size,last*4-phase);
  if(start===0&&end<size)end=Math.min(size,end+(size-end)%4);else if(end===size&&start>0)start=first*4;
  return [start,end];
 };
 const windows=[];
 for(let y=0;y<height;y+=edge)for(let x=0;x<width;x+=edge){const x1=Math.min(width,x+edge),y1=Math.min(height,y+edge),[sx,ex]=axis(width,x,x1),[sy,ey]=axis(height,y,y1);windows.push({x,y,x1,y1,sx,sy,width:ex-sx,height:ey-sy});}
 return windows;
}

// The unmodified SEEDS constructor's hierarchy and128-bin aligned histograms.
// Include source/gray/color/output scratch in the admitted imported heap.
export function proposalSeedsBytes(width,height,sourceBytes=0){
 const sh=Math.trunc(Math.sqrt(Math.fround(400*height/width))),sw=Math.trunc(sh*width/height);
 let levels=15,wf,hf;do{wf=Math.fround(Math.fround(width/sw)/2**(levels-1));hf=Math.fround(Math.fround(height/sh)/2**(levels-1));if(wf<1||hf<1)levels--;else break;}while(levels>0);
 requireValue(levels>0&&sw>0&&sh>0,'Proposal SEEDS geometry');
 let w=Math.floor(width/Math.ceil(wf)),h=Math.floor(height/Math.ceil(hf)),blocks=0;
 for(let i=0;i<levels;i++){blocks+=w*h;w=Math.floor(w/2);h=Math.floor(h/2);}
 return Math.ceil((16*1024**2+sourceBytes+width*height*40+blocks*(128*4+12))/(1024**2))*1024**2;
}
