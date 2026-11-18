import {histogramSummary} from './unified-engine/src/histogram.js';
const invalid=message=>{throw Object.assign(Error(message),{code:'INVALID_INPUT'});};
export function nativeColorLayout(pixels){
 const channels={CMYK:4,RGB:3,GRAY:1}[pixels?.space],depth=pixels?.depth;
 if(!channels||![8,16].includes(depth)||pixels.channels!==channels||pixels.format!==pixels.space.toLowerCase()+depth||![pixels.width,pixels.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=1024)||!(pixels.data instanceof(depth===8?Uint8Array:Uint16Array))||pixels.data.length!==pixels.width*pixels.height*channels)invalid('Invalid bounded native colour window.');
 return{channels,depth,binCount:2**depth,space:pixels.space,names:{CMYK:['C','M','Y','K'],RGB:['R','G','B'],GRAY:['Gray']}[pixels.space]};
}
export function nativeHistogramPixel(pixels,x,y){const layout=nativeColorLayout(pixels);if(![x,y].every(Number.isSafeInteger)||x<0||y<0||x>=pixels.width||y>=pixels.height)invalid('Native sample is outside the window.');const at=(y*pixels.width+x)*layout.channels;return{values:Array.from(pixels.data.subarray(at,at+layout.channels)),space:layout.space,depth:layout.depth};}
export function nativeHistogramSummary(data,channel,start=0,end=data.binCount-1){if(!Number.isInteger(channel)||channel<0||channel>=data.channels.length)invalid('Invalid native histogram channel.');if(data.sampleType==='float32'){if(start!==0||end!==data.binCount-1)invalid('Float32 sample statistics require the complete observed range.');return data.summaries[channel];}const bins=data.bins.subarray(channel*data.binCount,(channel+1)*data.binCount);return histogramSummary(bins,0,Math.max(0,Math.min(data.binCount-1,start)),Math.max(0,Math.min(data.binCount-1,end)),data.total);}
export function createNativeHistogramAggregate(){
 let bins=null,layout=null,total=0,count=0;
 return{append(pixels){const next=nativeColorLayout(pixels);if(layout&&(next.space!==layout.space||next.depth!==layout.depth))invalid('Native colour space changed between windows.');layout??=next;bins??=new Float64Array(layout.channels*layout.binCount);for(let i=0;i<pixels.data.length;i++)bins[Math.floor(i%layout.channels)*layout.binCount+pixels.data[i]]++;total+=pixels.width*pixels.height;count++;
  const cumulative=new Float64Array(bins.length),channelMeans=[];for(let c=0;c<layout.channels;c++){let n=0,sum=0;for(let value=0;value<layout.binCount;value++){const at=c*layout.binCount+value;n+=bins[at];sum+=bins[at]*value;cumulative[at]=n;}channelMeans.push(sum/total);}
  // RGB-render unique colours are supplied separately by the maintained RGB
  // histogram; a CMYK tuple is never passed off as an RGB colour.
  const result={space:layout.space,depth:layout.depth,binCount:layout.binCount,channels:layout.names,bins:bins.slice(),cumulative,channelMeans,total,uniqueColors:null,uniqueRatio:null};result.summary=nativeHistogramSummary(result,0);return result;
 },get total(){return total;},get count(){return count;}};
}
export function computeNativeChannelHistogram(pixels){return createNativeHistogramAggregate().append(pixels);}

