import {histogramSummary} from './unified-engine/src/histogram.js';
const invalid=message=>{throw Object.assign(Error(message),{code:'INVALID_INPUT'});};
export function nativeColorLayout(pixels){
 const channels={CMYK:4,RGB:3,GRAY:1}[pixels?.space],depth=pixels?.depth;
 if(!channels||![8,16].includes(depth)||pixels.channels!==channels||pixels.format!==pixels.space.toLowerCase()+depth||![pixels.width,pixels.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=1024)||!(pixels.data instanceof(depth===8?Uint8Array:Uint16Array))||pixels.data.length!==pixels.width*pixels.height*channels)invalid('Invalid bounded native colour window.');
 return{channels,depth,binCount:2**depth,space:pixels.space,names:{CMYK:['C','M','Y','K'],RGB:['R','G','B'],GRAY:['Gray']}[pixels.space]};
}
export function nativeHistogramPixel(pixels,x,y){const layout=nativeColorLayout(pixels);if(![x,y].every(Number.isSafeInteger)||x<0||y<0||x>=pixels.width||y>=pixels.height)invalid('Native sample is outside the window.');const at=(y*pixels.width+x)*layout.channels;return{values:Array.from(pixels.data.subarray(at,at+layout.channels)),space:layout.space,depth:layout.depth};}
export function nativeHistogramSummary(data,channel,start=0,end=data.binCount-1){if(!Number.isInteger(channel)||channel<0||channel>=data.channels.length)invalid('Invalid native histogram channel.');const bins=data.bins.subarray(channel*data.binCount,(channel+1)*data.binCount);return histogramSummary(bins,0,Math.max(0,Math.min(data.binCount-1,start)),Math.max(0,Math.min(data.binCount-1,end)),data.total);}
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
