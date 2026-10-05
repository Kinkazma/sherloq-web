// Scientific parameter estimation, independent of performance calibration.
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {energyQuantile} from './energy-prepare.js';
const f=Math.fround;
function controls(signal){let last=performance.now();return async()=>{checkAbort(signal);if(performance.now()-last>=8){await controlCheckpoint(signal);last=performance.now();}};}
async function sort(values,count,scratch,checkpoint){
 let a=new Uint32Array(values.buffer,values.byteOffset,values.length),b=new Uint32Array(scratch.buffer,scratch.byteOffset,scratch.length);const hist=new Uint32Array(256),positions=new Uint32Array(256);
 for(let i=0;i<count;i++){const word=a[i];a[i]=word&0x80000000?~word:word^0x80000000;if((i&8191)===0)await checkpoint();}
 for(let shift=0;shift<32;shift+=8){hist.fill(0);for(let i=0;i<count;i++){hist[(a[i]>>>shift)&255]++;if((i&8191)===0)await checkpoint();}let total=0;for(let j=0;j<256;j++){positions[j]=total;total+=hist[j];}for(let i=0;i<count;i++){const word=a[i];b[positions[(word>>>shift)&255]++]=word;if((i&8191)===0)await checkpoint();}[a,b]=[b,a];}
 for(let i=0;i<count;i++){const word=a[i];a[i]=word&0x80000000?word^0x80000000:~word;if((i&8191)===0)await checkpoint();}
}
function median(sorted,count){const mid=count>>1;return count%2?sorted[mid]:f(f(sorted[mid-1]+sorted[mid])/2);}
export function roundDecimal(value,digits){
 requireValue(Number.isFinite(value)&&value>=0&&Number.isInteger(digits)&&digits>=0&&digits<=3,'Invalid decimal rounding');
 const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value,false);const bits=view.getBigUint64(0,false),exponent=Number((bits>>52n)&2047n),mantissa=(bits&((1n<<52n)-1n))+(exponent?1n<<52n:0n);let numerator=mantissa*10n**BigInt(digits),denominator=1n,power=(exponent||1)-1023-52;if(power>=0)numerator<<=BigInt(power);else denominator<<=BigInt(-power);let result=numerator/denominator,remainder=numerator%denominator;result+=remainder*2n>denominator||(remainder*2n===denominator&&(result&1n))?1n:0n;return Number(result)/10**digits;
}
export async function estimateEnergy(base,log,{signal,account=()=>{}}={}){
 const {energy_planes:planes,energy_scope:scope,energy_summary:regions}=base,n=scope?.length;
 requireValue(scope instanceof Int32Array&&n>0&&planes instanceof Float32Array&&planes.length===3*n&&Array.isArray(regions)&&typeof log==='function','Prepared energy planes/scope required');requireValue(regions.every(r=>Number.isInteger(r.id)&&r.id>0)&&new Set(regions.map(r=>r.id)).size===regions.length,'Unique positive panel ids required');checkAbort(signal);
 const step=Math.max(1,Math.ceil(n/131072)),capacity=Math.ceil(n/step),checkpoint=controls(signal);account(capacity*12+16384);
 const values=new Float32Array(capacity),samples=new Float32Array(capacity),scratch=new Float32Array(capacity);let total=0;
 for(const region of regions){let count=0;for(let i=0;i<n;i+=step){if(scope[i]===region.id){const x=planes[i],y=planes[n+i],z=planes[2*n+i];requireValue(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)&&x>=0&&y>=0&&z>=0&&x<=255&&y<=255&&z<=255,'Energy outside residual domain');values[count++]=x>y?(y>z?y:Math.min(x,z)):(x>z?x:Math.min(y,z));}if(((i/step)&8191)===0)await checkpoint();}if(count<32)continue;
  await sort(values,count,scratch,checkpoint);const center=median(values,count);for(let i=0;i<count;i++){samples[total++]=log(f(f(values[i]+.25)/f(center+.25)));if((i&8191)===0)await checkpoint();}
 }
 const fallback={quantiles:[.1,.9],thresholds:[2,2],method:'quantile_tail_knees_v1',status:'insufficient_spread',sample_count:total};if(!total)return fallback;
 await sort(samples,total,scratch,checkpoint);const q=new Float64Array(1001);for(let i=0;i<=1000;i++)q[i]=energyQuantile(samples,total,i===1000?1:i*.001);if(q[950]-q[50]<.08)return fallback;
 const knee=reverse=>{const first=reverse?q[1000]:q[0],last=reverse?q[900]:q[100];if(Math.abs(last-first)<.08)return[100,0];let index=0,prominence=0;for(let i=0;i<=100;i++){const y=((reverse?q[1000-i]:q[i])-first)/(last-first),delta=y-i*.01;if(delta>prominence){prominence=delta;index=i;}}return[prominence>=.1&&index>=1&&index<=99?index:100,prominence];};
 const [lo,lp]=knee(false),[hi,hp]=knee(true);checkAbort(signal);return{quantiles:[lo/1000,1-hi/1000],thresholds:[2,2],method:fallback.method,status:'estimated',sample_count:total,tail_prominence:[lp,hp]};
}
export async function energyDeviations(maps,{signal,account=()=>{}}={}){
 const {energy_low_score:low,energy_high_score:high}=maps;requireValue(low instanceof Float32Array&&high instanceof Float32Array&&low.length===high.length,'Prepared score maps required');checkAbort(signal);const checkpoint=controls(signal),step=Math.max(1,Math.ceil(low.length/131072)),capacity=Math.ceil(low.length/step);account(capacity*8+16384);const values=new Float32Array(capacity),scratch=new Float32Array(capacity),thresholds=[];
 for(const raw of [low,high]){let count=0;for(let i=0;i<raw.length;i+=step){requireValue(Number.isFinite(raw[i])&&raw[i]>=0,'Finite nonnegative scores required');if(raw[i]>0)values[count++]=raw[i];if(((i/step)&8191)===0)await checkpoint();}if(count<256){thresholds.push(2);continue;}await sort(values,count,scratch,checkpoint);if(energyQuantile(values,count,.95)<1){thresholds.push(2);continue;}
  const cap=f(energyQuantile(values,count,.999)),minimum=values[0],maximum=Math.min(values[count-1],cap);let cutoff=minimum;
  if(f(maximum-minimum)>1e-6){const edges=new Float32Array(257),centers=new Float32Array(256),counts=new Float32Array(256);for(let j=0;j<=256;j++)edges[j]=j===256?maximum:minimum+(maximum-minimum)*(j/256);for(let j=0;j<256;j++)centers[j]=f(f(edges[j]+edges[j+1])/2);
   for(let i=0;i<count;i++){const v=Math.min(values[i],cap);let a=0,b=256;while(a<b){const mid=(a+b+1)>>1;if(edges[mid]<=v)a=mid;else b=mid-1;}counts[Math.min(255,a)]++;if((i&8191)===0)await checkpoint();}
   const leftW=new Float32Array(256),rightW=new Float32Array(256),leftM=new Float32Array(256),rightM=new Float32Array(256);let w=0,sum=0;for(let j=0;j<256;j++){w=f(w+counts[j]);sum=f(sum+f(counts[j]*centers[j]));leftW[j]=w;leftM[j]=f(sum/w);}w=0;sum=0;for(let j=255;j>=0;j--){w=f(w+counts[j]);sum=f(sum+f(counts[j]*centers[j]));rightW[j]=w;rightM[j]=f(sum/w);}let best=-Infinity,index=0;for(let j=0;j<255;j++){const d=f(leftM[j]-rightM[j+1]),variance=f(f(leftW[j]*rightW[j+1])*f(d*d));if(variance>best){best=variance;index=j;}}cutoff=centers[index];
  }
  thresholds.push(roundDecimal(Math.max(1,Math.min(8,cutoff)),1));
 }
 checkAbort(signal);return thresholds;
}
export function energyProfile(automatic,profile){
 requireValue(profile==='standard'||profile==='sensitive'||profile==='conservative','Unknown energy profile');
 if(profile==='standard')return{profile,quantiles:[.01,.99],thresholds:[5,5],automatic:false};
 requireValue(automatic&&Array.isArray(automatic.quantiles)&&automatic.quantiles.length===2&&automatic.quantiles.every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Array.isArray(automatic.thresholds)&&automatic.thresholds.length===2&&automatic.thresholds.every(x=>Number.isFinite(x)&&x>=0),'Automatic profile parameters required');
 const conservative=profile==='conservative';return{...automatic,quantiles:conservative?[roundDecimal(automatic.quantiles[0]*.2,3),roundDecimal(1-(1-automatic.quantiles[1])*.2,3)]:automatic.quantiles.slice(),thresholds:conservative?automatic.thresholds.map((x,i)=>roundDecimal(Math.min(20,x*(i?2.47:2.05)),1)):automatic.thresholds.slice(),profile,calibration:conservative?{tail_factor:.2,shadow_gain:2.05,highlight_gain:2.47}:null,method:'quantile_tail_knees_one_sided_otsu_v1'};
}