const floatBinCount=65536;
// This accumulator consumes typed, interleaved windows; it does not open a
// native RGB reader. Its first consumer is the separate whole RAW sensor grid.
// The caller admits all three arrays before construction and drops this
// accumulator before retiring its separate rank workspace.
export function createFloat32HistogramAggregate({channels,total,bins,cumulative,ranks,sampleCell}){
 const length=channels*floatBinCount;
 if(!Number.isInteger(channels)||channels<1||channels>4||!Number.isSafeInteger(total)||total<=0
  ||![bins,cumulative,ranks].every(a=>a instanceof Float64Array&&a.length===length)||!(sampleCell instanceof Float32Array)||sampleCell.length!==1)invalid('Invalid funded Float32 histogram storage.');
 let phase=0,observed=0,secondObserved=0,minimum=Infinity,maximum=-Infinity,sparse=false;
 const state=Array.from({length:channels},()=>({finiteCount:0,nanCount:0,positiveInfinityCount:0,negativeInfinityCount:0,mean:0,m2:0,min:Infinity,max:-Infinity,prefix:-1,rank:0,secondFinite:0,secondNan:0,secondPositive:0,secondNegative:0}));
 const ordered=word=>word&0x80000000?(~word)>>>0:(word^0x80000000)>>>0;
 const sampleWord=new Uint32Array(sampleCell.buffer,sampleCell.byteOffset,1);
 const sample=key=>{sampleWord[0]=key&0x80000000?(key^0x80000000)>>>0:(~key)>>>0;return sampleCell[0];};
 function windowLayout(values){if(!(values instanceof Float32Array)||values.length%channels)invalid('Expected an interleaved Float32 window.');return new Uint32Array(values.buffer,values.byteOffset,values.length);}
 function append(values,second){
  if(phase!==(second?1:0))invalid('Float32 histogram passes are out of order.');
  const words=windowLayout(values),sites=values.length/channels;
  if((second?secondObserved:observed)+sites>total)invalid('Float32 histogram received too many sites.');
  for(let channel=0;channel<channels;channel++){
   const s=state[channel],offset=channel*floatBinCount;
   for(let i=channel;i<values.length;i+=channels){
    const value=values[i];
    if(!Number.isFinite(value)){
     if(second){if(Number.isNaN(value))s.secondNan++;else if(value>0)s.secondPositive++;else s.secondNegative++;}
     else if(Number.isNaN(value))s.nanCount++;else if(value>0)s.positiveInfinityCount++;else s.negativeInfinityCount++;
     continue;
    }
    const key=ordered(words[i]);
    if(second){
     s.secondFinite++;
     const bin=minimum===maximum?0:Math.min(floatBinCount-1,Math.max(0,Math.floor((value-minimum)/(maximum-minimum)*floatBinCount)));
     bins[offset+bin]++;
     if(key>>>16===s.prefix)ranks[offset+(key&65535)]++;
    }else{
     s.finiteCount++;
     const delta=value-s.mean;s.mean+=delta/s.finiteCount;s.m2+=delta*(value-s.mean);
     s.min=Math.min(s.min,value);s.max=Math.max(s.max,value);
     minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);
     ranks[offset+(key>>>16)]++;
    }
   }
  }
  if(second)secondObserved+=sites;else observed+=sites;
 }
 function appendSparse(values,second,channelAt){
  if(phase!==(second?1:0)||typeof channelAt!=='function'||!(values instanceof Float32Array)||!sparse&&(observed||secondObserved))invalid('Invalid sparse Float32 histogram pass.');
  sparse=true;const words=new Uint32Array(values.buffer,values.byteOffset,values.length),sites=values.length;
  if((second?secondObserved:observed)+sites>total)invalid('Too many sparse sensor sites.');
  for(let i=0;i<sites;i++){
   const channel=channelAt(i);if(!Number.isInteger(channel)||channel<0||channel>=channels)invalid('Sensor filter outside declared channels.');
   const s=state[channel],offset=channel*floatBinCount,value=values[i];
   if(second)s.secondSites=(s.secondSites??0)+1;else s.sites=(s.sites??0)+1;
   if(!Number.isFinite(value)){if(second){if(Number.isNaN(value))s.secondNan++;else if(value>0)s.secondPositive++;else s.secondNegative++;}else if(Number.isNaN(value))s.nanCount++;else if(value>0)s.positiveInfinityCount++;else s.negativeInfinityCount++;continue;}
   const key=ordered(words[i]);
   if(second){s.secondFinite++;const bin=minimum===maximum?0:Math.min(floatBinCount-1,Math.max(0,Math.floor((value-minimum)/(maximum-minimum)*floatBinCount)));bins[offset+bin]++;if(key>>>16===s.prefix)ranks[offset+(key&65535)]++;}
   else{s.finiteCount++;const delta=value-s.mean;s.mean+=delta/s.finiteCount;s.m2+=delta*(value-s.mean);s.min=Math.min(s.min,value);s.max=Math.max(s.max,value);minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);ranks[offset+(key>>>16)]++;}
  }
  if(second)secondObserved+=sites;else observed+=sites;
 }
 return{
  appendFirstSparse(values,channelAt){appendSparse(values,false,channelAt);},
  appendSecondSparse(values,channelAt){appendSparse(values,true,channelAt);},
  appendFirst(values){if(sparse)invalid('Mixed sparse/interleaved passes.');append(values,false);},
  beginSecond(){
   if(phase!==0||observed!==total)invalid('The first Float32 pass must cover the complete grid.');
   for(let channel=0;channel<channels;channel++){
    const s=state[channel],offset=channel*floatBinCount;
    if(s.finiteCount+s.nanCount+s.positiveInfinityCount+s.negativeInfinityCount!==(sparse?(s.sites??0):total))invalid('Float32 observations were lost.');
    if(s.finiteCount){
     const rank=Math.floor(s.finiteCount/2);let before=0;
     for(let prefix=0;prefix<floatBinCount;prefix++){const count=ranks[offset+prefix];if(before+count>rank){s.prefix=prefix;s.rank=rank-before;break;}before+=count;}
     if(s.prefix<0)invalid('The Float32 median prefix is missing.');
    }
   }
   ranks.fill(0);phase=1;
  },
  appendSecond(values){if(sparse)invalid('Mixed sparse/interleaved passes.');append(values,true);},
  finish(){
   if(phase!==1||secondObserved!==total)invalid('The second Float32 pass must cover the complete grid.');
   const range=minimum===Infinity?null:Object.freeze({minimum,maximum,binCount:floatBinCount,kind:'linear-observed-float32',lastUpperInclusive:true,degenerate:minimum===maximum});
   const summaries=state.map((s,channel)=>{
    if(sparse&&(s.secondSites??0)!==(s.sites??0))invalid('Sensor filter population changed between passes.');
    if(s.secondFinite!==s.finiteCount||s.secondNan!==s.nanCount||s.secondPositive!==s.positiveInfinityCount||s.secondNegative!==s.negativeInfinityCount)invalid('Float32 population changed between passes.');
    const offset=channel*floatBinCount;let count=0,median=null;
    for(let bin=0;bin<floatBinCount;bin++){count+=bins[offset+bin];cumulative[offset+bin]=count;}
    if(count!==s.finiteCount)invalid('A Float32 histogram channel lost finite samples.');
    if(count){let before=0;for(let suffix=0;suffix<floatBinCount;suffix++){before+=ranks[offset+suffix];if(before>s.rank){median=sample((s.prefix*floatBinCount+suffix)>>>0);break;}}if(median===null)invalid('The Float32 median suffix is missing.');}
    // Only these shape diagnostics describe discretized bins. Moments and the
    // upper median below come from actual samples, never from bin centres.
    const shape=histogramSummary(bins.subarray(offset,offset+floatBinCount),0,0,floatBinCount-1,sparse?(s.sites??0):total);
    return Object.freeze({...shape,start:range?.minimum??null,end:range?.maximum??null,argmin:count?shape.argmin:null,argmax:count?shape.argmax:null,
     mean:count?s.mean:null,stddev:count?Math.sqrt(Math.max(0,s.m2/count)):null,median,count,finiteCount:count,
     nanCount:s.nanCount,positiveInfinityCount:s.positiveInfinityCount,negativeInfinityCount:s.negativeInfinityCount,
     nonzero:count?[s.min,s.max]:[]});
   });
   phase=2;
   return{sampleType:'float32',binCount:floatBinCount,bins,cumulative,total,summaries,binning:range,...(sparse?{channelCounts:state.map(s=>s.sites??0)}:{}),
    statistics:Object.freeze({moments:'float64-welford-population',median:'upper-exact-float32',nonFinite:'excluded-and-counted-separately'})};
  },
 };
}
