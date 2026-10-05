// Histogram counts are invariant to EXIF's lossless permutation of RGB pixels.
// Iterate the original decoded grid without reconstructing an oriented image.
import {gray,round2} from './pixel-utils.js';import {histogramSummary} from './histogram.js';import {checkAbort,requireValue} from './errors.js';
export async function segmentedHistogram(store,p,{budget,signal,onProgress}={}){
 requireValue(store.byteLength%3===0,'RGB byte storage length must be divisible by three.');
 const release=budget.reserve((1<<21)+2*1024*8+3);try{
  const bins=new Float64Array(1024),seen=new Uint8Array(1<<21),pixel=new Uint8Array(3);let unique=0,channel=0;
  await store.visit((bytes,offset)=>{for(let i=0;i<bytes.length;i++){pixel[channel++]=bytes[i];if(channel===3){const r=pixel[0],g=pixel[1],b=pixel[2],code=(r<<16)|(g<<8)|b,slot=code>>>3,bit=1<<(code&7);bins[r]++;bins[256+g]++;bins[512+b]++;bins[768+gray(r,g,b)]++;if(!(seen[slot]&bit)){seen[slot]|=bit;unique++;}channel=0;}}onProgress?.((offset+bytes.length)/store.byteLength);},{signal});checkAbort(signal);
  const cumulative=new Float64Array(1024);for(let c=0;c<4;c++){let sum=0;for(let i=0;i<256;i++){sum+=bins[c*256+i];cumulative[c*256+i]=sum;}}
  const total=store.byteLength/3;return {data:{channels:['red','green','blue','value'],bins,cumulative,uniqueColors:unique,uniqueRatio:round2(unique/total*100),summary:histogramSummary(bins,p.channel,p.start,p.end,total)},semantics:'Exact global integer histogram counts held in float64; value uses native uint8 luminance. EXIF pixel permutation leaves these counts unchanged. Plot log/smoothing do not modify counts.'};
 }finally{release();}
}
