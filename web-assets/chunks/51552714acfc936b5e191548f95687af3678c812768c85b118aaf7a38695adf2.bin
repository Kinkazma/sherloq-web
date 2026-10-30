import "../../runtime-context.js?v=0.30.0";
// Independent digital reproductions; conventions and original references are
// recorded in docs/equalization.md. These functions operate on counts, not pixels.
import {equalizeHistogramLut} from './pixel-utils.js';
const levels=()=>Float64Array.from({length:256},(_,i)=>i);
const sum=(h,a=0,b=255)=>{let n=0;for(let i=a;i<=b;i++)n+=h[i];return n;};
const moment=(h,a=0,b=255)=>{let n=0;for(let i=a;i<=b;i++)n+=h[i]*i;return n;};
const quantize=x=>Math.max(0,Math.min(255,Math.floor(x+.5)));
function intervalsLut(h,intervals,ranges=intervals){
 const lut=levels();intervals.forEach(([a,b],k)=>{const n=sum(h,a,b);if(!n)return;const [lo,hi]=ranges[k];let c=0;for(let i=a;i<=b;i++){c+=h[i];lut[i]=lo+(hi-lo)*c/n;}});return lut;
}
function split(h,depth,mode){
 let intervals=[[0,255]],cdf=levels(),n=sum(h),c=0;for(let i=0;i<256;i++){c+=h[i];cdf[i]=c/n;}
 for(let r=0;r<depth;r++)intervals=intervals.flatMap(([a,b])=>{
  const mass=sum(h,a,b);if(a===b||!mass)return [[a,b]];let t=a;
  if(mode==='mean')t=Math.floor(moment(h,a,b)/mass);
  else if(mode==='paper-median'){const target=(cdf[a]+cdf[b])/2;let best=Infinity;for(let i=a;i<=b;i++){const d=Math.abs(cdf[i]-target);if(d<best){best=d;t=i;}}}
  else {let s=0;for(let i=a;i<=b;i++){s+=h[i];if(s>=mass/2){t=i;break;}}}
  t=Math.min(b-1,Math.max(a,t));return [[a,t],[t+1,b]];
 });return intervals;
}
function allocate(h,intervals,x=1,minimum=0){
 let factors=intervals.map(([a,b])=>(b-a+1)*(x?Math.log10(Math.max(sum(h,a,b),1))**x:1));
 if(!factors.some(v=>v>0))factors=intervals.map(([a,b])=>b-a+1);
 const n=factors.reduce((s,v)=>s+v,0),exact=factors.map(v=>(256-minimum-intervals.length)*v/n),widths=exact.map(v=>1+Math.floor(v));
 const rest=256-minimum-widths.reduce((s,v)=>s+v,0),order=exact.map((v,i)=>({i,f:v-Math.floor(v)})).sort((a,b)=>b.f-a.f||a.i-b.i);
 for(let i=0;i<rest;i++)widths[order[i].i]++;let at=minimum;return widths.map(w=>{const range=[at,at+w-1];at+=w;return range;});
}
function dynamic(h,x){
 const smooth=levels();for(let i=0;i<256;i++)smooth[i]=((h[i-1]??0)+h[i]+(h[i+1]??0))/3;
 const used=Array.from(smooth.keys()).filter(i=>smooth[i]),lo=used[0],hi=used.at(-1),cuts=[lo-1];
 // scipy find_peaks convention: centre (rounded down) of a flat minimum.
 for(let i=lo+1;i<hi;i++){if(smooth[i-1]<=smooth[i])continue;let j=i;while(j<hi&&smooth[j+1]===smooth[i])j++;if(j<hi&&smooth[j+1]>smooth[i])cuts.push(Math.floor((i+j)/2));i=j;}
 cuts.push(hi);
 function partition(a,b,depth=0){const n=sum(h,a,b);if(!n||b-a<=2||depth>=16)return [[a,b]];const mean=moment(h,a,b)/n;let v=0;for(let i=a;i<=b;i++)v+=h[i]*(i-mean)**2;const sigma=Math.sqrt(v/n),l=Math.max(a,Math.min(b,Math.floor(mean-sigma+.5))),r=Math.max(a,Math.min(b,Math.floor(mean+sigma+.5)));
  if(sum(h,l,r)/n>=.683||!sigma||l<=a||r>=b||l>=r)return [[a,b]];return [...partition(a,l,depth+1),[l+1,r],...partition(r+1,b,depth+1)];}
 const intervals=cuts.slice(1).flatMap((v,i)=>sum(h,cuts[i]+1,v)>0?partition(cuts[i]+1,v):[]).filter(([a,b])=>sum(h,a,b)>0),lut=intervalsLut(h,intervals,allocate(h,intervals,x));
 const present=Array.from(h.keys()).filter(i=>h[i]);let k=0;for(let i=0;i<256;i++){while(k<present.length-1&&present[k+1]<i)k++;const a=present[k],b=present[Math.min(k+1,present.length-1)];lut[i]=i<a?lut[a]:i>b?lut[b]:a===b?lut[a]:lut[a]+(lut[b]-lut[a])*(i-a)/(b-a);}return lut;
}
function brightnessDynamic(h,sigma){
 const present=Array.from(h.keys()).filter(i=>h[i]),lo=present[0],hi=present.at(-1),kernel=Array.from({length:9},(_,i)=>Math.exp(-((i-4)**2)/(2*sigma**2))),kn=kernel.reduce((s,v)=>s+v,0),smooth=[];
 for(let i=lo;i<=hi;i++){let v=0;for(let k=-4;k<=4;k++)v+=h[Math.max(lo,Math.min(hi,i+k))]*kernel[k+4]/kn;smooth.push(v);}
 const signs=smooth.map((v,i)=>Math.sign((smooth[i+1]??v)-v)),trend=signs.map((v,i)=>Math.sign((signs[i-1]??v)+v+(signs[i+1]??v))),cuts=[0],pattern=[1,1,1,-1,-1,-1,-1,-1];
 for(let i=0;i<trend.length-7;i++)if(pattern.every((v,k)=>v===trend[i+k]))cuts.push(i+4);cuts.push(hi-lo+1);
 const intervals=cuts.slice(1).map((v,i)=>[lo+cuts[i],lo+v-1]).filter(([a,b])=>sum(h,a,b)>0),raw=intervalsLut(h,intervals,allocate(h,intervals,1,lo));let mapped=0;for(let i=0;i<256;i++)mapped+=h[i]*raw[i];const ratio=mapped?moment(h)/mapped:1;return raw.map(v=>v*ratio);
}
export function histogramEqualizationLut(h,method,value){
 const n=sum(h);if(!n)return Uint8Array.from(levels());let lut;
 if(method==='histogram')lut=equalizeHistogramLut(h,n);
 else if(['bbhe','dsihe','rmshe','rsihe','rswhe-m','rswhe-d'].includes(method)){
  const mode=['dsihe','rsihe'].includes(method)?'median':method==='rswhe-d'?'paper-median':'mean',depth=['bbhe','dsihe'].includes(method)?1:value,intervals=split(h,depth,mode);let weights=h;
  if(method.startsWith('rswhe')){const p=Float64Array.from(h,v=>v/n),min=Math.min(...p),max=Math.max(...p),present=Array.from(h.keys()).filter(i=>h[i]),span=Math.max(1,present.at(-1)-present[0]),beta=max*Math.abs(moment(p)-127.5)/span;weights=p.slice();if(max>min)for(const [a,b]of intervals){const alpha=sum(p,a,b);if(alpha)for(let i=a;i<=b;i++)weights[i]=max*((p[i]-min)/(max-min))**alpha+beta;}}
  lut=intervalsLut(weights,intervals);
 }else if(method==='mmbebhe'){
  let cumulative=0,best=Infinity,t=0;const total=moment(h);for(let i=0;i<256;i++){cumulative+=h[i];const error=Math.abs(i*n+256*(n-cumulative)-2*total);if(error<best){best=error;t=i;}}lut=intervalsLut(h,[[0,t],...(t<255?[[t+1,255]]:[])]);
 }else if(method==='dhe')lut=dynamic(h,value);
 else if(method==='bpdhe')lut=brightnessDynamic(h,value);
 else if(method==='esihe'){
  const threshold=Math.max(0,Math.min(254,Math.floor(256-moment(h)/n+.5))),clip=Math.max(1,Math.floor(value*n/256+.5));lut=intervalsLut(Float64Array.from(h,v=>Math.min(v,clip)),[[0,threshold],[threshold+1,255]],[[0,threshold],[threshold+1,256]]);
 }else if(method==='wthe'||method==='agcwd'){
  const p=Float64Array.from(h,v=>v/n),min=Math.min(...p),max=Math.max(...p);let weights;
  if(method==='wthe'){const upper=.5*max,lower=.01/256;weights=p.map(v=>upper*Math.max(0,Math.min(1,(v-lower)/Math.max(upper-lower,Number.EPSILON)))**value);}
  else weights=max<=min?p:p.map(v=>max*((v-min)/(max-min))**value);
  const total=sum(weights);let c=0;lut=weights.map((v,i)=>{c+=v;return method==='wthe'?255*c/total: i===0?0:255*(i/255)**(1-c/total);});
  if(method==='wthe'){let mapped=0;for(let i=0;i<256;i++)mapped+=p[i]*lut[i];const offset=moment(p)-mapped;lut=lut.map(v=>v+offset);}
 }else throw new TypeError('Unknown histogram equalization: '+method);
 const quantized=Uint8Array.from(lut,quantize);if(['histogram','bbhe','dsihe','mmbebhe'].includes(method)&&value!==100)return Uint8Array.from(quantized,(v,i)=>quantize(i+(v-i)*value/100));return quantized;
}
export function contextualEqualizationLut(joint){
 let total=0;for(let a=0;a<256;a++)for(let b=0;b<256;b++){const i=a*256+b;joint[i]*=(Math.abs(a-b)+1)/256;total+=joint[i];}
 if(!total)return Uint8Array.from(levels());for(let i=0;i<65536;i++)joint[i]/=total;
 const target=new Float64Array(65536),diagonal=new Float64Array(256),rhs=new Float64Array(256),upper=-1/3;
 for(let col=0;col<256;col++){
  for(let row=0;row<256;row++){const d=row===255?1:4/3,r=joint[row*256+col]/3+1/(3*65536),factor=row?upper/diagonal[row-1]:0;diagonal[row]=d-factor*upper;rhs[row]=r-(row?factor*rhs[row-1]:0);}
  for(let row=255;row>=0;row--)target[row*256+col]=(rhs[row]-(row<255?upper*target[(row+1)*256+col]:0))/diagonal[row];
 }
 let mass=0;for(const v of target)mass+=v;for(let i=0;i<65536;i++)target[i]/=mass;
 function diagonalCdf(matrix){const out=new Float64Array(256);for(let a=0;a<256;a++)for(let b=0;b<256;b++){const i=a*256+b;matrix[i]+=(a?matrix[i-256]:0)+(b?matrix[i-1]:0)-(a&&b?matrix[i-257]:0);if(a===b)out[a]=matrix[i];}return out;}
 const before=diagonalCdf(joint),after=diagonalCdf(target);return Uint8Array.from(before,v=>{let index=0,best=Infinity;for(let j=0;j<256;j++){const d=Math.abs(v-after[j]);if(d<best){best=d;index=j;}}return index;});
}
