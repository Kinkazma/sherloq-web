import {parameters,gray,rows,round2} from './pixel-utils.js';
export const histogramParams=(p={})=>parameters(p,{channel:3,start:0,end:255},{channel:[0,3],start:[0,255],end:[0,255]});
export function histogramSummary(bins,channel,start,end,total){
 [start,end]=[Math.min(start,end),Math.max(start,end)];
 const counts=bins.subarray(channel*256+start,channel*256+end+1),length=counts.length;
 let count=0,weighted=0,empty=0,min=Infinity,max=-1,argmin=start,argmax=start,first=-1,last=-1;
 for(let j=0;j<length;j++){
  const v=counts[j];count+=v;weighted+=(j+start)*v;
  if(v<min){min=v;argmin=j+start;}if(v>max){max=v;argmax=j+start;}
  if(v){if(first<0)first=j+start;last=j+start;}else empty++;
 }
 if(!count)return {start,end,argmin:0,argmax:0,mean:0,stddev:0,median:0,count:0,percent:0,nonzero:[],empty,smoothness:0,fullness:0};
 const mean=round2(weighted/count);let variance=0,sum=0,median=start,found=false,smoothness=0;
 for(let j=0;j<length;j++){
  variance+=(j+start-mean)**2*counts[j];sum+=counts[j];
  if(!found&&sum>count/2){median=j+start;found=true;}
 }
 if(length>=5){
  for(let j=2;j<length-2;j++)smoothness+=Math.abs(counts[j]/max-((2*(counts[j-1]/max)-counts[j-2]/max)+(2*(counts[j+1]/max)-counts[j+2]/max))/2);
  smoothness=round2((1-smoothness/(length-2))*100);
 }
 return {start,end,argmin,argmax,mean,stddev:round2(Math.sqrt(variance/count)),median,count,percent:round2(count/total*100),nonzero:[first,last],empty,smoothness,fullness:round2(count/(length*max)*100)};
}
export async function histogram(image,p,hooks={}){
 const bins=new Float64Array(1024),seen=new Uint8Array(1<<21);let unique=0;
 await rows(image.height,hooks,y=>{
  for(let i=y*image.width*3,end=i+image.width*3;i<end;i+=3){
   const r=image.data[i],g=image.data[i+1],b=image.data[i+2],code=(r<<16)|(g<<8)|b,slot=code>>>3,bit=1<<(code&7);
   bins[r]++;bins[256+g]++;bins[512+b]++;bins[768+gray(r,g,b)]++;
   if(!(seen[slot]&bit)){seen[slot]|=bit;unique++;}
  }
 });
 const cumulative=new Float64Array(1024);
 for(let c=0;c<4;c++){let sum=0;for(let j=0;j<256;j++){sum+=bins[c*256+j];cumulative[c*256+j]=sum;}}
 const total=image.width*image.height;
 return {data:{channels:['red','green','blue','value'],bins,cumulative,uniqueColors:unique,uniqueRatio:round2(unique/total*100),summary:histogramSummary(bins,p.channel,p.start,p.end,total)},semantics:'Exact integer histogram counts held in float64; value uses native uint8 luminance. Plot log/smoothing do not modify counts.'};
}
