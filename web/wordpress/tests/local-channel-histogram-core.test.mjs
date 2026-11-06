import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_CHANNEL_HISTOGRAM_SIZES,localHistogramRect,computeLocalChannelHistogram,localHistogramPixel,createChannelHistogramAggregate} from '../sherloq-browser/assets/local-channel-histogram-core.js';
import {histogram,histogramParams} from '../sherloq-browser/assets/unified-engine/src/histogram.js';
import {gray} from '../sherloq-browser/assets/unified-engine/src/pixel-utils.js';

function fixture(width,height,pixel=(x,y)=>[(x*37+y*19)%256,(x*7+y*53)%256,(x*79+y*11)%256]){
 const data=new Uint8Array(width*height*3);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(pixel(x,y),(y*width+x)*3);
 return{width,height,format:'rgb8',data};
}
function nativeTile(image,x,y,width,height){
 const data=new Uint8Array(width*height*3);
 for(let row=0;row<height;row++)data.set(image.data.subarray(((y+row)*image.width+x)*3,((y+row)*image.width+x+width)*3),row*width*3);
 return{width,height,format:'rgb8',data};
}
function compare(actual,expected){
 assert.deepEqual(Array.from(actual.bins),Array.from(expected.bins));assert.deepEqual(Array.from(actual.cumulative),Array.from(expected.cumulative));
 for(const key of ['channels','uniqueColors','uniqueRatio','summary'])assert.deepEqual(actual[key],expected[key],key);
}
test('All requested sizes keep a native square inside the image, including every edge',()=>{
 assert.deepEqual(LOCAL_CHANNEL_HISTOGRAM_SIZES,[4,8,16,32,64,128,256,512,1024]);assert.ok(Object.isFrozen(LOCAL_CHANNEL_HISTOGRAM_SIZES));
 for(const size of LOCAL_CHANNEL_HISTOGRAM_SIZES)for(const [x,y]of [[0,0],[2047,0],[0,1535],[2047,1535],[1000.75,800.25],[-10,-100],[1e6,1e6]]){
  const rect=localHistogramRect({width:2048,height:1536,x,y,size});assert.equal(rect.width,size);assert.equal(rect.height,size);assert.ok(Number.isInteger(rect.x)&&Number.isInteger(rect.y));assert.ok(rect.x>=0&&rect.y>=0&&rect.x+size<=2048&&rect.y+size<=1536);
 }
 assert.deepEqual(localHistogramRect({width:2048,height:1536,x:1000.75,y:800.25,size:64}),{x:968,y:768,width:64,height:64});
 assert.deepEqual(localHistogramRect({width:2048,height:1536,x:2047,y:1535,size:1024}),{x:1024,y:512,width:1024,height:1024});
});
test('Images smaller than the requested region contain native samples only, with no padding',()=>{
 for(const size of LOCAL_CHANNEL_HISTOGRAM_SIZES)assert.deepEqual(localHistogramRect({width:3,height:2,x:2,y:1,size}),{x:0,y:0,width:3,height:2});
 assert.deepEqual(localHistogramRect({width:100,height:1,x:99,y:0,size:16}),{x:84,y:0,width:16,height:1});
});
test('Native histogram parity includes all channels, cumulative counts, unique colours and summaries',async()=>{
 const image=fixture(37,29);
 for(let channel=0;channel<4;channel++)for(const [start,end]of [[0,255],[17,201],[201,17],[127,127]]){
  const params={channel,start,end},reference=await histogram(image,histogramParams(params));compare(computeLocalChannelHistogram(image,params),reference.data);
 }
});
test('Constant windows preserve exact native luminance, channel indexing and empty value ranges',async()=>{
 const image=fixture(8,8,()=>[255,33,79]);assert.equal(gray(255,33,79),105);
 for(const params of [{channel:3,start:0,end:255},{channel:3,start:106,end:255},{channel:0,start:255,end:255}]){
  const actual=computeLocalChannelHistogram(image,params),reference=await histogram(image,histogramParams(params));compare(actual,reference.data);assert.equal(actual.bins[768+105],64);assert.equal(actual.uniqueColors,1);
 }
});
test('Pointer samples read the exact native RGB values at all four corners',()=>{
 const pixels=fixture(2,2,(x,y)=>[[1,2,3],[4,5,6],[7,8,9],[252,253,254]][y*2+x]);
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){
  const values=Array.from(pixels.data.subarray((y*2+x)*3,(y*2+x+1)*3));
  assert.deepEqual(localHistogramPixel(pixels,x,y),{values,luminance:gray(...values)});
 }
 // Samples do not mutate, copy or detach the cached RGB window.
 assert.equal(pixels.data.byteLength,12);assert.equal(pixels.data[0],1);
});
test('Per-channel means preserve fractional values and native-gray rounding independently',()=>{
 const pixels=fixture(2,2,(x,y)=>[[0,0,0],[1,1,1],[2,3,4],[4,8,16]][y*2+x]);
 const actual=computeLocalChannelHistogram(pixels,{channel:3,start:200,end:255});
 assert.deepEqual(actual.channelMeans,[1.75,3,5.25,3]);
 assert.equal(actual.summary.count,0,'Display bounds do not restrict region channel means');
 for(let channel=0;channel<4;channel++){
  let weighted=0,count=0;for(let value=0;value<256;value++){const n=actual.bins[channel*256+value];weighted+=value*n;count+=n;}
  assert.equal(actual.channelMeans[channel],weighted/count);
 }
 const rounded=computeLocalChannelHistogram(fixture(2,2,(x,y)=>[[0,0,0],[1,0,0],[2,0,0],[4,0,0]][y*2+x]));
 assert.deepEqual(rounded.channelMeans,[1.75,0,0,.5]);
 assert.notEqual(rounded.channelMeans[3],gray(...rounded.channelMeans.slice(0,3)),'Mean native luminance is not luminance of rounded mean RGB');
});
test('Workspace reuse never retains counts or colours from a prior window',()=>{
 const workspace={seen:new Uint8Array(1<<21)},first=computeLocalChannelHistogram(fixture(4,4),{},workspace);
 const second=computeLocalChannelHistogram(fixture(4,4,()=>[0,0,0]),{},workspace);assert.ok(first.uniqueColors>1);assert.equal(second.uniqueColors,1);assert.equal(second.bins[0],16);assert.equal(second.bins[768],16);assert.equal(second.summary.count,16);
});
test('The maximum supported window keeps integer counts and bounded arrays',async()=>{
 const image=fixture(1024,1024,()=>[255,255,255]),actual=computeLocalChannelHistogram(image),reference=await histogram(image,histogramParams({}));compare(actual,reference.data);
 assert.equal(actual.bins.length,1024);assert.equal(actual.cumulative.length,1024);for(let channel=0;channel<4;channel++){assert.equal(actual.bins[channel*256+255],1024*1024);assert.equal(actual.cumulative[channel*256+255],1024*1024);}
});
test('Malformed coordinates, unlisted sizes, wrong RGB grids and invalid value bounds fail clearly',()=>{
 for(const value of [{width:0,height:10,x:0,y:0},{width:10,height:10,x:NaN,y:0},{width:10,height:10,x:0,y:0,size:6}])assert.throws(()=>localHistogramRect(value),{code:'INVALID_INPUT'});
 for(const image of [null,{...fixture(4,4),format:'rgba8'},{...fixture(4,4),data:new Uint8Array(47)},{width:1025,height:1,format:'rgb8',data:new Uint8Array(3075)}])assert.throws(()=>computeLocalChannelHistogram(image),{code:'INVALID_INPUT'});
 for(const params of [{channel:4},{start:-1},{end:256},{start:1.5},{arbitrary:1}])assert.throws(()=>computeLocalChannelHistogram(fixture(4,4),params));
 for(const [x,y]of [[-1,0],[0,-1],[4,0],[0,4],[.5,1],[1,NaN],[Infinity,0]])assert.throws(()=>localHistogramPixel(fixture(4,4),x,y),{code:'INVALID_INPUT'});
 assert.throws(()=>localHistogramPixel(null,0,0),{code:'INVALID_INPUT'});
});
test('Worker echoes request ownership, transfers only histogram arrays and remains usable after errors',async()=>{
 const prior=globalThis.self,answers=[];globalThis.self={postMessage:(message,transfer)=>answers.push({message,transfer})};
 try{await import('../sherloq-browser/assets/local-channel-histogram-worker.js?test-local-worker');
  self.onmessage({data:{id:1,pixels:fixture(4,4),params:{channel:0}}});assert.equal(answers[0].message.id,1);assert.equal(answers[0].message.data.summary.count,16);assert.deepEqual(answers[0].transfer,[answers[0].message.data.bins.buffer,answers[0].message.data.cumulative.buffer]);
  self.onmessage({data:{id:2,pixels:fixture(4,4),params:{channel:8}}});assert.equal(answers[1].message.id,2);assert.ok(answers[1].message.error.message);assert.equal(answers[1].message.data,undefined);
  self.onmessage({data:{id:3,pixels:fixture(8,8,()=>[1,2,3])}});assert.equal(answers[2].message.id,3);assert.equal(answers[2].message.data.summary.count,64);
  assert.equal(Object.hasOwn(answers[0].message,'pixels'),false,'Default protocol does not return native pixels');
  const cached=fixture(2,2);self.onmessage({data:{id:4,pixels:cached,returnPixels:true}});const returned=answers[3];assert.equal(returned.message.pixels,cached);assert.equal(returned.message.pixels.data,cached.data);assert.deepEqual(returned.transfer,[returned.message.data.bins.buffer,returned.message.data.cumulative.buffer,cached.data.buffer]);assert.deepEqual(returned.message.data.channelMeans,computeLocalChannelHistogram(cached).channelMeans);
  self.onmessage({data:{id:5,pixels:cached,returnPixels:'true'}});assert.equal(answers[4].message.id,5);assert.equal(answers[4].message.error.code,'INVALID_INPUT');
  self.onmessage({data:null});assert.equal(answers[5].message.error.code,'INVALID_INPUT');
  self.onmessage(null);assert.equal(answers[6].message.error.code,'INVALID_INPUT');
  self.onmessage({data:{id:6,unknown:true}});assert.equal(answers[7].message.id,6);assert.equal(answers[7].message.error.code,'INVALID_INPUT');
  self.onmessage({data:{id:7,pixels:cached,returnPixels:true}});assert.equal(answers[8].message.id,7);assert.equal(answers[8].message.data.summary.count,4);
 }finally{if(prior===undefined)delete globalThis.self;else globalThis.self=prior;}
});
test('Whole-image aggregation matches native counts, unique colours and channel means across native tiles',async()=>{
 const image=fixture(37,29),aggregate=createChannelHistogramAggregate();let actual;
 for(let y=0;y<image.height;y+=7)for(let x=0;x<image.width;x+=8){
  actual=aggregate.append(nativeTile(image,x,y,Math.min(8,image.width-x),Math.min(7,image.height-y)),{channel:1,start:19,end:210});
  assert.ok(actual.bins instanceof Float64Array);assert.ok(actual.cumulative instanceof Float64Array);
  const local=computeLocalChannelHistogram(fixture(4,4,()=>[255,0,255]));assert.equal(local.uniqueColors,1);
 }
 compare(actual,(await histogram(image,histogramParams({channel:1,start:19,end:210}))).data);
 assert.deepEqual(actual.channelMeans,computeLocalChannelHistogram(image).channelMeans);
 assert.equal(aggregate.pixels,image.width*image.height);assert.equal(aggregate.count,25);
});
test('Aggregate snapshots can be transferred while local work and following chunks keep their observations',()=>{
 const image=fixture(8,4),aggregate=createChannelHistogramAggregate(),first=aggregate.append(nativeTile(image,0,0,4,4));
 const transferred=structuredClone(first,{transfer:[first.bins.buffer,first.cumulative.buffer]});assert.equal(first.bins.byteLength,0);assert.equal(transferred.summary.count,16);
 computeLocalChannelHistogram(fixture(4,4,()=>[255,255,255]));
 const final=aggregate.append(nativeTile(image,4,0,4,4));compare(final,computeLocalChannelHistogram(image));assert.equal(final.summary.count,32);
 const before=final.bins.slice();assert.throws(()=>aggregate.append({width:4,height:4,format:'rgb8',data:new Uint8Array(4)}),{code:'INVALID_INPUT'});assert.equal(aggregate.pixels,32);assert.deepEqual(final.bins,before);
});
test('Worker keeps one aggregate across interleaved local requests, validates resets and releases final ownership',async()=>{
 const prior=globalThis.self,answers=[];globalThis.self={postMessage:(message,transfer=[])=>{const bytes=transfer.map(buffer=>buffer.byteLength);answers.push({message:structuredClone(message,{transfer}),bytes});}};
 try{
  await import('../sherloq-browser/assets/local-channel-histogram-worker.js?test-aggregate-worker');
  const first=fixture(4,4,()=>[10,20,30]),second=fixture(4,4,(x,y)=>x%2?[10,20,30]:[100,101,102]);
  self.onmessage({data:{id:'first',pixels:first,aggregate:{id:'source-a',reset:true}}});assert.deepEqual(answers.at(-1).message.aggregate,{id:'source-a',pixels:16,count:1,complete:false});assert.equal(answers.at(-1).message.data.uniqueColors,1);assert.equal(Object.hasOwn(answers.at(-1).message,'pixels'),false);assert.deepEqual(answers.at(-1).bytes,[8192,8192]);
  self.onmessage({data:{id:'local',pixels:fixture(4,4,()=>[0,0,255]),returnPixels:true}});assert.equal(answers.at(-1).message.data.uniqueColors,1);assert.equal(answers.at(-1).message.pixels.data.byteLength,48);
  self.onmessage({data:{id:'wrong-owner',pixels:second,aggregate:{id:'source-b'}}});assert.equal(answers.at(-1).message.error.code,'INVALID_INPUT');
  self.onmessage({data:{id:'bad-reset',pixels:null,aggregate:{id:'source-b',reset:true}}});assert.equal(answers.at(-1).message.error.code,'INVALID_INPUT');
  self.onmessage({data:{id:'last',pixels:second,params:{channel:0},aggregate:{id:'source-a',final:true}}});const final=answers.at(-1).message;assert.deepEqual(final.aggregate,{id:'source-a',pixels:32,count:2,complete:true});assert.equal(final.data.uniqueColors,2);assert.deepEqual(final.data.channelMeans,[32.5,40.25,48,38.75]);
 }finally{if(prior===undefined)delete globalThis.self;else globalThis.self=prior;}
});
test('Malformed aggregate controls and a restarted worker require a new explicit aggregate start',async()=>{
 const prior=globalThis.self,answers=[];globalThis.self={postMessage:message=>answers.push(message)};
 try{
  await import('../sherloq-browser/assets/local-channel-histogram-worker.js?test-aggregate-restart');
  for(const aggregate of [null,[],{}, {id:3},{id:''},{id:'a',reset:'yes'},{id:'a',reset:true,final:0}]){self.onmessage({data:{id:'malformed',pixels:fixture(1,1),aggregate}});assert.equal(answers.at(-1).error.code,'INVALID_INPUT');}
  self.onmessage({data:{id:'bad-pixel-return',pixels:fixture(1,1),returnPixels:true,aggregate:{id:'a',reset:true}}});assert.equal(answers.at(-1).error.code,'INVALID_INPUT');
  self.onmessage({data:{id:'open',pixels:fixture(1,1),aggregate:{id:'a',reset:true}}});assert.equal(answers.at(-1).aggregate.pixels,1);
  await import('../sherloq-browser/assets/local-channel-histogram-worker.js?test-aggregate-restarted-fresh');
  self.onmessage({data:{id:'old-owner',pixels:fixture(1,1),aggregate:{id:'a',final:true}}});assert.equal(answers.at(-1).error.code,'INVALID_INPUT');
  self.onmessage({data:{id:'new-owner',pixels:fixture(1,1,()=>[7,8,9]),aggregate:{id:'b',reset:true,final:true}}});assert.deepEqual(answers.at(-1).aggregate,{id:'b',pixels:1,count:1,complete:true});
  self.onmessage({data:{id:'already-final',pixels:fixture(1,1),aggregate:{id:'b'}}});assert.equal(answers.at(-1).error.code,'INVALID_INPUT');
 }finally{if(prior===undefined)delete globalThis.self;else globalThis.self=prior;}
});
