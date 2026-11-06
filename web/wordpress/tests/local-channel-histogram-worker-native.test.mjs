import test from 'node:test';
import assert from 'node:assert/strict';
import {computeLocalChannelHistogram} from '../sherloq-browser/assets/local-channel-histogram-core.js';
import {computeNativeChannelHistogram,nativeColorLayout,nativeHistogramSummary} from '../sherloq-browser/assets/native-channel-histogram-core.js';

let sequence=0;
function frame(space='CMYK',depth=8,width=2,height=2,pixel=(x,y,channel)=>(x*37+y*19+channel*53)%(2**depth)){
 const channels={CMYK:4,RGB:3,GRAY:1}[space],data=new(depth===8?Uint8Array:Uint16Array)(width*height*channels);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<channels;c++)data[(y*width+x)*channels+c]=pixel(x,y,c);
 return{space,depth,channels,width,height,format:space.toLowerCase()+depth,data};
}
function render(width=2,height=2){const pixels=frame('RGB',8,width,height);delete pixels.space;delete pixels.depth;delete pixels.channels;return pixels;}
function nativeTile(source,x,y,width,height){const data=new source.data.constructor(width*height*source.channels);for(let row=0;row<height;row++)data.set(source.data.subarray(((y+row)*source.width+x)*source.channels,((y+row)*source.width+x+width)*source.channels),row*width*source.channels);return{...source,width,height,data};}
async function withWorker(run){
 const prior=globalThis.self,replies=[];globalThis.self={postMessage:(value,transfer=[])=>{const bytes=transfer.map(buffer=>buffer.byteLength),buffers=[...transfer];replies.push({value:structuredClone(value,{transfer}),bytes,buffers});}};
 try{await import('../sherloq-browser/assets/local-channel-histogram-worker.js?native-routing-test-'+(++sequence));const send=value=>{const buffer=value?.pixels?.data?.buffer;const transferred=structuredClone(value,buffer instanceof ArrayBuffer?{transfer:[buffer]}:undefined);self.onmessage({data:transferred});return replies.at(-1);};await run(send,replies);}
 finally{if(prior===undefined)delete globalThis.self;else globalThis.self=prior;}
}
function compareNative(actual,expected){for(const key of ['space','depth','binCount','channels','bins','cumulative','channelMeans','total','summary','uniqueColors','uniqueRatio'])assert.deepEqual(actual[key],expected[key],key);}

