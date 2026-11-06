import test from 'node:test';
import assert from 'node:assert/strict';
import {computeNativeChannelHistogram,createNativeHistogramAggregate,nativeHistogramPixel,nativeHistogramSummary} from '../sherloq-browser/assets/native-channel-histogram-core.js';
import {histogramSummary} from '../sherloq-browser/assets/unified-engine/src/histogram.js';
const image=(space,depth,values,width=2)=>({space,depth,channels:{CMYK:4,RGB:3,GRAY:1}[space],format:space.toLowerCase()+depth,width,height:values.length/({CMYK:4,RGB:3,GRAY:1}[space]*width),data:depth===8?Uint8Array.from(values):Uint16Array.from(values)});
test('Native CMYK keeps four independent ink channels and exact means without an RGB inversion',()=>{
 const p=image('CMYK',8,[0,10,20,30,100,110,120,130,200,210,220,230,255,245,235,225]),d=computeNativeChannelHistogram(p);
 assert.deepEqual(d.channels,['C','M','Y','K']);assert.equal(d.binCount,256);assert.deepEqual(d.channelMeans,[138.75,143.75,148.75,153.75]);assert.deepEqual(nativeHistogramPixel(p,1,1),{values:[255,245,235,225],space:'CMYK',depth:8});
 for(let c=0;c<4;c++){assert.equal(d.bins.subarray(c*256,(c+1)*256).reduce((a,b)=>a+b),4);assert.equal(d.cumulative[c*256+255],4);assert.deepEqual(nativeHistogramSummary(d,c),histogramSummary(d.bins,c,0,255,4));}
 assert.equal(d.uniqueColors,null,'CMYK tuple uniqueness is not falsely labelled as maintained RGB-render uniqueness');
});
test('Native unsigned 16-bit channels keep all 65536 classes and exact sample values',()=>{
 const p=image('CMYK',16,[0,1,256,65535,65535,256,1,0]),d=computeNativeChannelHistogram(p);assert.equal(d.binCount,65536);assert.equal(d.bins.length,4*65536);assert.deepEqual(d.channelMeans,[32767.5,128.5,128.5,32767.5]);assert.deepEqual(nativeHistogramPixel(p,1,0).values,[65535,256,1,0]);for(let c=0;c<4;c++)assert.equal(d.cumulative[(c+1)*65536-1],2);assert.equal(nativeHistogramSummary(d,0).mean,32767.5);
});
test('Tiled native aggregation equals one native frame across all values and every summary',()=>{
 const values=Array.from({length:17*5*4},(_,i)=>(i*79+(i>>>2))%256),p=image('CMYK',8,values,17),expected=computeNativeChannelHistogram(p),aggregate=createNativeHistogramAggregate();let result;
 for(let y=0;y<5;y++)result=aggregate.append(image('CMYK',8,values.slice(y*17*4,(y+1)*17*4),17));
 assert.deepEqual(result,expected);for(let c=0;c<4;c++)for(const [start,end]of [[0,255],[20,80],[200,20]])assert.deepEqual(nativeHistogramSummary(result,c,start,end),nativeHistogramSummary(expected,c,start,end));
});
test('Native gray and RGB16 keep their own declared number of channels',()=>{
 const gray=computeNativeChannelHistogram(image('GRAY',16,[0,255,256,65535]));assert.deepEqual(gray.channels,['Gray']);assert.equal(gray.total,4);assert.equal(nativeHistogramSummary(gray,0).count,4);const rgb=computeNativeChannelHistogram(image('RGB',16,[0,1,2,65535,65534,65533]));assert.deepEqual(rgb.channels,['R','G','B']);assert.deepEqual(rgb.channelMeans,[32767.5,32767.5,32767.5]);
});
test('Unqualified native layouts and out-of-grid pixel reads fail clearly',()=>{
 assert.throws(()=>computeNativeChannelHistogram(image('CMYK',8,[1,2,3,4],1).data),{code:'INVALID_INPUT'});const p=image('CMYK',8,[1,2,3,4],1);assert.throws(()=>nativeHistogramPixel(p,1,0),{code:'INVALID_INPUT'});const aggregate=createNativeHistogramAggregate();aggregate.append(p);assert.throws(()=>aggregate.append(image('GRAY',8,[1],1)),{code:'INVALID_INPUT'});
});
