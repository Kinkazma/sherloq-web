import {requireValue} from './unified-engine/src/errors.js';
import {sensorFilterName} from './unified-engine/src/raw-sensor-facts.js';
import {histogramSummary} from './unified-engine/src/histogram.js';
import {createFloat32HistogramAggregate} from './native-channel-histogram-core.js';
const BINS=65536;
export function rawSensorChannelLayout(facts){
 requireValue(facts?.schema==='sherloq.raw-sensor-facts/1'&&[1,3,4].includes(facts.channels),'A preserved sensor layout is required.');
 // LibRaw small special filter codes use a separate pattern, not FC bits.
 // Only the actual X-Trans matrix and packed FC layout can name filters here.
 if(facts.kind==='cfa'&&facts.cfa.filterCode!==9&&facts.cfa.filterCode<1000)return{channels:['S1'],physicalChannels:1,channelAt:()=>0,cfa:false,filterSeparation:'unavailable-special-pattern'};
 if(facts.kind!=='cfa')return{channels:Array.from({length:facts.channels},(_,i)=>facts.channels===3?['R','G','B'][i]:'S'+(i+1)),physicalChannels:facts.channels,channelAt:(_x,_y,c=0)=>c};
 const names=new Set();for(let y=0;y<(facts.cfa.filterCode===9?6:8);y++)for(let x=0;x<(facts.cfa.filterCode===9?6:2);x++)names.add(sensorFilterName(facts,x,y));
 const channels=[...['R','G','B'].filter(c=>names.has(c)),...[...names].filter(c=>!['R','G','B'].includes(c))];
 return{channels,physicalChannels:1,channelAt:(x,y)=>channels.indexOf(sensorFilterName(facts,x,y)),cfa:true};
}
export function rawSensorPixel(pixels,x,y){
 const facts=pixels?.sensor,layout=rawSensorChannelLayout(facts);
 requireValue(Number.isSafeInteger(x)&&Number.isSafeInteger(y)&&x>=0&&y>=0&&x<pixels.width&&y<pixels.height,'Sensor point outside its window.');
 const at=(y*pixels.width+x)*layout.physicalChannels,channels=layout.cfa?[sensorFilterName(facts,pixels.origin.x+x,pixels.origin.y+y)]:layout.channels;
 return{values:Array.from(pixels.data.subarray(at,at+layout.physicalChannels)),channels,space:'SENSOR',depth:pixels.depth,sampleType:pixels.sampleType};
}
// Every native site belongs to exactly one CFA population. No absent colour is
// filled with zero, interpolated or divided by the total number of sensor sites.
export function computeRawSensorHistogram(pixels){
 const facts=pixels?.sensor,layout=rawSensorChannelLayout(facts),Type=pixels.sampleType==='float32'?Float32Array:Uint16Array,n=pixels.width*pixels.height,C=layout.channels.length;
 requireValue(pixels?.space==='SENSOR'&&pixels.data instanceof Type&&pixels.data.length===n*layout.physicalChannels&&pixels.origin&&Number.isSafeInteger(n)&&n>0&&pixels.width<=1024&&pixels.height<=1024,'Invalid bounded preserved sensor window.');
 const bins=new Float64Array(C*BINS),cumulative=new Float64Array(C*BINS),counts=new Array(C).fill(0),greenSites=new Array(4).fill(0);
 const channelAt=i=>layout.channelAt(pixels.origin.x+i%pixels.width,pixels.origin.y+Math.floor(i/pixels.width));let answer;
 if(Type===Float32Array){
  const aggregate=createFloat32HistogramAggregate({channels:C,total:n,bins,cumulative,ranks:new Float64Array(C*BINS),sampleCell:new Float32Array(1)});
  if(layout.cfa){aggregate.appendFirstSparse(pixels.data,channelAt);aggregate.beginSecond();aggregate.appendSecondSparse(pixels.data,channelAt);}else{aggregate.appendFirst(pixels.data);aggregate.beginSecond();aggregate.appendSecond(pixels.data);}
  answer=aggregate.finish();for(let c=0;c<C;c++)counts[c]=answer.channelCounts?.[c]??n;
 }else{
  for(let i=0;i<n;i++){
   if(layout.cfa){const c=channelAt(i);bins[c*BINS+pixels.data[i]]++;counts[c]++;}
   else for(let c=0;c<C;c++){bins[c*BINS+pixels.data[i*C+c]]++;counts[c]++;}
  }
  const summaries=counts.map((count,c)=>{let seen=0;for(let code=0;code<BINS;code++){seen+=bins[c*BINS+code];cumulative[c*BINS+code]=seen;}requireValue(seen===count,'Sensor filter samples were lost.');return histogramSummary(bins.subarray(c*BINS,(c+1)*BINS),0,0,BINS-1,count);});
  answer={bins,cumulative,summaries,binCount:BINS,sampleType:'uint16',total:n};
 }
 if(layout.cfa)for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++)if(sensorFilterName(facts,pixels.origin.x+x,pixels.origin.y+y)==='G')greenSites[((pixels.origin.y+y)&1)*2+((pixels.origin.x+x)&1)]++;
 return{...answer,space:'SENSOR',depth:pixels.depth,channels:layout.channels,channelCounts:counts,channelMeans:answer.summaries.map(s=>s.mean),source:{...facts,orientation:1,containerBits:pixels.depth},rect:{...pixels.origin,width:pixels.width,height:pixels.height},uniqueColors:null,uniqueRatio:null,greenSitePositions:layout.cfa?greenSites:null};
}