test('The historical RGB8 render protocol remains identical, with native gray as its fourth channel',async()=>{
 await withWorker(send=>{const pixels=render(),reference=computeLocalChannelHistogram(pixels,{channel:3}),reply=send({id:1,pixels,params:{channel:3}});assert.equal(reply.value.id,1);assert.deepEqual(reply.value.data,reference);assert.deepEqual(reply.bytes,[4096,4096]);assert.equal(reply.value.data.bins.length,1024);assert.equal(reply.value.data.space,undefined);assert.equal(Object.hasOwn(reply.value,'pixels'),false);});
});
test('An explicitly native RGB8 window has its three real channels and does not synthesize grayscale',async()=>{
 await withWorker(send=>{const pixels=frame('RGB',8),reference=computeNativeChannelHistogram(pixels),reply=send({id:2,pixels,params:{channel:3,start:0,end:255},returnPixels:true});compareNative(reply.value.data,reference);assert.deepEqual(reply.value.data.channels,['R','G','B']);assert.equal(reply.value.data.bins.length,768);assert.deepEqual(reply.bytes,[6144,6144,12]);assert.equal(reply.value.pixels.space,'RGB');assert.ok(reply.value.pixels.data instanceof Uint8Array);assert.equal(pixels.data.byteLength,0,'Source ownership moves through the worker, rather than being copied');assert.equal(reply.value.data.uniqueColors,null);});
});
test('CMYK8 values and means are counted without RGB conversion, with the native frame returned by transfer',async()=>{
 await withWorker(send=>{const values=[[13,27,198,240],[255,0,1,2],[0,255,254,253],[17,19,23,29]],pixels=frame('CMYK',8,2,2,(x,y,c)=>values[y*2+x][c]),reference=computeNativeChannelHistogram(pixels),original=Array.from(pixels.data),reply=send({id:'cmyk8',pixels,returnPixels:true});compareNative(reply.value.data,reference);assert.deepEqual(reply.value.data.channels,['C','M','Y','K']);assert.equal(reply.value.data.bins[13],1);assert.equal(reply.value.data.bins[3*256+240],1);assert.deepEqual(reply.value.data.channelMeans,[71.25,75.25,119,131]);assert.deepEqual(Array.from(reply.value.pixels.data),original);assert.equal(reply.value.pixels.space,'CMYK');assert.equal(reply.value.data.uniqueColors,null);assert.equal(reply.value.data.uniqueRatio,null);assert.deepEqual(reply.bytes,[8192,8192,16]);});
});
test('Native grayscale8 and grayscale16 keep one channel, full precision and statistics above 255',async()=>{
 await withWorker(send=>{for(const depth of [8,16]){const values=depth===8?[0,1,128,255]:[0,256,32768,65535],pixels=frame('GRAY',depth,2,2,(x,y)=>values[y*2+x]),reference=computeNativeChannelHistogram(pixels),reply=send({id:'gray'+depth,pixels,params:{channel:3,start:0,end:255},returnPixels:true});compareNative(reply.value.data,reference);assert.deepEqual(reply.value.data.channels,['Gray']);assert.equal(reply.value.data.binCount,2**depth);assert.equal(reply.value.data.bins.length,2**depth);assert.equal(reply.value.data.total,4);assert.equal(reply.value.data.summary.end,2**depth-1);assert.equal(reply.value.data.summary.count,4);assert.deepEqual(Array.from(reply.value.pixels.data),values);assert.ok(reply.value.pixels.data instanceof(depth===8?Uint8Array:Uint16Array));if(depth===16){assert.equal(reply.value.data.channelMeans[0],24639.75);assert.equal(reply.value.data.bins[65535],1);assert.equal(nativeHistogramSummary(reply.value.data,0,256,32768).count,2);}}});
});
test('Native RGB16 and CMYK16 preserve every unsigned 16-bit bin without 8-bit promotion or scaling',async()=>{
 await withWorker(send=>{for(const space of ['RGB','CMYK']){const pixels=frame(space,16,3,2,(x,y,c)=>[0,1,256,4096,32768,65535][y*3+x]-c>=0?[0,1,256,4096,32768,65535][y*3+x]-c:0),reference=computeNativeChannelHistogram(pixels),reply=send({id:space,pixels,returnPixels:true});compareNative(reply.value.data,reference);assert.equal(reply.value.data.binCount,65536);assert.equal(reply.value.data.bins[65535],1);assert.equal(reply.value.data.bins[256],1);assert.equal(reply.value.pixels.depth,16);assert.equal(reply.value.data.bins.length,65536*(space==='CMYK'?4:3));assert.deepEqual(reply.bytes.slice(0,2),[reply.value.data.bins.length*8,reply.value.data.bins.length*8]);}});
});
test('Native aggregates equal whole-source counts across tiles and interleaved render and native local samples',async()=>{
 await withWorker(send=>{const source=frame('CMYK',16,7,5),reference=computeNativeChannelHistogram(source);let result,part=0;const tiles=[];for(let y=0;y<5;y+=3)for(let x=0;x<7;x+=4)tiles.push(nativeTile(source,x,y,Math.min(4,7-x),Math.min(3,5-y)));
  for(const pixels of tiles){result=send({id:'part-'+part,pixels,aggregate:{id:'native-source',reset:part===0,final:part===tiles.length-1}}).value;assert.equal(result.aggregate.id,'native-source');assert.equal(result.aggregate.count,part+1);assert.equal(result.aggregate.complete,part===tiles.length-1);assert.equal(result.data.total,result.aggregate.pixels);send({id:'rgb-local',pixels:render()});send({id:'gray-local',pixels:frame('GRAY',16)});part++;}
  compareNative(result.data,reference);assert.deepEqual(result.aggregate,{id:'native-source',pixels:35,count:4,complete:true});assert.equal(result.data.uniqueColors,null);
 });
});
test('Aggregate identities lock render/native kind, color space and depth until an explicit reset',async()=>{
 await withWorker(send=>{
  send({id:1,pixels:render(1,1),aggregate:{id:'same',reset:true}});assert.equal(send({id:2,pixels:frame('RGB',8,1,1),aggregate:{id:'same'}}).value.error.code,'INVALID_INPUT');assert.equal(send({id:3,pixels:render(1,1),aggregate:{id:'same',final:true}}).value.aggregate.pixels,2);
  send({id:4,pixels:frame('RGB',8,1,1),aggregate:{id:'same',reset:true}});
  for(const pixels of [render(1,1),frame('RGB',16,1,1),frame('CMYK',8,1,1),frame('GRAY',8,1,1)])assert.equal(send({id:'bad-kind',pixels,aggregate:{id:'same'}}).value.error.code,'INVALID_INPUT');
  const continued=send({id:5,pixels:frame('RGB',8,1,1),aggregate:{id:'same',final:true}}).value;assert.equal(continued.aggregate.pixels,2);assert.equal(continued.data.channels.length,3);
  const reset=send({id:6,pixels:frame('CMYK',16,1,1),aggregate:{id:'same',reset:true,final:true}}).value;assert.equal(reset.data.space,'CMYK');assert.equal(reset.data.depth,16);assert.equal(reset.aggregate.pixels,1);assert.equal(send({id:7,pixels:frame('CMYK',16,1,1),aggregate:{id:'same'}}).value.error.code,'INVALID_INPUT');
 });
});
test('Malformed explicit native layouts fail without RGB fallback or loss of a preceding aggregate',async()=>{
 await withWorker(send=>{
  send({id:'open',pixels:frame('GRAY',8,1,1,()=>10),aggregate:{id:'kept',reset:true}});
  const malformed=[{...frame('RGB',8),space:undefined},{...frame('RGB',8),space:null},{...frame('RGB',8),space:'CMYK'},{...frame('CMYK',16),depth:8},{...frame('GRAY',8),channels:3},{...frame('RGB',8),format:'rgba8'},{...frame('GRAY',16),data:new Uint8Array(4)},{...frame('CMYK',8),width:1025},{...frame('RGB',8),depth:32}];
  for(const pixels of malformed){assert.throws(()=>nativeColorLayout(pixels),{code:'INVALID_INPUT'});assert.equal(send({id:'bad-native',pixels,aggregate:{id:'other',reset:true}}).value.error.code,'INVALID_INPUT');}
  const kept=send({id:'finish',pixels:frame('GRAY',8,1,1,()=>20),aggregate:{id:'kept',final:true}}).value;assert.equal(kept.aggregate.pixels,2);assert.equal(kept.data.bins[10],1);assert.equal(kept.data.bins[20],1);assert.equal(kept.data.channelMeans[0],15);
 });
});
test('The largest native CMYK16 window transfers 8 MiB of pixels and 4 MiB of histogram arrays',async()=>{
 await withWorker(send=>{const pixels={space:'CMYK',depth:16,channels:4,format:'cmyk16',width:1024,height:1024,data:new Uint16Array(1024*1024*4).fill(65535)},reply=send({id:'max-native',pixels,returnPixels:true});assert.deepEqual(reply.bytes,[2*1024**2,2*1024**2,8*1024**2]);assert.equal(reply.value.pixels.data.byteLength,8*1024**2);assert.equal(reply.value.data.total,1024*1024);assert.deepEqual(reply.value.data.channelMeans,[65535,65535,65535,65535]);for(let channel=0;channel<4;channel++)assert.equal(reply.value.data.bins[channel*65536+65535],1024*1024);});
});
test('A restarted native worker requires a new aggregate start and never revives another worker’s observations',async()=>{
 await withWorker(send=>{const opened=send({id:'open-before-restart',pixels:frame('GRAY',16,1,1,()=>60000),aggregate:{id:'native-restart',reset:true}}).value;assert.equal(opened.aggregate.pixels,1);assert.equal(opened.data.bins[60000],1);});
 await withWorker(send=>{assert.equal(send({id:'old-owner',pixels:frame('GRAY',16,1,1,()=>50000),aggregate:{id:'native-restart',final:true}}).value.error.code,'INVALID_INPUT');const fresh=send({id:'new-owner',pixels:frame('GRAY',16,1,1,()=>40000),aggregate:{id:'native-restart',reset:true,final:true}}).value;assert.equal(fresh.aggregate.pixels,1);assert.equal(fresh.data.bins[40000],1);assert.equal(fresh.data.bins[60000],0);assert.equal(fresh.data.channelMeans[0],40000);});
});
