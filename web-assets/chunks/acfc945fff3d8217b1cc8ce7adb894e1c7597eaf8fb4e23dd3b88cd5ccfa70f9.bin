import {requireValue,checkAbort} from './errors.js';
import {TRUFOR_PALETTE} from './trufor-palette.js';
import {energyQuantile} from './energy-prepare.js';
const f=Math.fround,clip=x=>Math.max(0,Math.min(1,x));
/** Native display semantics; returned RGB bytes are owned by the caller. */
export async function renderTrufor(data,view,{budget,signal,onProgress}={}){
  requireValue(['map','confidence','noiseprint_pp'].includes(view),'Unknown TruFor display.');
  const {width,height}=data,n=width*height,values=data[view];
  requireValue(values instanceof Float32Array&&values.length===n,'Invalid TruFor map.');
  const release=budget?.reserve(n*3);let scratch;
  try{
    checkAbort(signal);scratch=view==='noiseprint_pp'?budget?.reserve(n*4):undefined;let low,denominator;
    if(view==='noiseprint_pp'){
      const sorted=values.slice().sort();low=f(energyQuantile(sorted,n,.01));
      denominator=f(Math.max(energyQuantile(sorted,n,.99)-energyQuantile(sorted,n,.01),1e-8));
    }
    scratch?.();const out=new Uint8Array(n*3);
    for(let i=0;i<n;i++){
      if(i%65536===0){checkAbort(signal);onProgress?.({phase:'render',fraction:i/n});await new Promise(r=>setTimeout(r,0));}
      requireValue(Number.isFinite(values[i]),'Nonfinite TruFor output.');
      if(view==='map'){
        const index=Math.min(255,Math.trunc(f(clip(values[i])*256)))*3;out.set(TRUFOR_PALETTE.subarray(index,index+3),i*3);
      }else{
        const value=view==='confidence'?clip(values[i]):clip(f(f(values[i]-low)/denominator));
        const gray=Math.trunc(f(value*255));out[i*3]=out[i*3+1]=out[i*3+2]=gray;
      }
    }
    checkAbort(signal);return {width,height,format:'rgb8',data:out,release:release??(()=>{})};
  }catch(e){release?.();throw e;}finally{scratch?.();}
}
