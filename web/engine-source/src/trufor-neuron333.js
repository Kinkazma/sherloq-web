import {requireValue,checkAbort,createCooperator} from './errors.js';

// This empirical readout describes one neuron's response. It is not the
// original TruFor classifier, confidence, or image-level authenticity score.
export const TRUFOR_NEURON333=Object.freeze({index:333,layer:'decode_head.linear_fuse',activation:'post-ReLU',coefficient:2.834346325108858,bias:-4.3996579849141835,interpretation:'empirical single-channel diagnostic response; not calibrated forgery probability'});

/** A lazy native-grid view of the retained quarter-grid activation.
 * Interpolate BEFORE the sigmoid (PyTorch align_corners=False convention).
 * No model invocation or native-sized retained plane is involved.
 */
export function truforNeuron333Field(activation,width,height,{budget}={}){
 requireValue(activation?.channels===1&&typeof activation.readInto==='function'&&[width,height].every(v=>Number.isSafeInteger(v)&&v>0),'Invalid neuron 333 grid.');
 const aw=activation.width,ah=activation.height,length=width*height,f=Math.fround;
 async function readInto(out,offset=0,{signal}={}){
  requireValue(out instanceof Float32Array&&Number.isSafeInteger(offset)&&offset>=0&&offset+out.length<=length,'Invalid neuron 333 read window.');checkAbort(signal);
  const release=budget.reserve(aw*8),cooperate=createCooperator(signal);
  try{
   const rows=[new Float32Array(aw),new Float32Array(aw)],indices=[-1,-1];let done=0;
   while(done<out.length){await cooperate();const at=offset+done,y=Math.floor(at/width),x=at-y*width,n=Math.min(width-x,out.length-done);
    const sy=Math.max(0,Math.min(ah-1,f(f((y+.5)*f(ah/height))-.5))),y0=Math.floor(sy),y1=Math.min(ah-1,y0+1),dy=sy-y0;
    const aSlot=indices.indexOf(y0)>=0?indices.indexOf(y0):(indices[0]===y1?1:0);
    if(indices[aSlot]!==y0){await activation.readInto(rows[aSlot],y0*aw,{signal});indices[aSlot]=y0;}
    const bSlot=y0===y1?aSlot:1-aSlot;
    if(indices[bSlot]!==y1){await activation.readInto(rows[bSlot],y1*aw,{signal});indices[bSlot]=y1;}
    for(let i=0;i<n;i++){
     const sx=Math.max(0,Math.min(aw-1,f(f((x+i+.5)*f(aw/width))-.5))),x0=Math.floor(sx),x1=Math.min(aw-1,x0+1),dx=sx-x0;
     const a=f(f(rows[aSlot][x0]*f(1-dx))+f(rows[aSlot][x1]*dx)),b=f(f(rows[bSlot][x0]*f(1-dx))+f(rows[bSlot][x1]*dx)),v=f(f(a*f(1-dy))+f(b*dy));
     requireValue(Number.isFinite(v),'Nonfinite neuron 333 activation.');out[done+i]=1/(1+Math.exp(-(TRUFOR_NEURON333.coefficient*v+TRUFOR_NEURON333.bias)));
    }
    done+=n;
   }
   checkAbort(signal);return out;
  }finally{release();}
 }
 return Object.freeze({channels:1,width,height,length,byteLength:length*4,elementType:'Float32Array',storage:'derived-from-retained-neuron333',readInto,
  async readBytes(out,offset=0,options={}){
   requireValue(out instanceof Uint8Array&&Number.isSafeInteger(offset)&&offset>=0&&offset+out.length<=length*4,'Invalid neuron 333 byte window.');
   const start=Math.floor(offset/4),end=Math.ceil((offset+out.length)/4),release=budget.reserve((end-start)*4);
   try{const values=await readInto(new Float32Array(end-start),start,options);out.set(new Uint8Array(values.buffer,offset-start*4,out.length));return out;}finally{release();}
  }});
}
