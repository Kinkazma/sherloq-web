import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from '../../src/errors.js';
import {requireStrictFragmentPlan} from './strict-fragment-plan.js';

const f=Math.fround;
function refs(plan,input){
 requireStrictFragmentPlan(plan);const n=input?.width*input?.height;
 requireValue(Number.isSafeInteger(input?.width)&&Number.isSafeInteger(input?.height)&&input.width>0&&input.height>0&&input.width<=plan.modelSide&&input.height<=plan.modelSide&&input.fragments instanceof Int32Array&&input.x instanceof Float32Array&&input.y instanceof Float32Array&&[input.fragments,input.x,input.y].every(a=>a.length===n),'Strict target references must retain a complete native coordinate field.');
 for(let i=0;i<n;i++)requireValue(plan.fragments[input.fragments[i]]&&Number.isFinite(input.x[i])&&Number.isFinite(input.y[i])&&input.x[i]>=0&&input.x[i]<=plan.modelSide-1&&input.y[i]>=0&&input.y[i]<=plan.modelSide-1,'A strict target must address an existing fragment on its full 448 grid.');
 return n;
}
/** Original-native positions select an existing fragment. If interpolation
 * crosses a real hole, only an actual surviving corner/candidate can replace
 * it, matching the existing scientific evaluator's explicit projection rule. */
export function resolveStrictOriginalReference(plan,x,y,{fallback=[]}={}){
 requireStrictFragmentPlan(plan);requireValue(Number.isFinite(x)&&Number.isFinite(y)&&Array.isArray(fallback),'A finite original target is required.');let fragment=plan.locateOriginal(x,y),projected=false;
 if(!fragment){let best=Infinity,chosen;for(const candidate of fallback){const target=plan.fragments[candidate?.fragment];requireValue(target&&Number.isFinite(candidate.x)&&Number.isFinite(candidate.y)&&candidate.x>=0&&candidate.x<=plan.modelSide-1&&candidate.y>=0&&candidate.y<=plan.modelSide-1,'Strict interpolation fallback must be an actual admissible target.');const p=plan.toOriginal(target,candidate.x,candidate.y),distance=(p[0]-x)**2+(p[1]-y)**2;if(distance<best){best=distance;chosen={target,candidate};}}if(!chosen)throw new EngineError('SOURCE_SCOPE_TARGET_UNSUPPORTED','A correspondence crossed an excluded source region and has no surviving native candidate.');return{fragment:chosen.target.index,x:f(chosen.candidate.x),y:f(chosen.candidate.y),projected:true};}
 const local=plan.fromOriginal(fragment,x,y);return{fragment:fragment.index,x:f(Math.max(0,Math.min(plan.modelSide-1,local[0]))),y:f(Math.max(0,Math.min(plan.modelSide-1,local[1]))),projected};
}
/** The resize callback is the qualified native align_corners operator. A
 * discrete fragment ID is NEVER interpolated or rounded into another owner. */
