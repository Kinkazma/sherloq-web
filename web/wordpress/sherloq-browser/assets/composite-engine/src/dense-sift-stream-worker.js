import "../../runtime-context.js?v=0.14.5";
import {createDenseSiftStreamMath} from './dense-sift-stream-math.js';
import {denseGray} from './dense-math.js';
let pending;
self.onmessage=async({data:p})=>{try{
 const math=await(pending??=createDenseSiftStreamMath());let result;
 if(p.stage==='gradients'){
  const g=math.gradients(denseGray(p.rgb),p.width,p.height,p.patch,p.mirror),values=new Float32Array(p.coreWidth*p.coreHeight*8);
  const left=p.mirror?p.width-p.x-p.coreWidth:p.x;
  for(let x=0;x<p.coreWidth;x++)for(let y=0;y<p.coreHeight;y++)for(let b=0;b<8;b++)values[(x*p.coreHeight+y)*8+b]=g.values[(b*p.height+p.y+y)*p.width+left+x];
  result={values,weights:g.weights};
 }else if(p.stage==='columns'){
  // Input is [independent axis, complete filtered axis, 8 bins].
  const {length,axes}=p,input=new Float32Array(p.values.length);
  for(let a=0;a<axes;a++)for(let i=0;i<length;i++)for(let b=0;b<8;b++)input[(i*axes+a)*8+b]=p.values[(a*length+i)*8+b];
  const filtered=math.columns(input,axes*8,length,p.patch),values=new Float32Array(filtered.length);
  for(let a=0;a<axes;a++)for(let i=0;i<length;i++)for(let b=0;b<8;b++)values[(a*length+i)*8+b]=filtered[(i*axes+a)*8+b];
  result={values};
 }else if(p.stage==='factors')result=math.factors(p.values,p.width,p.height,p.patch,p.weights,p.quarter,p.fullBounds);
 else throw Error('Unknown SIFT stream stage');
 result.heapBytes=math.heapBytes;self.postMessage({result},Object.values(result).filter(v=>ArrayBuffer.isView(v)).map(v=>v.buffer));
 }catch(e){self.postMessage({error:{code:e.code??'NUMERIC_RANGE',message:e.message}});}};
