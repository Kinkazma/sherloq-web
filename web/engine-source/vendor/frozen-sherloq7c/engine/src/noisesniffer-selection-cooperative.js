import {numpyArgsortCooperative} from './numpy-argsort-cooperative.js';
import {numpySum} from './numpy-sum.js';
import {checkAbort,createCooperator} from './errors.js';
const bankers=x=>{const f=Math.floor(x),r=x-f;return r===.5?f+f%2:Math.round(x);};
// Same selection loops and unstable NumPy sort order, with bounded checkpoints.
export async function selectNoisesnifferCooperative(image,w,b,n,m,stats,{signal}={}){
 checkAbort(signal);const {valid,means,variance}=stats;if(!valid.length)return{selected:new Uint32Array(),low_noise:new Uint32Array()};
 const cooperate=createCooperator(signal),sort=values=>numpyArgsortCooperative(values,{signal,cooperate});
 b=Math.floor(valid.length/Math.max(1,bankers(valid.length/b)));const bins=bankers(valid.length/b),V=[],S=[],cols=image.width-w+1,N=stats.width*stats.height,meanValues=new Float64Array(valid.length),block=new Float64Array(w*w),squares=new Float64Array(w*w);
 for(let c=0;c<3;c++){
  for(let i=0;i<valid.length;i++){meanValues[i]=means[valid[i]*3+c];if((i&16383)===0)await cooperate();}
  const order=await sort(meanValues),ordered=new Uint32Array(order.length);for(let i=0;i<order.length;i++){ordered[i]=valid[order[i]];if((i&16383)===0)await cooperate();}
  for(let bin=0;bin<bins;bin++){
   const ids=ordered.subarray(bin*b,bin===bins-1?valid.length:(bin+1)*b),values=new Float32Array(ids.length);for(let i=0;i<ids.length;i++){values[i]=variance[c*N+ids[i]];if((i&16383)===0)await cooperate();}
   const choice=(await sort(values)).subarray(0,Math.trunc(b*n)),chosen=new Uint32Array(choice.length);for(let i=0;i<choice.length;i++){chosen[i]=ids[choice[i]];if((i&16383)===0)await cooperate();}const std=new Float64Array(chosen.length);let flat=0;
   for(let i=0;i<chosen.length;i++){
    const y=Math.floor(chosen[i]/cols),x=chosen[i]%cols;
    for(let dy=0;dy<w;dy++)for(let dx=0;dx<w;dx++)block[dy*w+dx]=image.data[((y+dy)*image.width+x+dx)*3+c];
    const mean=numpySum(block)/block.length;for(let j=0;j<block.length;j++){const d=block[j]-mean;squares[j]=d*d;}
    std[i]=Math.sqrt(numpySum(squares)/squares.length);if(std[i]===0)flat++;if((i&255)===0)await cooperate();
   }
   const limit=Math.trunc(b*n*m);if(flat<limit){const sorted=await sort(std);for(let i=0;i<sorted.length;i++){const id=chosen[sorted[i]];V.push(id);if(i<limit)S.push(id);if((i&4095)===0)await cooperate();}}
  }
 }
 checkAbort(signal);return{selected:Uint32Array.from(V),low_noise:Uint32Array.from(S)};
}
