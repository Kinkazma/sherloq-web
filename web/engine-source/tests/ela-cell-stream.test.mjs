import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createElaCellRows,segmentedElaCellPlane} from '../src/ela-cell-stream.js';import {createElaCellDescriber} from '../src/ela-cell-describe.js';
import {Budget} from '../src/cache.js';import {imageCodec} from '../src/codecs.js';import {jpegCodec} from '../src/jpeg.js';import {createRgbSurface} from '../src/rgb-surface.js';
const base=new URL('data/',import.meta.url),read=async name=>new Uint8Array(await readFile(new URL(name,base)));
async function stream(image,compressed,block,budget){const reader=await createElaCellRows(image.width,image.height,block,{budget});try{for(let y=0,i=0;y<image.height;i++){const rows=Math.min([1,32,73,7][i%4],image.height-y),lo=y*image.width*3,hi=(y+rows)*image.width*3;await reader.push(image.data.subarray(lo,hi),compressed.data.subarray(lo,hi),{y,rows});y+=rows;}return await reader.finish();}finally{reader.dispose();}}
test('27 streamed cell descriptors retain native profiles, background and support across arbitrary bands',async()=>{
 const ref=JSON.parse(new TextDecoder().decode(await read('ela-describe-native.json'))),texture=await imageCodec.decode(await read('ela-content.png')),odd={width:473,height:277,format:'rgb8',data:new Uint8Array(473*277*3)};for(let y=0;y<odd.height;y++)odd.data.set(texture.data.subarray(y*texture.width*3,(y*texture.width+odd.width)*3),y*odd.width*3);
 const sources=[await imageCodec.decode(await read('recompression-2.png')),texture,odd],budget=new Budget(96*1024**2);let count=0;
 for(const expected of ref.cases){const image=sources[Number(expected.source.split('-')[1].split('.')[0])],quality=Number(expected.compressed.split('-')[2].split('.')[0]),compressed=await jpegCodec.recompress(image,quality),result=await stream(image,compressed,expected.block,budget);
  try{for(const key of ['content','profiles','background','usable']){const values=expected[key].flat(4).map(Number);assert.equal(result[key].length,values.length);for(let i=0;i<values.length;i++)assert.ok(Math.abs(result[key][i]-values[i])<=(key==='content'?3e-7:0),expected.source+'/'+expected.block+'/'+key+'/'+i);}count++;}finally{result.release();}assert.equal(budget.total(),0);
 }assert.equal(count,27);
});
test('partial bottom cells and halo boundaries match the qualified contiguous descriptor exactly',async()=>{
 const budget=new Budget(144*1024**2),describer=createElaCellDescriber({budget});try{
  for(const height of [16,17,23,24,31,32,33,39,40,41]){const width=41,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*59+(i>>8)*83)&255),image={width,height,data,format:'rgb8'},compressed=await jpegCodec.recompress(image,75);
   for(const block of [16,24,32].filter(b=>b<=height)){const expected=await describer.describe(image,compressed,block),actual=await stream(image,compressed,block,budget);try{for(const key of ['content','profiles','background','usable'])assert.deepEqual(actual[key],expected[key],height+'/'+block+'/'+key);}finally{expected.release();actual.release();}}
  }
 }finally{describer.dispose();}assert.equal(budget.total(),0);
});
test('streamed descriptor error, memory, cancellation and reuse retain ownership rules',async()=>{
 const budget=new Budget(128*1024**2);const wide=await createElaCellRows(4000,4000,96,{budget});wide.dispose();assert.equal(budget.total(),0);await assert.rejects(createElaCellRows(64,64,16,{budget:new Budget(1024)}),{code:'MEMORY_LIMIT'});
 for(const kind of ['incomplete','order','callback']){const reader=await createElaCellRows(33,65,16,{budget,onProgress(){if(kind==='callback')throw Error('consumer failed');}});try{const a=new Uint8Array(33*65*3);if(kind==='incomplete')await assert.rejects(reader.finish(),{code:'INVALID_INPUT'});else if(kind==='order')await assert.rejects(reader.push(a,a,{y:1,rows:65}),{code:'INVALID_INPUT'});else await assert.rejects(reader.push(a,a,{y:0,rows:65}),/consumer failed/);}finally{reader.dispose();}assert.equal(budget.total(),0);}
 const width=129,height=137,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*17+(i>>7)*29)&255),image={surface:createRgbSurface({byteLength:data.length,readInto:(out,at)=>out.set(data.subarray(at,at+out.length))},{width,height,budget,ownsStore:false})};
 try{const controller=new AbortController();await assert.rejects(segmentedElaCellPlane(image,75,32,{budget,signal:controller.signal,onProgress:e=>{if(e.phase==='ela-cell-describe')controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);const result=await segmentedElaCellPlane(image,75,32,{budget});try{assert.equal(result.metrics.recompressions,0);assert.equal(result.rows,4);assert.equal(result.cols,4);}finally{result.release();}}finally{await image.rgbRecompression?.dispose();await image.surface.dispose();}assert.equal(budget.total(),0);
});

test('bounded descriptor windows preserve native full-width halo arithmetic and distant cell identities',async(t)=>{
 const ref=JSON.parse(new TextDecoder().decode(await read('ela-cell-wide-native.json'))),budget=new Budget(96*1024**2);
 for(const expected of ref.cases){const {width,height,block,quality}=expected,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*59+(i>>8)*83+(i>>15)*31)&255),image={width,height,data,format:'rgb8'},compressed=await jpegCodec.recompress(image,quality),actual=await stream(image,compressed,block,budget);
  try{for(const key of ['content','profiles','background','usable']){const values=expected[key].flat(4).map(Number);assert.equal(actual[key].length,values.length);let maximum=0,total=0;for(let i=0;i<values.length;i++){const error=Math.abs(actual[key][i]-values[i]);maximum=Math.max(maximum,error);total+=error;assert.ok(error<=(key==='usable'?0:key==='content'?3e-7:1e-5),width+'/'+key+'/'+i+': '+actual[key][i]+' vs '+values[i]);}t.diagnostic(JSON.stringify({width,key,maximum,mean:total/values.length}));}}finally{actual.release();}assert.equal(budget.total(),0);
 }
});
