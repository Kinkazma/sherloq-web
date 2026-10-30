import "../../runtime-context.js?v=0.30.0";
import {gray} from './pixel-utils.js';
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
export const PDF_EFFECT_STATISTICS_BYTES=(5*256+8*257)*4;
// Exact sufficient statistics of the immutable canonical prefix. Threshold,
// inversion and enhancement changes need no second walk over the page RGB.
export function createPdfRetainedEffectStatistics({budget}={}){
 requireValue(typeof budget?.reserve==='function','A PDF statistics Budget is required.');const credit=budget.reserve(PDF_EFFECT_STATISTICS_BYTES);let hist,differences;
 try{hist=Array.from({length:5},()=>new Uint32Array(256));differences=new Int32Array(8*257);}catch(error){credit();throw error;}
 let count=0,closed=false,closing=false,sealed=false,poisoned=false,running=null,closeTask=null;
 const alive=()=>{if(closing||closed)throw new EngineError('CANCELLED','PDF effect statistics released.');requireValue(!poisoned,'Incomplete interrupted PDF statistics.');};
 function own(Type,length){const release=budget.reserve(length*Type.BYTES_PER_ELEMENT);try{const data=new Type(length);let closed=false;return{data,release(){if(closed)return;closed=true;release();}};}catch(error){release();throw error;}}
 function interval(mask,lo,hi){if(lo<hi){differences[mask*257+lo]++;differences[mask*257+hi]--;}}
 return{get count(){return count;},get bytes(){return closed?0:PDF_EFFECT_STATISTICS_BYTES;},
  append(bytes,{signal}={}){alive();requireValue(!sealed&&!running&&bytes instanceof Uint8Array&&bytes.length%3===0&&count+bytes.length/3<=2147483647,'Invalid canonical PDF prefix population.');const cooperate=createCooperator(signal);const execute=async()=>{try{checkAbort(signal);
   for(let i=0;i<bytes.length;i+=3){if(i%12288===0){await cooperate();alive();}const r=bytes[i],g=bytes[i+1],b=bytes[i+2];hist[0][r]++;hist[1][g]++;hist[2][b]++;hist[3][gray(r,g,b)]++;hist[4][gray(255-r,255-g,255-b)]++;
    const a=Math.min(r,g,b),c=Math.max(r,g,b),m=r+g+b-a-c;let mask=(r>0?1:0)|(g>0?2:0)|(b>0?4:0),lo=0;
    if(a>0&&a<255){interval(mask,lo,a);lo=a;mask&=~((r===a?1:0)|(g===a?2:0)|(b===a?4:0));}
    if(m>lo&&m<255){interval(mask,lo,m);lo=m;mask&=~((r===m?1:0)|(g===m?2:0)|(b===m?4:0));}
    if(c>lo&&c<255){interval(mask,lo,c);lo=c;mask&=~((r===c?1:0)|(g===c?2:0)|(b===c?4:0));}
    interval(mask,lo,255);
   }checkAbort(signal);alive();count+=bytes.length/3;
   }catch(error){poisoned=true;throw error;}};const task=execute();running=task;task.then(()=>{running=null;},()=>{running=null;});return task;
  },
  seal(){alive();requireValue(count>0&&!running,'Empty canonical PDF prefix statistics.');sealed=true;},
  grayHistogram(){alive();requireValue(sealed,'Incomplete PDF statistics.');const result=own(Int32Array,256);result.data.set(hist[3]);return result;},
  histograms({threshold=255,invert=false}={}){alive();requireValue(sealed&&Number.isInteger(threshold)&&threshold>=0&&threshold<=255&&typeof invert==='boolean','Invalid PDF end-state statistics.');const owned=own(Uint32Array,4*256),output=Array.from({length:4},(_,c)=>owned.data.subarray(c*256,(c+1)*256));
   if(threshold===255){for(let c=0;c<3;c++)for(let value=0;value<256;value++)output[c][invert?255-value:value]=hist[c][value];output[3].set(hist[invert?4:3]);return{data:output,release:owned.release};}
   for(let mask=0;mask<8;mask++){let population=0;for(let t=0;t<=threshold;t++)population+=differences[mask*257+t];requireValue(population>=0&&population<=count,'Invalid PDF threshold population.');const pattern=invert?mask^7:mask,r=pattern&1?255:0,g=pattern&2?255:0,b=pattern&4?255:0;output[0][r]+=population;output[1][g]+=population;output[2][b]+=population;output[3][gray(r,g,b)]+=population;}
   return{data:output,release:owned.release};
  },
  close(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;closeTask=(async()=>{if(running)await Promise.allSettled([running]);closed=true;hist=null;differences=null;credit();})();return closeTask;}
 };
}
