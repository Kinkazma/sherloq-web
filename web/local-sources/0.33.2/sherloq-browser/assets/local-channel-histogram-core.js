import {gray,round2} from './unified-engine/src/pixel-utils.js';
import {histogramParams,histogramSummary} from './unified-engine/src/histogram.js';

export const LOCAL_CHANNEL_HISTOGRAM_SIZES=Object.freeze([4,8,16,32,64,128,256,512,1024]);
const MAX_PIXELS=1024*1024,UNIQUE_BYTES=1<<21;
const invalid=message=>{throw Object.assign(new Error(message),{code:'INVALID_INPUT'});};
function nativeRgbWindow(pixels){
 const {width,height,data,format}=pixels??{};
 if(format!=='rgb8'||![width,height].every(value=>Number.isSafeInteger(value)&&value>0&&value<=1024)||width*height>MAX_PIXELS||!(data instanceof Uint8Array)||data.length!==width*height*3)invalid('A bounded native RGB8 window of at most 1024 by 1024 pixels is required.');
 return{width,height,data};
}
function describeHistogram(bins,total,unique,p,ArrayType){
 const cumulative=new ArrayType(1024),channelMeans=[];
 for(let channel=0;channel<4;channel++){let sum=0,weighted=0;for(let value=0;value<256;value++){const at=channel*256+value;sum+=bins[at];weighted+=value*bins[at];cumulative[at]=sum;}channelMeans.push(weighted/total);}
 return{channels:['red','green','blue','value'],bins,cumulative,channelMeans,uniqueColors:unique,uniqueRatio:round2(unique/total*100),summary:histogramSummary(bins,p.channel,p.start,p.end,total)};
}

// Coordinates are relative to the cached native window, never screen pixels.
// A border-clamped square can therefore answer another pointer position
// without another decoder read or another histogram calculation.
export function localHistogramPixel(pixels,x,y){
 const {width,height,data}=nativeRgbWindow(pixels);
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<0||y<0||x>=width||y>=height)invalid('The sample must be an integer pixel inside the native window.');
 const at=(y*width+x)*3,r=data[at],g=data[at+1],b=data[at+2];
 return{values:[r,g,b],luminance:gray(r,g,b)};
}

// Pixel coordinates are native Original coordinates. At an edge the square
// moves inward instead of padding with black or silently sampling a proxy.
export function localHistogramRect({width,height,x,y,size=64}={}){
 if(![width,height].every(value=>Number.isSafeInteger(value)&&value>0))invalid('A positive native image size is required.');
 if(!Number.isFinite(x)||!Number.isFinite(y))invalid('A finite native pointer position is required.');
 if(!LOCAL_CHANNEL_HISTOGRAM_SIZES.includes(size))invalid('Unsupported local histogram size.');
 const w=Math.min(size,width),h=Math.min(size,height);
 return{x:Math.max(0,Math.min(width-w,Math.floor(x)-Math.floor(w/2))),y:Math.max(0,Math.min(height-h,Math.floor(y)-Math.floor(h/2))),width:w,height:h};
}

// The worker can reuse its constant 2 MiB RGB membership bitset. Bins count
// actual samples; the largest admitted square has only 1,048,576 samples.
export function computeLocalChannelHistogram(pixels,params={},workspace={}){
 const p=histogramParams(params),{width,height,data}=nativeRgbWindow(pixels);
 const seen=workspace.seen??new Uint8Array(UNIQUE_BYTES);
 if(!(seen instanceof Uint8Array)||seen.length!==UNIQUE_BYTES)invalid('Invalid local histogram workspace.');
 seen.fill(0);
 const bins=new Uint32Array(1024);let unique=0;
 for(let i=0;i<data.length;i+=3){
  const r=data[i],g=data[i+1],b=data[i+2],code=(r<<16)|(g<<8)|b,slot=code>>>3,bit=1<<(code&7);
  bins[r]++;bins[256+g]++;bins[512+b]++;bins[768+gray(r,g,b)]++;
  if(!(seen[slot]&bit)){seen[slot]|=bit;unique++;}
 }
 return describeHistogram(bins,width*height,unique,p,Uint32Array);
}

// A whole-image count has the same native operator, fed one bounded window
// at a time. Its colour membership belongs to this aggregate alone, so local
// pointer calculations may run between chunks without changing its state.
// The caller is responsible for covering the source exactly once.
export function createChannelHistogramAggregate(workspace={}){
 const seen=workspace.seen??new Uint8Array(UNIQUE_BYTES);
 if(!(seen instanceof Uint8Array)||seen.length!==UNIQUE_BYTES)invalid('Invalid aggregate histogram workspace.');
 workspace.seen=seen;
 const bins=new Float64Array(1024);let total=0,unique=0,count=0,initialized=false;
 return{
  get pixels(){return total;},get count(){return count;},
  append(pixels,params={}){
   // Reject a malformed chunk before changing any cumulative observations or
   // clearing a reusable membership workspace during a requested reset.
   const p=histogramParams(params),{width,height,data}=nativeRgbWindow(pixels),next=total+width*height;
   if(!Number.isSafeInteger(next)||!Number.isSafeInteger(next*255)||!Number.isSafeInteger(count+1))invalid('Aggregate histogram counters exceed the exact integer range.');
   if(!initialized){seen.fill(0);initialized=true;}
   for(let i=0;i<data.length;i+=3){
    const r=data[i],g=data[i+1],b=data[i+2],code=(r<<16)|(g<<8)|b,slot=code>>>3,bit=1<<(code&7);
    bins[r]++;bins[256+g]++;bins[512+b]++;bins[768+gray(r,g,b)]++;
    if(!(seen[slot]&bit)){seen[slot]|=bit;unique++;}
   }
   total=next;count++;
   // Only snapshots travel to the UI. Transferring one cannot detach the live
   // accumulator used by the next chunk.
   return describeHistogram(bins.slice(),total,unique,p,Float64Array);
  }
 };
}
