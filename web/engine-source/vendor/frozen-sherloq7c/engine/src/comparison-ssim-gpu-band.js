import {createSsimGaussianGpu} from './comparison-ssim-gpu.js';
import {gray} from './pixel-utils.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** Same five Gaussian fields and binary64 point formula as comparison.h.
 * RGB preparation and the final formula remain ordered CPU binary64. Only
 * positive Gaussian FMA/add/multiply move to the exact integer GPU kernel. */
export async function createSsimGpuBand({budget}={}){
 const gpu=await createSsimGaussianGpu({budget});let busy=false,disposed=false,pending,closing;const life=new AbortController();
 return{
  async run({width,height,first,second,top,rows},{signal}={}){
   if(disposed)throw new EngineError('DISPOSED','SSIM GPU band is closed.');if(busy)throw new EngineError('BUSY','SSIM GPU band is busy.');const n=width*height,count=width*rows,combined=signal?AbortSignal.any([signal,life.signal]):life.signal;
   requireValue(Number.isSafeInteger(n)&&n>0&&n<=1048576&&first instanceof Uint8Array&&second instanceof Uint8Array&&first.length===n*3&&second.length===n*3&&Number.isInteger(top)&&top>=0&&Number.isInteger(rows)&&rows>0&&top+rows<=height,'Invalid SSIM GPU RGB band.');checkAbort(combined);busy=true;let finish;pending=new Promise(r=>finish=r);
   let temporary,resultRelease,resultBacking,returned=false;const maps=[];
   try{
    temporary=budget.reserve(n*24);resultRelease=budget.reserve(count*8);const x=new Float64Array(n),y=new Float64Array(n),scratch=new Float64Array(n);let stamp=performance.now();
    for(let i=0;i<n;i++){const at=i*3;x[i]=gray(first[at],first[at+1],first[at+2]);y[i]=gray(second[at],second[at+1],second[at+2]);if((i&8191)===0&&performance.now()-stamp>8){await controlCheckpoint(combined);stamp=performance.now();}}
    maps.push(await gpu.run(x,width,height,{signal:combined}));maps.push(await gpu.run(y,width,height,{signal:combined}));
    for(let field=0;field<3;field++){for(let i=0;i<n;i++)scratch[i]=field===0?x[i]*x[i]:field===1?y[i]*y[i]:x[i]*y[i];checkAbort(combined);maps.push(await gpu.run(scratch,width,height,{signal:combined}));}
    let values=new Float64Array(count);const [ux,uy,vx,vy,cov]=maps.map(m=>m.data),offset=top*width;
    for(let i=0;i<count;i++){const at=offset+i,a=ux[at],b=uy[at],a2=a*a,b2=b*b,ab=a*b,va=vx[at]-a2,vb=vy[at]-b2,c=cov[at]-ab;values[i]=((2*ab+6.5025)*(2*c+58.5225))/((a2+b2+6.5025)*(va+vb+58.5225));if((i&8191)===0&&performance.now()-stamp>8){await controlCheckpoint(combined);stamp=performance.now();}}
    checkAbort(combined);resultBacking=budget.registerBacking?.('array-buffer',count*8,{owner:'comparison',label:'ssim-exact-native-band'});returned=true;let alive=true;return{values,heapBytes:0,release(){if(alive){alive=false;resultBacking?.();resultRelease();values=null;}}};
   }finally{for(const map of maps)map.release();temporary?.();if(!returned){resultBacking?.();resultRelease?.();}busy=false;finish();}
  },get metrics(){return{...gpu.metrics};},dispose(){if(closing)return closing;disposed=true;life.abort();const task=(async()=>{await pending;await gpu.dispose();})();closing=task;void task.finally(()=>{if(closing===task)closing=null;}).catch(()=>{});return task;}
 };
}
