import {checkAbort} from './errors.js';
import {gpuFallbackError} from './gpu-native-boundary.js';

// Each selected result still goes through the pinned complete-axis native
// kernels. Zeros outside its proven support never enter a published stencil.
function columnSupport(width,start,count){
 let lo=width,hi=-1;
 for(let x=start;x<start+count;x++)for(let k=0;k<16;k++){
  let p=(2*x+1-k)%(2*width);if(p<0)p+=2*width;p=p<width?p:2*width-1-p;lo=Math.min(lo,p);hi=Math.max(hi,p);
 }
 return {x:lo,width:hi-lo+1};
}

export async function nativeNoiseBlock(math,source,block,bx,by,{budget,signal,cooperate,blockPixels}){
 const {width,height}=source,support=columnSupport(width,bx*block,block);
 if(Math.max(width,height)>blockPixels)return null;
 const columns=Math.max(1,Math.min(support.width,Math.floor(blockPixels/height))),rowsPerJob=Math.max(1,Math.min(block,Math.floor(blockPixels/width)));
 let lease;try{lease=budget.reserve((columns*height+width*rowsPerJob+width*block+block*block)*64+4096);}catch(error){if(gpuFallbackError(error))return null;throw error;}
 try{
  const rows=new Float64Array(width*block);
  for(let x=0;x<support.width;x+=columns){
   await cooperate();checkAbort(signal);const count=Math.min(columns,support.width-x),strip=await source.read(support.x+x,0,count,height,{signal,cooperate});checkAbort(signal);
   const vertical=math.downDetail(strip,count,height,'db8',0);
   for(let y=0;y<block;y++)rows.set(vertical.d.subarray((by*block+y)*count,(by*block+y+1)*count),y*width+support.x+x);
  }
  const detail=new Float64Array(block*block);
  for(let y=0;y<block;y+=rowsPerJob){
   await cooperate();checkAbort(signal);const count=Math.min(rowsPerJob,block-y),horizontal=math.downDetail(rows.subarray(y*width,(y+count)*width),width,count,'db8',1);
   for(let row=0;row<count;row++)detail.set(horizontal.d.subarray(row*horizontal.width+bx*block,row*horizontal.width+(bx+1)*block),(y+row)*block);
  }
  checkAbort(signal);return math.noise(detail,block,block,block).values[0];
 }finally{lease();}
}

// The RGB8/file-gray corpus qualifies a coefficient error margin1e-7
// (observed maximum <4e-12). Median(abs(x)) is1-Lipschitz. Bounds on the
// extrema enclose every noise value, including tied almost-zero minima.
// Native CV8U affine arithmetic evaluates both ends of the resulting interval.
// An unresolved byte is replayed through the unchanged native db8 kernels.
export async function qualifyBlockNoiseNormalization(math,noise,source,block,{budget,signal,cooperate,blockPixels}={}){
 const n=noise.width*noise.height,epsilon=1e-7/0.6745,maximumRefinements=Math.min(32,Math.max(2,Math.floor(n/8))),start=performance.now();let lease;
 try{lease=budget.reserve(n*40+maximumRefinements*64+4096);}catch(error){if(gpuFallbackError(error))return {accepted:false,reason:'normalization-workspace'};throw error;}
 try{
  await cooperate();checkAbort(signal);const values=await noise.read(0,0,noise.width,noise.height,{signal,cooperate});checkAbort(signal);let minimum=0,maximum=0;
  for(let i=1;i<n;i++){if(values[i]<values[minimum])minimum=i;if(values[i]>values[maximum])maximum=i;}
  if(values[maximum]-values[minimum]<=2*epsilon)return {accepted:false,reason:'uncertain-range'};
  const refined=new Set(),refine=async i=>{
   if(refined.has(i))return true;if(refined.size>=maximumRefinements)return false;
   const next=await nativeNoiseBlock(math,source,block,i%noise.width,Math.floor(i/noise.width),{budget,signal,cooperate,blockPixels});
   if(next===null||Math.abs(next-values[i])>epsilon)return false;
   values[i]=next;refined.add(i);return true;
  };
  if(!await refine(minimum)||!await refine(maximum))return {accepted:false,reason:'native-refinement-workspace-or-enclosure'};
  let minLower=Infinity,minUpper=Infinity,maxLower=-Infinity,maxUpper=-Infinity;
  for(let i=0;i<n;i++){const e=refined.has(i)?0:epsilon,low=Math.max(0,values[i]-e),high=values[i]+e;minLower=Math.min(minLower,low);minUpper=Math.min(minUpper,high);maxLower=Math.max(maxLower,low);maxUpper=Math.max(maxUpper,high);}
  if(maxLower<=minUpper)return {accepted:false,reason:'uncertain-range'};
  // Monotone bounds, widened for the native double scale/bias operations
  // before their required binary32 conversion. Noise is nonnegative.
  const u=2**-52,scaleLow=(255*(1/(maxUpper-minLower)))*(1-8*u),scaleHigh=(255*(1/(maxLower-minUpper)))*(1+8*u),aLow=Math.fround(scaleLow),aHigh=Math.fround(scaleHigh),bLow=Math.fround((-minUpper*scaleHigh)*(1+8*u)),bHigh=Math.fround((-minLower*scaleLow)*(1-8*u));
  const normalizeAll=async(values,a,b)=>{const out=new Uint8Array(n);for(let at=0;at<n;at+=blockPixels){await cooperate();checkAbort(signal);out.set(math.normalizeAffine(values.subarray(at,Math.min(n,at+blockPixels)),a,b,n),at);}return out;};
  const lower=Float64Array.from(values,(v,i)=>refined.has(i)?v:Math.max(0,v-epsilon)),upper=Float64Array.from(values,(v,i)=>refined.has(i)?v:v+epsilon),pixels=await normalizeAll(lower,aLow,bLow),upperPixels=await normalizeAll(upper,aHigh,bHigh);
  for(let i=0;i<n;i++)if(pixels[i]!==upperPixels[i]){
   if(!await refine(i))return {accepted:false,reason:'uncertain-quantization'};
   const exact=Float64Array.of(values[i]),low=math.normalizeAffine(exact,aLow,bLow,n)[0],high=math.normalizeAffine(exact,aHigh,bHigh,n)[0];
   if(low!==high)return {accepted:false,reason:'uncertain-extrema-affine'};pixels[i]=low;
  }
  for(const i of refined)await noise.write(Float64Array.of(values[i]),i%noise.width,Math.floor(i/noise.width),1,1,{signal,cooperate});
  checkAbort(signal);let outputLease;try{outputLease=budget.reserve(pixels.byteLength);}catch(error){if(gpuFallbackError(error))return {accepted:false,reason:'normalization-output-workspace'};throw error;}let released=false;
  let publishedMin=Infinity,publishedMax=-Infinity;for(const value of values){publishedMin=Math.min(publishedMin,value);publishedMax=Math.max(publishedMax,value);}
  return {accepted:true,pixels,lo:publishedMin,hi:publishedMax,extremaIntervals:{minimum:[minLower,minUpper],maximum:[maxLower,maxUpper]},refinementCount:refined.size,elapsedMs:performance.now()-start,release(){if(!released){outputLease();released=true;}}};
 }finally{lease();}
}
