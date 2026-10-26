import {comprintGrid} from './comprint-streaming-statistics.js';
import {requireValue,checkAbort,createCooperator} from '../engine-source/src/errors.js';

/** One real grid per native RGB context. These offsets index a feature bank,
 * never a synthetic image or spatial neighbourhood across disconnected data. */
export function comprintContextGeometry(contexts){
 requireValue(Array.isArray(contexts)&&contexts.length>0,'Comprint requires native contexts.');
 let cells=0,pixels=0,maximumColumns=0;const grids=[];
 for(let index=0;index<contexts.length;index++){
  const c=contexts[index],n=c?.width*c?.height;
  requireValue(Number.isSafeInteger(c?.width)&&Number.isSafeInteger(c?.height)&&c.width>0&&c.height>0&&Number.isSafeInteger(n),'Invalid native Comprint context dimensions.');
  let grid;try{grid=comprintGrid(c.width,c.height);}catch{grid=null;}
  grids.push({index,width:c.width,height:c.height,start:cells,cells:grid?.cells??0,rows:grid?.rows??0,columns:grid?.columns??0,evaluable:!!grid});
  cells+=grid?.cells??0;pixels+=n;maximumColumns=Math.max(maximumColumns,grid?.columns??0);
  requireValue(Number.isSafeInteger(cells)&&Number.isSafeInteger(pixels),'Comprint context population exceeds exact native indices.');
 }
 return{grids,cells,pixels,maximumColumns};
}

export function comprintContextPopulation(contexts){
 const geometry=comprintContextGeometry(contexts);
 for(const c of contexts)requireValue(c.luminance instanceof Float32Array&&c.fingerprint instanceof Float32Array&&c.luminance.length===c.width*c.height&&c.fingerprint.length===c.width*c.height,'Native Comprint context planes must be complete float32 observations.');
 return geometry;
}

/** The same stage/heap policy as native streaming Comprint, sized from the
 * actual cells of separate contexts rather than an imaginary rectangular grid. */
export function estimateComprintContextStatisticsPlan(contexts,{maxWorkers=4,availableBytes=Infinity,mainHeapBytes=768*1024**2,featureHeapBytes=512*1024**2,chunkedEM=true,blockColumns=256}={}){
 const MiB=1024**2,population=comprintContextGeometry(contexts);requireValue(population.cells>0,'No native context has a complete Comprint SPAM cell.');
 requireValue(Number.isSafeInteger(blockColumns)&&blockColumns>0&&blockColumns<=256&&Number.isFinite(maxWorkers)&&maxWorkers>=1,'Invalid native Comprint statistics resources.');
 const cells=population.cells,trainingBytes=cells*32*8,posteriorBytes=cells*2*8,hostWorkspaceBytes=8*population.maximumColumns*512*4*3+64*MiB,temporaryBrokerBytes=16*MiB,outputGridBytes=cells*9+population.grids.reduce((n,g)=>n+(g.rows+g.columns)*8+256,512*8);
 const mainResidentBytes=mainHeapBytes+408*MiB,featureResidentBytes=featureHeapBytes+408*MiB,fitHeapBytes=Math.ceil(Math.max(256*MiB,chunkedEM?trainingBytes+posteriorBytes+256*MiB:trainingBytes*5+160*MiB)/(64*MiB))*64*MiB,fitResidentBytes=fitHeapBytes+200*MiB,variants=[];
 for(let workers=1;workers<=Math.min(6,Math.max(1,Math.trunc(maxWorkers)));workers++){
  const featureWorkers=Math.min(workers,Math.ceil(population.maximumColumns/blockColumns)),base=mainResidentBytes+hostWorkspaceBytes+temporaryBrokerBytes+outputGridBytes,phases={featuresCovarianceBytes:base+(featureWorkers-1)*featureResidentBytes,projectionBytes:base+trainingBytes,emBytes:base+trainingBytes+workers*fitResidentBytes,returnedGridBytes:mainResidentBytes+outputGridBytes};variants.push({workers,featureWorkers,bytes:Math.max(...Object.values(phases)),phases});
 }
 requireValue([trainingBytes,posteriorBytes,hostWorkspaceBytes,temporaryBrokerBytes,outputGridBytes,fitHeapBytes,...variants.map(v=>v.bytes)].every(Number.isSafeInteger),'Comprint population resource sizes must have exact indices.');
 return{population,trainingWorstBytes:trainingBytes,posteriorWorstBytes:posteriorBytes,hostWorkspaceBytes,temporaryBrokerBytes,outputGridBytes,mainHeapBytes,mainResidentBytes,featureHeapBytes,featureResidentBytes,fitHeapBytes,fitResidentBytes,callerLuminanceFingerprintBytes:population.pixels*8,temporarySPAMBytes:cells*512*4,temporaryPCABytes:trainingBytes,chunkedEM,variants,minimumBytes:variants[0].bytes,preferredBytes:variants.at(-1).bytes,selected:variants.filter(v=>v.bytes<=availableBytes).at(-1)??null};
}

const f=Math.fround;
// The exact existing NumPy-compatible float32 reduction, applied to bounded
// buffers in one canonical context/row order. No average of context moments.
function pairwise(values,start,n,transform){
 if(n<8){let r=f(-0);for(let i=0;i<n;i++)r=f(r+transform(values[start+i]));return r;}
 if(n<=128){const r=Array.from({length:8},(_,i)=>transform(values[start+i]));let i=8;for(;i<n-(n%8);i+=8)for(let j=0;j<8;j++)r[j]=f(r[j]+transform(values[start+i+j]));let out=f(f(f(r[0]+r[1])+f(r[2]+r[3]))+f(f(r[4]+r[5])+f(r[6]+r[7])));for(;i<n;i++)out=f(out+transform(values[start+i]));return out;}
 let half=Math.floor(n/2);half-=half%8;return f(pairwise(values,start,half,transform)+pairwise(values,start+half,n-half,transform));
}
export async function comprintContextFingerprintMoments(contexts,{signal}={}){
 const population=comprintContextPopulation(contexts),buffer=new Float32Array(8192),cooperate=createCooperator(signal);
 async function reduce(transform){let sum=f(0),used=0;for(const c of contexts)for(let at=0;at<c.fingerprint.length;){await cooperate();const n=Math.min(buffer.length-used,c.fingerprint.length-at);buffer.set(c.fingerprint.subarray(at,at+n),used);at+=n;used+=n;if(used===buffer.length){sum=f(sum+pairwise(buffer,0,used,transform));used=0;}}if(used)sum=f(sum+pairwise(buffer,0,used,transform));checkAbort(signal);return sum;}
 const mean=f(await reduce(v=>v)/population.pixels),variance=f(await reduce(v=>{const z=f(v-mean);return f(z*z);})/population.pixels);
 requireValue(Number.isFinite(mean)&&Number.isFinite(variance)&&variance>0,'Insufficient native Comprint fingerprint variation.');
 return{mean,variance,pixels:population.pixels,order:'context-index/native-row-major',bufferValues:8192};
}
