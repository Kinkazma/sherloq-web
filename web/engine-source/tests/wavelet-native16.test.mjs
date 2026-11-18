import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';
import {createRgb16Bank} from '../src/rgb16-surface.js';
import {segmentedWavelet} from '../src/segmented-wavelet.js';
import {wavelets} from '../src/wavelets.js';
import {waveletStreamMath} from '../src/wavelet-stream-math.js';
const fixture=JSON.parse(await readFile(new URL('./wavelet-native16-reference.json',import.meta.url))),hash=array=>createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
async function source(data,width,height,budget,sourceDepth=16){const bank=await createRgb16Bank({width,height,budget,storage:'memory',sourceDepth,color:{primaries:'srgb',transfer:'srgb'}});await bank.writeBand({y:0,rows:height,data:new Uint8Array(data.buffer,data.byteOffset,data.byteLength)});return {bank,surface:await bank.seal()};}

test('full native16 decomposition and presentation match PyWavelets 1.5.0 without input quantization',async()=>{
 const {width,height}=fixture,data=Uint16Array.from({length:width*height*3},(_,i)=>(i*73+Math.floor(i/7)*19)%60000+2570);assert.equal(hash(data),fixture.sourceSha256);
 const budget=new Budget(80*1024**2),input=await source(data,width,height,budget,14);let cache;
 try{for(const row of fixture.cases){if(cache?.wavelet!==row.params.wavelet){await cache?.dispose();cache=undefined;}
  const result=await segmentedWavelet(input,row.params,{budget,cache,blockPixels:499,backend:'cpu'});cache=result.waveletCache;
  try{assert.equal(result.data.inputDepth,16);assert.equal(result.data.presentationOutputDepth,8);const part=await result.surface.readWindow();try{assert.equal(hash(part.pixels.data),row.displaySha256,JSON.stringify(row.params));}finally{part.release();}
   const bands=[cache.a,...cache.details.flat()];assert.equal(bands.length,row.coefficientBands.length);
   for(let i=0;i<bands.length;i++){const values=await bands[i].read(0,0,bands[i].width,bands[i].height);assert.equal(hash(values),row.coefficientBands[i].sha256,'full16 coefficient '+row.params.wavelet+'/'+i);}
   const math=await waveletStreamMath();let reconstructed={width:cache.a.width,height:cache.a.height,values:await cache.a.read(0,0,cache.a.width,cache.a.height)};
   for(let level=cache.maximumLevel-1;level>=0;level--){const [hp,vp,dp]=cache.details[level],crop=new Float64Array(hp.width*hp.height);for(let y=0;y<hp.height;y++)crop.set(reconstructed.values.subarray(y*reconstructed.width,y*reconstructed.width+hp.width),y*hp.width);const [h,v,d]=await Promise.all([hp,vp,dp].map(plane=>plane.read(0,0,plane.width,plane.height)));if(row.params.threshold&&level<Math.min(3,cache.maximumLevel))for(const [values,plane]of [[h,hp],[v,vp],[d,dp]])math.threshold(values,plane.maximum,row.params.threshold,row.params.mode);const lo=math.up(crop,v,hp.width,hp.height,row.params.wavelet,1),hi=math.up(h,d,hp.width,hp.height,row.params.wavelet,1);reconstructed=math.up(lo.values,hi.values,lo.width,lo.height,row.params.wavelet,0);}
   const final=new Float64Array(width*height);for(let y=0;y<height;y++)final.set(reconstructed.values.subarray(y*reconstructed.width,y*reconstructed.width+width),y*width);assert.equal(hash(final),row.reconstructionSha256,'full binary64 reconstruction '+JSON.stringify(row.params));
  }finally{await result.surface.dispose();}
 }
 const original=await input.surface.readWindow();try{assert.equal(hash(original.pixels.data),fixture.sourceSha256);}finally{original.release();}
 }finally{await cache?.dispose();await input.bank.dispose();}assert.equal(budget.total(),0);
});

