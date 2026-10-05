import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {createEnergyRows,energyStreamBytes,segmentedEnergyPlane} from '../src/energy-stream.js';
import {Budget} from '../src/cache.js';import {createRgbSurface} from '../src/rgb-surface.js';
import {jpegCodec} from '../src/jpeg.js';import {describeEnergy} from '../src/energy-primitives.js';
const root=new URL('../fixtures/ela-energy/',import.meta.url),reference=JSON.parse(await readFile(new URL('primitives.json',root))),payload=gunzipSync(await readFile(new URL('primitives.bin.gz',root)));
const bytes=part=>new Uint8Array(payload.buffer,payload.byteOffset+part.offset,part.length);
test('all60 native energy planes remain exact across variable row bands and tiny reflected edges',async()=>{
 for(const item of reference.cases){const {width,height}=item,budget=new Budget(energyStreamBytes(width,height)),output=new Uint8Array(width*height*4);let at=0;
  const filter=createEnergyRows(width,height,{budget,async write(data,y,rows){assert.equal(y,at);assert.equal(data.length,rows*width*4);assert.ok(rows<=32);await Promise.resolve();output.set(data,y*width*4);at+=rows;}});
  try{const original=bytes(item.original),compressed=bytes(item.compressed);for(let y=0,band=0;y<height;band++){const rows=Math.min([1,7,32,3][band%4],height-y);await filter.push(original.subarray(y*width*3,(y+rows)*width*3),compressed.subarray(y*width*3,(y+rows)*width*3),{y,rows});y+=rows;}await filter.finish();assert.equal(at,height);assert.deepEqual(output,bytes(item.energy),item.name);assert.equal(budget.total(),0);}finally{filter.dispose();}
 }
});
test('incomplete, misordered, cancelled and failing energy consumers release their bounded workspace',async()=>{
 assert.throws(()=>createEnergyRows(97,97,{budget:new Budget(1),write(){}}),{code:'MEMORY_LIMIT'});
 for(const kind of ['short','order','cancel','write']){const budget=new Budget(1024**2),controller=new AbortController(),filter=createEnergyRows(9,40,{budget,signal:controller.signal,write(){if(kind==='write')throw Error('write failed');}}),data=new Uint8Array(9*40*3);
  try{if(kind==='short')await assert.rejects(filter.finish(),{code:'INVALID_INPUT'});else if(kind==='order')await assert.rejects(filter.push(data,data,{y:1,rows:40}),{code:'INVALID_INPUT'});else if(kind==='cancel'){controller.abort();await assert.rejects(filter.push(data,data,{y:0,rows:40}),{code:'CANCELLED'});}else await assert.rejects(filter.push(data,data,{y:0,rows:40}),/write failed/);}finally{filter.dispose();}assert.equal(budget.total(),0);
 }
});
test('global JPEG to segmented energy reuses completed encoded qualities and cleans failed output',async()=>{
 const width=131,height=137,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*13+(i>>8)*91)&255),budget=new Budget(96*1024**2),image={surface:createRgbSurface({byteLength:data.length,readInto:(out,at)=>out.set(data.subarray(at,at+out.length))},{width,height,budget,ownsStore:false})},original={data,width,height,format:'rgb8'};
 try{const decoded=await jpegCodec.recompress(original,75),expected=await describeEnergy(original,decoded);
  for(let repeat=0;repeat<2;repeat++){const plane=await segmentedEnergyPlane(image,75,{budget});try{const actual=new Uint8Array(width*height*4);await plane.store.readInto(actual);assert.deepEqual(actual,new Uint8Array(expected.energy.buffer));assert.equal(plane.metrics.recompressions,repeat?0:1);assert.equal(plane.metrics.energyWorkspaceBytes,energyStreamBytes(width,height));}finally{await plane.dispose();}}
  const retained=budget.retained,controller=new AbortController();await assert.rejects(segmentedEnergyPlane(image,75,{budget,signal:controller.signal,onProgress:e=>{if(e.phase==='jpeg-render')controller.abort();}}),{code:'CANCELLED'});assert.equal(budget.active,0);assert.equal(budget.retained,retained);
 }finally{await image.rgbRecompression?.dispose();await image.surface.dispose();}assert.equal(budget.total(),0);
});
