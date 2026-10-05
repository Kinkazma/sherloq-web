import {prnuNccStored,PRNU_NCC_WORKSPACE_BYTES} from './prnu-ncc.js';
export {prnuNcc} from './prnu-ncc.js';
import {EngineError,requireValue,checkpoint} from './errors.js';
import {cvPrnuResidual} from './opencv.js';
import {parameters} from './pixel-utils.js';
import {PRNU_TWIDDLES} from './prnu-twiddles.js';
export const PRNU_SCHEMA='sherloq-wiener-ncc-1',PRNU_THRESHOLD=.005;
export function formatPrnuScore(value){
 requireValue(Number.isFinite(value),'A finite PRNU score is required.');
 const storage=new DataView(new ArrayBuffer(8));storage.setFloat64(0,value);const bits=storage.getBigUint64(0),negative=(bits>>63n)!==0n,exponent=Number((bits>>52n)&2047n),fraction=bits&0xfffffffffffffn;
 let numerator=(exponent?fraction|0x10000000000000n:fraction)*100000n,denominator=1n;const shift=(exponent||1)-1075;
 if(shift>=0)numerator<<=BigInt(shift);else denominator<<=BigInt(-shift);
 let rounded=numerator/denominator;const remainder=numerator%denominator;if(remainder*2n>denominator||(remainder*2n===denominator&&(rounded&1n)))rounded++;
 return (negative?'-':'')+(rounded/100000n)+'.'+(rounded%100000n).toString().padStart(5,'0');
}
export function prnuParams(input={}){const p=parameters(input,{databaseId:null});requireValue(p.databaseId===null||typeof p.databaseId==='string','databaseId must name a loaded PRNU database.');return p;}
export function prnuReferences(p){requireValue(typeof p.databaseId==='string'&&p.databaseId.length>0,'A loaded PRNU databaseId is required.');return [p.databaseId];}
let smoothLengths;
export function prnuPaddedLength(length){
 if(!smoothLengths){smoothLengths=[];for(let a=1;a<=PRNU_TWIDDLES.maximumLength;a*=2)for(let b=a;b<=PRNU_TWIDDLES.maximumLength;b*=3)for(let c=b;c<=PRNU_TWIDDLES.maximumLength;c*=5)smoothLengths.push(c);smoothLengths.sort((a,b)=>a-b);}
 const result=smoothLengths.find(n=>n>=length);requireValue(result!==undefined,'PRNU dimensions exceed the qualified FFT range.');return result;
}
export function prnuAdmission(image){
 requireValue(image.width>=3&&image.height>=3,'PRNU requires at least 3 rows and 3 columns.');
 const n=image.width*image.height,w=prnuPaddedLength(image.width+2),h=prnuPaddedLength(image.height+2),residual=(image.width-2)*(image.height-2);
 // Native input/mean/variance/correlations; padded real/complex FFT buffers,
 // plans and line scratch; 25% allocation-growth margin; JS residual and fixed NumPy NCC workspace.
 const working=Math.ceil(1.25*(48*n+64*w*h+128*(w+h)))+8*residual+PRNU_NCC_WORKSPACE_BYTES+128*1024**2;
 if(!Number.isSafeInteger(working)||working>1900*1024**2)throw new EngineError('MEMORY_LIMIT','PRNU exceeds the conservative working limit of this 2 GiB WASM module.');return working;
}
export async function prnuMean(residuals,{signal}={}){
 requireValue(residuals.length>=2,'At least two readable training images are required.');
 let result={...residuals[0],values:residuals[0].values.slice()};
 for(let i=1;i<residuals.length;i++){
  await checkpoint(signal);const next=residuals[i],width=Math.min(result.width,next.width),height=Math.min(result.height,next.height),values=new Float64Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=result.values[y*result.width+x];values[y*width+x]=a+(next.values[y*next.width+x]-a)/(i+1);}
  result={width,height,values};
 }return result;
}
export async function identifyPrnu(image,database,querySha256,hooks={}){
 requireValue(database?.cameras?.length>0,'A PRNU fingerprint database is required.');
 for(const camera of database.cameras)requireValue(!camera.trainingManifest?.some(x=>x.sha256===querySha256),'The query belongs to the PRNU training set. Use a held-out image.');
 let started=performance.now();const residual=await(hooks.memo?hooks.memo('residual',()=>cvPrnuResidual(image,hooks)):cvPrnuResidual(image,hooks)),scores=[];hooks.onTiming?.('residualMs',performance.now()-started);started=performance.now();
 for(const camera of database.cameras){await checkpoint(hooks.signal);const score=await prnuNccStored(residual,camera.fingerprint,{signal:hooks.signal,admit:hooks.admit});if(!Number.isFinite(score))throw new EngineError('NUMERIC_RANGE','PRNU correlation is undefined for the numeric range of this fingerprint.');scores.push({camera:camera.name,score});hooks.onProgress?.(scores.length/database.cameras.length);}
 scores.sort((a,b)=>b.score-a.score);hooks.onTiming?.('matchingMs',performance.now()-started);const top=scores[0].score,gap=top-(scores[1]?.score??0),reachesExperimentalThreshold=top>=PRNU_THRESHOLD;
 return {scores:scores.map((x,i)=>({...x,rank:i+1,scoreText:formatPrnuScore(x.score),gapText:i===0&&scores.length>1?formatPrnuScore(gap):''})),threshold:PRNU_THRESHOLD,reachesExperimentalThreshold,highestCandidate:reachesExperimentalThreshold?scores[0].camera:null,scoreGap:gap,gapAboveHistoricalDisplayCutoff:gap>.01,legacy:database.legacy,trainingMembershipVerified:database.trainingMembershipVerified,residualMethod:residual.method,noisePower:residual.noisePower,semantics:'Historical Wiener-residual NCC, with an uncalibrated experimental threshold. The highest candidate is not a calibrated camera identification or an authenticity verdict.'};
}
export async function prnuData(image,p,hooks,context){
 const fast=context.cpuKernel!=='reference',stages={},data=await identifyPrnu(image,context.references[0].database,context.sourceSha256,{...hooks,fast,admit:context.reserveMemory,memo:context.memoImage,onTiming:(name,value)=>{stages[name]=value;}});
 return {data:{databaseId:p.databaseId,...data},layers:[],semantics:data.semantics,engineMetrics:{kernel:fast?'cpu-pinned-prnu-simd':'cpu-pinned-prnu-reference',workers:1,stages}};
}
