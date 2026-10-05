import {elaBase,elaRender,validateParams} from './ela.js';
import {checkpoint} from './errors.js';
export async function toneTable(params,hooks={}) {
 const a=new Uint8Array(65536),b=new Uint8Array(65536);
 for(let i=0;i<a.length;i++){a[i]=i>>8;b[i]=i&255;}
 const base=await elaBase(a,b,params.linear,hooks);
 return elaRender(base,{...params,grayscale:false},hooks);
}
export async function fusedCpu(a,b,params,table,{signal}={}) {
 const p=validateParams(params),out=new Uint8Array(a.length);
 for(let start=0;start<out.length;start+=196608){await checkpoint(signal);const end=Math.min(out.length,start+196608);
  for(let i=start;i<end;i++)out[i]=table[(a[i]<<8)|b[i]];
  if(p.grayscale)for(let i=start;i<end;i+=3){const y=(out[i]*9798+out[i+1]*19235+out[i+2]*3735+16384)>>15;out[i]=out[i+1]=out[i+2]=y;}
 }return out;
}
