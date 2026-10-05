// CPU reference segmentation, preserving disconnected support and panel identity.
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
const f=Math.fround;
export async function segmentEnergy(base,{threshold=5,thresholds=null,minimum=3,offset=0}={}, {signal,account=()=>{},onProgress}={}){
 const {width:w,height:h,energy_scope:scope,energy_low_score:low,energy_high_score:high,energy_summary:summaries,energy_allowed:allowed,metadata}=base,n=w*h,block=metadata?.block,limits=thresholds??[threshold,threshold];
 requireValue(Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&n<2**31&&scope instanceof Int32Array&&scope.length===n&&low instanceof Float32Array&&low.length===n&&high instanceof Float32Array&&high.length===n&&Array.isArray(summaries),'Prepared energy maps required');
 requireValue(Array.isArray(limits)&&limits.length===2&&limits.every(t=>Number.isFinite(t)&&t>=0)&&Number.isFinite(minimum)&&minimum>=0&&Number.isInteger(block)&&block>0&&Number.isSafeInteger(block*block)&&Number.isInteger(offset)&&offset>=0&&offset+summaries.length*2<2**31,'Invalid energy segmentation parameters');
 requireValue(allowed===undefined||(allowed instanceof Uint8Array&&allowed.length===n),'Invalid allowed mask');checkAbort(signal);
 let lastYield=performance.now();const checkpoint=async()=>{checkAbort(signal);if(performance.now()-lastYield>=8){await controlCheckpoint(signal);lastYield=performance.now();}};
 for(let i=0;i<n;i++){requireValue(Number.isFinite(low[i])&&Number.isFinite(high[i])&&low[i]>=0&&high[i]>=0,'Finite nonnegative scores required');if((i&8191)===0)await checkpoint();}
 account(18*n+8192);const labels=new Int32Array(n),weak=new Uint8Array(n),selected=new Uint8Array(n),queue=new Uint32Array(n),values=new Float32Array(n),temporary=new Float32Array(n),hist=new Uint32Array(256),positions=new Uint32Array(256),regions=[];
 async function median(count){let a=new Uint32Array(values.buffer),b=new Uint32Array(temporary.buffer);for(let shift=0;shift<32;shift+=8){hist.fill(0);for(let i=0;i<count;i++){hist[(a[i]>>>shift)&255]++;if((i&8191)===0)await checkpoint();}let total=0;for(let j=0;j<256;j++){positions[j]=total;total+=hist[j];}for(let i=0;i<count;i++){const word=a[i];b[positions[(word>>>shift)&255]++]=word;if((i&8191)===0)await checkpoint();}[a,b]=[b,a];}const middle=count>>1;return count%2?values[middle]:f(f(values[middle-1]+values[middle])/2);}
 for(let ri=0;ri<summaries.length;ri++){
  const region=summaries[ri],b=region.bbox;requireValue(Number.isInteger(region.id)&&region.id>0&&Array.isArray(b)&&b.length===4&&b.every(Number.isInteger)&&b[0]>=0&&b[1]>=0&&b[2]<=w&&b[3]<=h&&b[2]>b[0]&&b[3]>b[1],'Invalid energy panel');const[x0,y0,x1,y1]=b;
  for(let kind=0;kind<2;kind++){
   const score=kind?high:low,t=limits[kind],weakThreshold=f(t/2),strongThreshold=f(t);let components=0,area=0,strongPixels=0,left=w,top=h,right=0,bottom=0;
   for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){const i=y*w+x,valid=scope[i]===region.id&&(!allowed||allowed[i]!==0);weak[i]=valid&&(t===0?score[i]>0:score[i]>=weakThreshold)?1:0;selected[i]=0;if((x&8191)===0)await checkpoint();}await checkpoint();}
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const first=y*w+x;if((first&4095)===0)await checkpoint();if(!weak[first])continue;let head=0,tail=1,strong=0,l=x,r=x,t0=y,b0=y;queue[0]=first;weak[first]=0;
    while(head<tail){const i=queue[head++],xx=i%w,yy=Math.floor(i/w);strong+=(t===0?score[i]>0:score[i]>=strongThreshold)?1:0;l=Math.min(l,xx);r=Math.max(r,xx);t0=Math.min(t0,yy);b0=Math.max(b0,yy);
     for(let ny=Math.max(y0,yy-1);ny<=Math.min(y1-1,yy+1);ny++)for(let nx=Math.max(x0,xx-1);nx<=Math.min(x1-1,xx+1);nx++){const j=ny*w+nx;if(weak[j]){weak[j]=0;queue[tail++]=j;}}
     if((head&4095)===0)await checkpoint();
    }
    if(tail>=minimum*block*block&&strong>=block*block){components++;area+=tail;strongPixels+=strong;left=Math.min(left,l);right=Math.max(right,r+1);top=Math.min(top,t0);bottom=Math.max(bottom,b0+1);for(let j=0;j<tail;j++){selected[queue[j]]=1;if((j&8191)===0)await checkpoint();}}
   }
   if(area){const id=offset+regions.length+1;let count=0;for(let y=y0;y<y1;y++){for(let x=x0;x<x1;x++){const i=y*w+x;if(selected[i]){labels[i]=id;values[count++]=score[i];}if((x&8191)===0)await checkpoint();}await checkpoint();}account(1024);regions.push({id,kind:kind?'high':'low',energy_region:region.id,components,cells:Math.ceil(area/(block*block)),pixels:area,bbox:[left,top,right-left,bottom-top],score:await median(count),strong_pixels:strongPixels,dominant_descriptor:kind?'energy_high':'energy_low',sources:[kind?'High ELA energy':'Low ELA energy']});}
   onProgress?.((ri*2+kind+1)/(summaries.length*2));
  }
 }
 checkAbort(signal);return{labels,regions};
}
function roundEven(x){const lower=Math.floor(x),fraction=x-lower;return fraction>.5?lower+1:fraction<.5?lower:lower%2?lower+1:lower;}
export function energyColor(region){
 const identity=2*(region.energy_region-1)+(region.kind==='high'?1:0),h=(.73+identity*.61803398875)%1,s=.7,v=.95,i=Math.floor(h*6),fraction=h*6-i,p=v*(1-s),q=v*(1-s*fraction),t=v*(1-s*(1-fraction)),rgb=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6];return rgb.map(x=>roundEven(x*255));
}