export async function resizeStrictTargetReferences(plan,input,{width,height,budget,resize,signal}={}){
 const n=refs(plan,input);requireValue(budget?.reserve&&typeof resize==='function'&&[width,height].every(v=>Number.isSafeInteger(v)&&v>1&&v<=plan.modelSide),'Strict target resize requires the native FP32 resize and shared budget.');checkAbort(signal);
 const source=allocateOwnedTypedArray(Float32Array,2*n,{budget,owner:'d2prl',label:'strict-target-original-coordinates'}),ownership=[];let resized,complete=false;
 try{
  // One owner uses the original native coordinate operator directly. An
  // unnecessary native→original→native affine round-trip would alter low bits.
  const owner=input.fragments.every(id=>id===input.fragments[0])?input.fragments[0]:null;
  for(let i=0;i<n;i++){if((i&4095)===0)await controlCheckpoint(signal);const coordinates=owner===null?plan.toOriginal(input.fragments[i],input.x[i],input.y[i]):[input.x[i],input.y[i]];source.data[i]=f(coordinates[0]);source.data[n+i]=f(coordinates[1]);}
  resized=await resize({data:source.data,shape:[1,2,input.height,input.width],outHeight:height,outWidth:width},{signal});requireValue(resized?.data instanceof Float32Array&&resized.data.length===2*width*height&&typeof resized.release==='function','Native strict coordinate resize returned another grid.');
  const count=width*height,own=(Type,label)=>{const value=allocateOwnedTypedArray(Type,count,{budget,owner:'d2prl',label});ownership.push(value);return value;},ids=own(Int32Array,'strict-target-fragments'),x=own(Float32Array,'strict-target-x'),y=own(Float32Array,'strict-target-y');let projected=0;
  for(let row=0;row<height;row++){await controlCheckpoint(signal);const sy=f(f((input.height-1)/(height-1))*row),y0=Math.min(input.height-1,Math.floor(sy)),y1=Math.min(input.height-1,y0+1);
   for(let col=0;col<width;col++){const sx=f(f((input.width-1)/(width-1))*col),x0=Math.min(input.width-1,Math.floor(sx)),x1=Math.min(input.width-1,x0+1),at=row*width+col,corners=[y0*input.width+x0,y0*input.width+x1,y1*input.width+x0,y1*input.width+x1],fallback=corners.map(i=>({fragment:input.fragments[i],x:input.x[i],y:input.y[i]})),target=owner===null?resolveStrictOriginalReference(plan,resized.data[at],resized.data[count+at],{fallback}):{fragment:owner,x:resized.data[at],y:resized.data[count+at],projected:false};requireValue(target.x>=0&&target.x<=plan.modelSide-1&&target.y>=0&&target.y<=plan.modelSide-1,'Native target resize escaped its fragment grid.');ids.data[at]=target.fragment;x.data[at]=target.x;y.data[at]=target.y;projected+=target.projected;}
  }
  checkAbort(signal);complete=true;let closed=false;return{fragments:ids.data,x:x.data,y:y.data,width,height,projected,policy:'Native original-coordinate resize; actual admissible corner selected if the interpolation crosses an excluded domain; fragment IDs never interpolated',release(){if(closed)return;closed=true;for(const value of ownership)value.release();}};
 }finally{source.release();resized?.release();if(!complete)for(const value of ownership)value.release();}
}
// Pinned role graph: (coordinate-223.5)/223.5, followed by native
// align_corners unnormalization on the feature grid. Preserve each FP32 step.
const featureCoordinate=(value,size,MODEL_SIDE)=>f(f(f(f(f(value-f((MODEL_SIDE-1)*.5))/f((MODEL_SIDE-1)*.5))+1)*.5)*(size-1));
/** Read remote features/union/role planes from their TRUE crop owner. Missing
 * fields or references are errors, never zero-filled model observations. The
 * only zero boundary here is the native GridSample mathematical padding. */
export async function sampleStrictFragmentField(plan,bank,input,{field,budget,signal}={}){
 const count=refs(plan,input);requireValue(typeof field==='string'&&budget?.reserve&&bank?.planFingerprint===plan.fingerprint,'A source-matched strict tensor bank is required.');checkAbort(signal);const metadata=budget.reserve(count*16+4096),groups=new Map();let output,complete=false;
 try{
  for(let i=0;i<count;i++){const id=input.fragments[i];if(!groups.has(id))groups.set(id,[]);groups.get(id).push(i);}
  let channels;
  for(const [id,indices]of groups){await controlCheckpoint(signal);const tensor=await bank.read(id,field,{signal});
   try{
    const [batch,c,height,width]=tensor.shape;requireValue(batch===1&&tensor.dtype==='float32'&&c<=448&&height>1&&width>1,'The strict role sampler requires a complete native FP32 tensor.');if(channels===undefined){channels=c;output=allocateOwnedTypedArray(Float32Array,channels*count,{budget,owner:'d2prl',label:'strict-remote-'+field});}requireValue(c===channels,'Remote fragments use incompatible feature channels.');const plane=height*width;
    for(let row=0;row<indices.length;row++){
     if((row&127)===0)await controlCheckpoint(signal);const at=indices[row],px=featureCoordinate(input.x[at],width,plan.modelSide),py=featureCoordinate(input.y[at],height,plan.modelSide),x0=Math.floor(px),y0=Math.floor(py),x1=x0+1,y1=y0+1,nw=f(f(x1-px)*f(y1-py)),ne=f(f(px-x0)*f(y1-py)),sw=f(f(x1-px)*f(py-y0)),se=f(f(px-x0)*f(py-y0));
     for(let channel=0;channel<channels;channel++){
      const base=channel*plane;let value=0;if(x0>=0&&x0<width&&y0>=0&&y0<height)value=f(value+f(tensor.data[base+y0*width+x0]*nw));if(x1>=0&&x1<width&&y0>=0&&y0<height)value=f(value+f(tensor.data[base+y0*width+x1]*ne));if(x0>=0&&x0<width&&y1>=0&&y1<height)value=f(value+f(tensor.data[base+y1*width+x0]*sw));if(x1>=0&&x1<width&&y1>=0&&y1<height)value=f(value+f(tensor.data[base+y1*width+x1]*se));output.data[channel*count+at]=value;
     }
    }
   }finally{tensor.release();}
  }
  checkAbort(signal);complete=true;return{data:output.data,shape:[1,channels,input.height,input.width],release:output.release,policy:'Admitted fragment tensors sampled remotely; native FP32 align_corners/GridSample arithmetic candidate, numerical qualification required before product dispatch'};
 }finally{metadata();if(!complete)output?.release();}
}
