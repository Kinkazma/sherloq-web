import {requireValue} from '../../src/errors.js';
const f=Math.fround,buffer=new ArrayBuffer(4),bits=new DataView(buffer);
// IEEE binary16 round-to-nearest-even, used only to reproduce the evaluator's
// coordinate sampler. Descriptor arithmetic remains in the pinned WASM kernel.
function half(value){bits.setFloat32(0,value,true);const u=bits.getUint32(0,true),sign=u>>>31?-1:1,e=((u>>>23)&255)-127,m=u&0x7fffff;let q;
 if(e< -25)return sign*0;if(e< -14){const shift=-e-1,all=m|0x800000,step=2**shift;q=all/step;const lo=Math.floor(q),r=q-lo;q=lo+(r>.5||r===.5&&(lo&1)?1:0);return sign*q*2**-24;}
 q=m/8192;const lo=Math.floor(q),r=q-lo;q=lo+(r>.5||r===.5&&(lo&1)?1:0);return sign*(1+q/1024)*2**e;
}
function sampled(value,coordinate,side){const extent=(side-1)*.5,g=half(f(f(Math.max(0,Math.min(side-1,f(coordinate+value)))-extent)/extent));return f(f(f(g+1)*.5)*(side-1));}
export function scientificTargetAllowed(mask,side,index,dx,dy){
 if(!mask[index])return false;const px=sampled(dx,index%side,side),py=sampled(dy,Math.floor(index/side),side),x0=Math.floor(px),y0=Math.floor(py),fx=f(px-x0),fy=f(py-y0);
 for(const [x,y,weight]of [[x0,y0,f(f(1-fx)*f(1-fy))],[x0+1,y0,f(fx*f(1-fy))],[x0,y0+1,f(f(1-fx)*fy)],[x0+1,y0+1,f(fx*fy)]])if(weight>0&&x>=0&&y>=0&&x<side&&y<side&&!mask[y*side+x])return false;
 return true;
}
/** Evaluate only real admissible sources and admissible target interpolation
 * supports. Consecutive equal candidate sets share one native call; global
 * indices and the surviving candidate order remain those of the original ABI. */
export function evaluateScopedNativeTile(module,{pointer,xp,yp,out,side,channels,candidates,begin,end,referenceThreads,offsetX,offsetY,mask}){
 const count=end-begin;requireValue(mask instanceof Uint8Array&&mask.length===side*side,'Original native-grid scientific membership required');
 const x=new Float32Array(count),y=new Float32Array(count),patterns=new Uint16Array(count);let evaluatedSources=0,rejectedSources=0,rejectedCandidates=0,nativeCalls=0,projectedOutputs=0;
 for(let at=0;at<count;at++){const index=begin+at;if(!mask[index]){rejectedSources++;continue;}let pattern=0;for(let k=0;k<candidates;k++)if(scientificTargetAllowed(mask,side,index,offsetX[k*count+at],offsetY[k*count+at]))pattern|=1<<k;else rejectedCandidates++;patterns[at]=pattern;}
 for(let first=0;first<count;){const pattern=patterns[first];let last=first+1;while(last<count&&patterns[last]===pattern)last++;
  if(pattern){const slots=[];for(let k=0;k<candidates;k++)if(pattern&(1<<k))slots.push(k);const length=last-first;
   for(let k=0;k<slots.length;k++){const from=slots[k]*count+first;module.HEAPF32.set(offsetX.subarray(from,from+length),xp/4+k*length);module.HEAPF32.set(offsetY.subarray(from,from+length),yp/4+k*length);}
   requireValue(module._d2prl_evaluate_tile(pointer,xp,yp,side,channels,slots.length,begin+first,begin+last,out,out+length*4,referenceThreads)===1,'Scoped native evaluator rejected');nativeCalls++;evaluatedSources+=length;
   x.set(module.HEAPF32.subarray(out/4,out/4+length),first);y.set(module.HEAPF32.subarray(out/4+length,out/4+2*length),first);
   for(let at=first;at<last;at++)if(!scientificTargetAllowed(mask,side,begin+at,x[at],y[at])){let best=Infinity,chosen=-1;for(const k of slots){const dx=offsetX[k*count+at]-x[at],dy=offsetY[k*count+at]-y[at],d=dx*dx+dy*dy;if(d<best){best=d;chosen=k;}}x[at]=offsetX[chosen*count+at];y[at]=offsetY[chosen*count+at];projectedOutputs++;}
  }
  first=last;
 }
 return {x,y,stats:{evaluatedSources,rejectedSources,rejectedCandidates,nativeCalls,projectedOutputs,unmatchedSources:count-rejectedSources-evaluatedSources,policy:'source centres and nonzero native bilinear target support before native scoring; weighted outputs crossing exclusions select the closest surviving candidate'}};
}