test('weak low-bit wavelet details survive 10/12/14-bit source metadata and are absent after RGB8 reduction',async()=>{
 for(const sourceDepth of [10,12,14]){const width=65,height=61,budget=new Budget(64*1024**2),data=Uint16Array.from({length:width*height*3},(_,i)=>33000+(i*13+Math.floor(i/11))%17),reduced=Uint16Array.from(data,value=>Math.round(value/257)*257),native=await source(data,width,height,budget,sourceDepth),quantized=await source(reduced,width,height,budget,sourceDepth),p={wavelet:'db2',threshold:31};let a,b;
  try{a=await segmentedWavelet(native,p,{budget});b=await segmentedWavelet(quantized,p,{budget});const details=await a.waveletCache.details[0][2].read(0,0,a.waveletCache.details[0][2].width,a.waveletCache.details[0][2].height),lost=await b.waveletCache.details[0][2].read(0,0,b.waveletCache.details[0][2].width,b.waveletCache.details[0][2].height);assert.ok(Math.max(...details.map(Math.abs))>1);assert.ok(Math.max(...lost.map(Math.abs))<1e-10);assert.notEqual(hash(details),hash(lost));
   const part=await native.surface.readWindow();try{assert.deepEqual(part.pixels.data,data);}finally{part.release();}
  }finally{for(const result of [a,b]){await result?.surface.dispose();await result?.waveletCache.dispose();}await native.bank.dispose();await quantized.bank.dispose();}assert.equal(budget.total(),0);
 }
});

test('sparse binary64 correction reproduces every full native final-level value for all 59 wavelets',async()=>{
 const math=await waveletStreamMath();for(const name of wavelets){const filter=math.info(name,256,256).filterLength,width=Math.max(31,filter/2),height=Math.max(29,filter/2),n=width*height;
  const bands=Array.from({length:4},(_,k)=>Float64Array.from({length:n},(_,i)=>(Math.sin(i*1.7+k*3.1)*60000+(i%5)*1e-12)*(i%13?1:0))),[a,h,v,d]=bands,lo=math.up(a,v,width,height,name,1),hi=math.up(h,d,width,height,name,1),full=math.up(lo.values,hi.values,lo.width,lo.height,name,0),indices=Uint32Array.from({length:full.values.length},(_,i)=>i),sparse=math.finalPixels(a,h,v,d,width,height,name,indices,full.width);assert.deepEqual(sparse,full.values,name);
 }
});

test('native16 cancellation and cache depth/source identity preserve existing coefficient owners',async()=>{
 const width=65,height=61,budget=new Budget(64*1024**2),data=Uint16Array.from({length:width*height*3},(_,i)=>(i*73)%65536),native=await source(data,width,height,budget),p={wavelet:'db2',threshold:31};let initial;
 try{initial=await segmentedWavelet(native,p,{budget});const retained=budget.total(),controller=new AbortController();await assert.rejects(segmentedWavelet(native,{...p,threshold:67},{budget,cache:initial.waveletCache,signal:controller.signal,onProgress:event=>{if(event.phase==='render')controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.total(),retained);await assert.rejects(segmentedWavelet({surface:{...native.surface,descriptor:{...native.surface.descriptor,id:'other'}}},p,{budget,cache:initial.waveletCache}),{code:'INVALID_INPUT'});await assert.rejects(segmentedWavelet({surface:{...native.surface,descriptor:{...native.surface.descriptor,format:'rgb8'}}},p,{budget,cache:initial.waveletCache}),{code:'INVALID_INPUT'});assert.equal(budget.total(),retained);
 }finally{await initial?.surface.dispose();await initial?.waveletCache.dispose();await native.bank.dispose();}assert.equal(budget.total(),0);
});

test('overlapping coefficient bands preserve the full final IDWT at every odd crop and band boundary',async()=>{
 const math=await waveletStreamMath();for(const name of wavelets){const filter=math.info(name,256,256).filterLength,width=Math.max(31,filter/2),height=Math.max(29,filter/2),n=width*height,bands=Array.from({length:4},(_,k)=>Float64Array.from({length:n},(_,i)=>Math.sin(i*1.7+k*3.1)*60000)),[a,h,v,d]=bands,lo=math.up(a,v,width,height,name,1),hi=math.up(h,d,width,height,name,1),full=math.up(lo.values,hi.values,lo.width,lo.height,name,0),targetWidth=full.width-1,targetHeight=full.height-1;
  for(let y=0;y<targetHeight;y+=6){const rows=Math.min(6,targetHeight-y),top=y/2,coefficientRows=Math.ceil((rows+filter-2)/2),parts=bands.map(values=>values.slice(top*width,(top+coefficientRows)*width)),indices=Uint32Array.from({length:targetWidth*rows},(_,i)=>i),actual=math.finalPixels(...parts,width,coefficientRows,name,indices,targetWidth),expected=new Float64Array(targetWidth*rows);for(let row=0;row<rows;row++)expected.set(full.values.subarray((y+row)*full.width,(y+row)*full.width+targetWidth),row*targetWidth);assert.deepEqual(actual,expected,name+'/'+y);
  }
 }
});
