import "../../runtime-context.js?v=0.33.3";
// Native-code generalization of the EXISTING equalization-histograms.js.
// Caller owns/counts histogram, target and one scratch backing. No image, CMM,
// resampling, hidden data arrays or public eight-bit path is created here.
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {roundEven} from './pixel-utils.js';
import {equalizationMethods} from './equalization-settings.js';
const SPLIT=new Set(['bbhe','dsihe','rmshe','rsihe','rswhe-m','rswhe-d']);
const BLEND=new Set(['histogram','bbhe','dsihe','mmbebhe']);
const METHODS=new Set(['histogram',...SPLIT,'mmbebhe','dhe','bpdhe','wthe','esihe','agcwd']);
const TYPES={f64:Float64Array,i32:Int32Array,i8:Int8Array};
const align=(n,a)=>Math.ceil(n/a)*a;
export function histogramEqualizationNativePlan(method,{levels=65536}={}){
 requireValue(METHODS.has(method)&&[256,65536].includes(levels),'Unknown native histogram equalization or code domain.');
 const buffers=[];let offset=0;
 const add=(name,type,length)=>{const bytes=length*TYPES[type].BYTES_PER_ELEMENT;offset=align(offset,TYPES[type].BYTES_PER_ELEMENT);buffers.push({name,type,length,offset,bytes});offset+=bytes;};
 if(method!=='histogram')add('lut','f64',levels);
 if(SPLIT.has(method)){
  add('intervals','i32',128);add('nextIntervals','i32',128);
  if(method==='rswhe-d')add('cdf','f64',levels);
  if(method.startsWith('rswhe')){add('probability','f64',levels);add('weights','f64',levels);}
 }else if(method==='mmbebhe')add('intervals','i32',4);
 else if(method==='esihe'){add('weights','f64',levels);add('intervals','i32',4);}
 else if(method==='wthe'||method==='agcwd'){add('probability','f64',levels);add('weights','f64',levels);}
 else if(method==='dhe'||method==='bpdhe'){
  add('smooth','f64',levels);add('factors','f64',levels);
  add('intervals','i32',levels*2);add('cuts','i32',levels+1);add('widths','i32',levels);add('order','i32',levels);add('merge','i32',levels);
  if(method==='dhe'){add('present','i32',levels);add('stack','i32',99);}
  else{add('kernel','f64',9);add('signs','i8',levels);add('trend','i8',levels);}
 }
 const scratchBytes=align(offset,8),outputBytes=levels*(levels===65536?2:1);
 return{schema:'sherloq.native-equalization-lut-workspace/1',method,levels,inputHistogramBytes:levels*8,outputBytes,scratchBytes,metadataBytes:4096,totalWorkspaceBytes:outputBytes+scratchBytes+4096,buffers,units:{codes:'Integer bins of the actual working domain.',smoothing:'DHE:3 native bins. BPDHE:9 taps with sigma in native-bin units; never multiplied by257.',intensity:'Percent after integer LUT for HE/BBHE/DSIHE/MMBEBHE.',splitDepth:'Existing integer depth1..6; no code-domain scale factor.'}};
}
function overlap(a,b){return a.buffer===b.buffer&&a.byteOffset<b.byteOffset+b.byteLength&&b.byteOffset<a.byteOffset+a.byteLength;}
// Async only for cancellation/cooperation. Sums retain the legacy left-to-right
// binary64 operation order; no prefix-sum subtraction changes their rounding.
export async function histogramEqualizationNativeLut(h,method,value,{target,scratch,signal,cooperate}={}){
 const levels=h?.length,max=levels-1,plan=histogramEqualizationNativePlan(method,{levels});
 requireValue(h instanceof Float64Array&&(levels===65536?target instanceof Uint16Array:target instanceof Uint8Array)&&target.length===levels,'Complete native histogram and integer target required.');
 requireValue(scratch instanceof Uint8Array&&scratch.byteLength>=plan.scratchBytes&&scratch.byteOffset%8===0,'Financed aligned native histogram scratch required.');
 requireValue(!overlap(h,target)&&!overlap(h,scratch)&&!overlap(target,scratch),'Native histogram/LUT workspaces must not alias.');
 const definition=equalizationMethods.find(row=>row.id===method);
 requireValue(Number.isFinite(value)&&value>=definition.min&&value<=definition.max&&(!SPLIT.has(method)||BLEND.has(method)||Number.isInteger(value)),'Invalid native histogram equalization parameter.');
 const work={};for(const b of plan.buffers)work[b.name]=new TYPES[b.type](scratch.buffer,scratch.byteOffset+b.offset,b.length);
 const pause=cooperate??createCooperator(signal),tick=async()=>{checkAbort(signal);await pause();checkAbort(signal);};
 const sum=(v,a=0,b=max)=>{let n=0;for(let i=a;i<=b;i++)n+=v[i];return n;};
 const moment=(v,a=0,b=max)=>{let n=0;for(let i=a;i<=b;i++)n+=v[i]*i;return n;};
 const quantize=x=>Math.max(0,Math.min(max,Math.floor(x+.5)));
 let n=0;for(let i=0;i<levels;i++){if((i&4095)===0)await tick();requireValue(Number.isSafeInteger(h[i])&&h[i]>=0,'Histogram counts must be nonnegative exact integers.');n+=h[i];}
 requireValue(Number.isSafeInteger(n),'Unsafe native histogram population.');
 if(!n){for(let i=0;i<levels;i++){if((i&4095)===0)await tick();target[i]=i;}return target;}
 const lut=work.lut;
 if(lut)for(let i=0;i<levels;i++){if((i&4095)===0)await tick();lut[i]=i;}
 async function intervalsLut(weights,intervals,count,widths=null,minimum=0,esihe=false){
  let at=minimum;
  for(let k=0;k<count;k++){
   if((k&255)===0)await tick();const a=intervals[k*2],b=intervals[k*2+1],mass=sum(weights,a,b),lo=widths?at:a,hi=widths?at+widths[k]-1:esihe&&k===1?levels:b;
   if(widths)at+=widths[k];if(!mass)continue;let c=0;
   for(let i=a;i<=b;i++){if((i&4095)===0)await tick();c+=weights[i];lut[i]=lo+(hi-lo)*c/mass;}
  }
 }
 async function split(depth,mode){
  let intervals=work.intervals,next=work.nextIntervals,count=1;intervals[0]=0;intervals[1]=max;
  const cdf=work.cdf;if(cdf){let c=0;for(let i=0;i<levels;i++){if((i&4095)===0)await tick();c+=h[i];cdf[i]=c/n;}}
  for(let r=0;r<depth;r++){
   let nextCount=0;
   for(let k=0;k<count;k++){
    await tick();const a=intervals[k*2],b=intervals[k*2+1],mass=sum(h,a,b);let t=a;
    if(a===b||!mass){next[nextCount*2]=a;next[nextCount*2+1]=b;nextCount++;continue;}
    if(mode==='mean')t=Math.floor(moment(h,a,b)/mass);
    else if(mode==='paper-median'){const goal=(cdf[a]+cdf[b])/2;let best=Infinity;for(let i=a;i<=b;i++){if((i&4095)===0)await tick();const d=Math.abs(cdf[i]-goal);if(d<best){best=d;t=i;}}}
    else{let c=0;for(let i=a;i<=b;i++){if((i&4095)===0)await tick();c+=h[i];if(c>=mass/2){t=i;break;}}}
    t=Math.min(b-1,Math.max(a,t));next[nextCount*2]=a;next[nextCount*2+1]=t;nextCount++;next[nextCount*2]=t+1;next[nextCount*2+1]=b;nextCount++;
   }
   [intervals,next]=[next,intervals];count=nextCount;
  }return{intervals,count};
 }
 async function allocate(intervals,count,x,minimum){
  const {factors,widths,order,merge}=work;let any=false,total=0;
  for(let k=0;k<count;k++){if((k&255)===0)await tick();const a=intervals[k*2],b=intervals[k*2+1],f=(b-a+1)*(x?Math.log10(Math.max(sum(h,a,b),1))**x:1);factors[k]=f;if(f>0)any=true;}
  if(!any)for(let k=0;k<count;k++)factors[k]=intervals[k*2+1]-intervals[k*2]+1;
  for(let k=0;k<count;k++)total+=factors[k];let used=0;
  for(let k=0;k<count;k++){const exact=(levels-minimum-count)*factors[k]/total;factors[k]=exact-Math.floor(exact);widths[k]=1+Math.floor(exact);used+=widths[k];order[k]=k;}
  // Stable mergesort of fractional remainders, descending then original index.
  const before=(a,b)=>factors[a]>factors[b]||factors[a]===factors[b]&&a<b;
  let src=order,dst=merge;
  for(let span=1;span<count;span*=2){await tick();for(let base=0;base<count;base+=span*2){let a=base,b=Math.min(count,base+span),endA=b,endB=Math.min(count,base+span*2),out=base;while(a<endA||b<endB){if((out&4095)===0)await tick();dst[out++]=b>=endB||a<endA&&before(src[a],src[b])?src[a++]:src[b++];}}[src,dst]=[dst,src];}
  const rest=levels-minimum-used;requireValue(rest>=0&&rest<=count,'Native interval allocation remainder is invalid.');for(let i=0;i<rest;i++)widths[src[i]]++;
  return widths;
 }
 if(method==='histogram'){
  target.fill(0);let first=0;while(first<max&&!h[first])first++;
  if(h[first]===n)target.fill(first);
  else{const scale=Math.fround(max/Math.fround(n-h[first]));let c=0;for(let i=first+1;i<levels;i++){if((i&4095)===0)await tick();c+=h[i];target[i]=Math.max(0,Math.min(max,roundEven(Math.fround(Math.fround(c)*scale))));}}
 }else if(SPLIT.has(method)){
  const mode=['dsihe','rsihe'].includes(method)?'median':method==='rswhe-d'?'paper-median':'mean',depth=['bbhe','dsihe'].includes(method)?1:value,{intervals,count}=await split(depth,mode);let weights=h;
  if(method.startsWith('rswhe')){
   const p=work.probability;weights=work.weights;let low=Infinity,high=-Infinity,first=-1,last=-1;
   for(let i=0;i<levels;i++){if((i&4095)===0)await tick();p[i]=h[i]/n;low=Math.min(low,p[i]);high=Math.max(high,p[i]);if(h[i]){if(first<0)first=i;last=i;}weights[i]=p[i];}
   const beta=high*Math.abs(moment(p)-max/2)/Math.max(1,last-first);
   if(high>low)for(let k=0;k<count;k++){await tick();const a=intervals[k*2],b=intervals[k*2+1],alpha=sum(p,a,b);if(alpha)for(let i=a;i<=b;i++){if((i&4095)===0)await tick();weights[i]=high*((p[i]-low)/(high-low))**alpha+beta;}}
  }
  await intervalsLut(weights,intervals,count);
 }else if(method==='mmbebhe'){
  let c=0,best=Infinity,t=0;const total=moment(h);for(let i=0;i<levels;i++){if((i&4095)===0)await tick();c+=h[i];const error=Math.abs(i*n+levels*(n-c)-2*total);if(error<best){best=error;t=i;}}
  const intervals=work.intervals;intervals[0]=0;intervals[1]=t;let count=1;if(t<max){intervals[2]=t+1;intervals[3]=max;count=2;}await intervalsLut(h,intervals,count);
 }else if(method==='dhe'){
  const {smooth,cuts,intervals,present,stack}=work;let lo=-1,hi=-1;
  for(let i=0;i<levels;i++){if((i&4095)===0)await tick();smooth[i]=((h[i-1]??0)+h[i]+(h[i+1]??0))/3;if(smooth[i]){if(lo<0)lo=i;hi=i;}}
  let cutCount=1;cuts[0]=lo-1;
  for(let i=lo+1;i<hi;i++){if((i&4095)===0)await tick();if(smooth[i-1]<=smooth[i])continue;let j=i;while(j<hi&&smooth[j+1]===smooth[i])j++;if(j<hi&&smooth[j+1]>smooth[i])cuts[cutCount++]=Math.floor((i+j)/2);i=j;}cuts[cutCount++]=hi;
  let count=0,steps=0;const emit=(a,b)=>{if(sum(h,a,b)>0){requireValue(count<levels,'Native interval workspace exhausted.');intervals[count*2]=a;intervals[count*2+1]=b;count++;}};
  for(let k=1;k<cutCount;k++){
   let top=0;stack[top++]=cuts[k-1]+1;stack[top++]=cuts[k];stack[top++]=0;
   while(top){if((steps++&255)===0)await tick();const depth=stack[--top],b=stack[--top],a=stack[--top];if(depth<0){emit(a,b);continue;}const mass=sum(h,a,b);if(!mass)continue;if(b-a<=2||depth>=16){emit(a,b);continue;}
    const mean=moment(h,a,b)/mass;let variance=0;for(let i=a;i<=b;i++){if((i&4095)===0)await tick();variance+=h[i]*(i-mean)**2;}const sigma=Math.sqrt(variance/mass),l=Math.max(a,Math.min(b,Math.floor(mean-sigma+.5))),r=Math.max(a,Math.min(b,Math.floor(mean+sigma+.5)));
    if(sum(h,l,r)/mass>=.683||!sigma||l<=a||r>=b||l>=r){emit(a,b);continue;}
    requireValue(top+9<=stack.length,'Native dynamic partition stack exhausted.');stack[top++]=r+1;stack[top++]=b;stack[top++]=depth+1;stack[top++]=l+1;stack[top++]=r;stack[top++]=-1;stack[top++]=a;stack[top++]=l;stack[top++]=depth+1;
   }
  }
  const widths=await allocate(intervals,count,value,0);await intervalsLut(h,intervals,count,widths);
  let presentCount=0;for(let i=0;i<levels;i++)if(h[i])present[presentCount++]=i;
  let k=0;for(let i=0;i<levels;i++){if((i&4095)===0)await tick();while(k<presentCount-1&&present[k+1]<i)k++;const a=present[k],b=present[Math.min(k+1,presentCount-1)];lut[i]=i<a?lut[a]:i>b?lut[b]:a===b?lut[a]:lut[a]+(lut[b]-lut[a])*(i-a)/(b-a);}
 }else if(method==='bpdhe'){
  const {smooth,kernel,signs,trend,cuts,intervals}=work;let lo=0,hi=max;while(!h[lo])lo++;while(!h[hi])hi--;let kn=0;
  for(let i=0;i<9;i++){kernel[i]=Math.exp(-((i-4)**2)/(2*value**2));kn+=kernel[i];}
  const length=hi-lo+1;for(let i=lo;i<=hi;i++){if((i&4095)===0)await tick();let v=0;for(let k=-4;k<=4;k++)v+=h[Math.max(lo,Math.min(hi,i+k))]*kernel[k+4]/kn;smooth[i-lo]=v;}
  for(let i=0;i<length;i++)signs[i]=Math.sign((i+1<length?smooth[i+1]:smooth[i])-smooth[i]);
  for(let i=0;i<length;i++)trend[i]=Math.sign((i?signs[i-1]:signs[i])+signs[i]+(i+1<length?signs[i+1]:signs[i]));
  let cutCount=1;cuts[0]=0;for(let i=0;i<length-7;i++){if((i&4095)===0)await tick();if(trend[i]===1&&trend[i+1]===1&&trend[i+2]===1&&trend[i+3]===-1&&trend[i+4]===-1&&trend[i+5]===-1&&trend[i+6]===-1&&trend[i+7]===-1)cuts[cutCount++]=i+4;}cuts[cutCount++]=length;
  let count=0;for(let k=1;k<cutCount;k++){const a=lo+cuts[k-1],b=lo+cuts[k]-1;if(sum(h,a,b)>0){intervals[count*2]=a;intervals[count*2+1]=b;count++;}}
  const widths=await allocate(intervals,count,1,lo);await intervalsLut(h,intervals,count,widths,lo);let mapped=0;for(let i=0;i<levels;i++){if((i&4095)===0)await tick();mapped+=h[i]*lut[i];}const ratio=mapped?moment(h)/mapped:1;for(let i=0;i<levels;i++)lut[i]*=ratio;
 }else if(method==='esihe'){
  const threshold=Math.max(0,Math.min(max-1,Math.floor(levels-moment(h)/n+.5))),clip=Math.max(1,Math.floor(value*n/levels+.5)),weights=work.weights,intervals=work.intervals;
  for(let i=0;i<levels;i++){if((i&4095)===0)await tick();weights[i]=Math.min(h[i],clip);}intervals[0]=0;intervals[1]=threshold;intervals[2]=threshold+1;intervals[3]=max;await intervalsLut(weights,intervals,2,null,0,true);
 }else{
  const p=work.probability,weights=work.weights;let low=Infinity,high=-Infinity;
  for(let i=0;i<levels;i++){if((i&4095)===0)await tick();p[i]=h[i]/n;low=Math.min(low,p[i]);high=Math.max(high,p[i]);}
  const upper=.5*high,lower=.01/levels;
  for(let i=0;i<levels;i++){if((i&4095)===0)await tick();weights[i]=method==='wthe'?upper*Math.max(0,Math.min(1,(p[i]-lower)/Math.max(upper-lower,Number.EPSILON)))**value:high<=low?p[i]:high*((p[i]-low)/(high-low))**value;}
  const total=sum(weights);let c=0;for(let i=0;i<levels;i++){if((i&4095)===0)await tick();c+=weights[i];lut[i]=method==='wthe'?max*c/total:i===0?0:max*(i/max)**(1-c/total);}
  if(method==='wthe'){let mapped=0;for(let i=0;i<levels;i++)mapped+=p[i]*lut[i];const offset=moment(p)-mapped;for(let i=0;i<levels;i++)lut[i]+=offset;}
 }
 if(lut)for(let i=0;i<levels;i++){if((i&4095)===0)await tick();target[i]=quantize(lut[i]);}
 if(BLEND.has(method)&&value!==100)for(let i=0;i<levels;i++){if((i&4095)===0)await tick();target[i]=quantize(i+(target[i]-i)*value/100);}
 checkAbort(signal);return target;
}
