import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {sampleSurface,samplePixels,displayGeometry,MAX_DISPLAY_PIXELS} from '../src/display-sampling.js';
import {renderRitaWindow,sampleRitaWindow} from '../src/rita-render.js';
function fixture(width,height,{channels=3,fast=true,budget}={}){
 const pixels=Uint8Array.from({length:width*height*channels},(_,i)=>(i*53)%256),scores=Float32Array.from({length:width*height},(_,i)=>(i%11)/10),calls={samples:0,windows:0,scores:0},surface={descriptor:{width,height,format:'rgb8'},async readWindow(r){calls.windows++;const data=new Uint8Array(r.width*r.height*channels),release=budget.reserve(data.byteLength);for(let y=0;y<r.height;y++)data.set(pixels.subarray(((r.y+y)*width+r.x)*channels,((r.y+y)*width+r.x+r.width)*channels),y*r.width*channels);return {pixels:{width:r.width,height:r.height,data},release};}};
 if(fast)surface.readSampledWindow=async tile=>{calls.samples++;const g=displayGeometry({width,height},tile),data=new Uint8Array(g.width*g.height*channels),release=budget.reserve(data.byteLength);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++)for(let c=0;c<channels;c++)data[(y*g.width+x)*channels+c]=pixels[((g.y+y*g.step)*width+g.x+x*g.step)*channels+c];return {pixels:{width:g.width,height:g.height,data},release,metrics:{sourceBytes:data.byteLength}};};
 return {image:{surface},result:{data:{width,height,map:{async readInto(target,at){calls.scores++;target.set(scores.subarray(at,at+target.length));return target;}}}},pixels,scores,calls,channels,width,height};
}
function expected(f,view,tile,{threshold=.5,opacity=.6}={}){
 const g=displayGeometry(f,tile),data=new Uint8Array(g.width*g.height*3);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
  const from=(g.y+y*g.step)*f.width+g.x+x*g.step,value=f.scores[from],at=(y*g.width+x)*3,selected=value>=threshold;
  if(view===0||view==='overlay')for(let c=0;c<3;c++){const source=f.pixels[from*f.channels+c];data[at+c]=selected?Math.round(source*(1-opacity)+(c===0?255:0)*opacity):source;}
  else if(view===2||view==='mask')data[at]=selected?255:0;
  else data[at]=selected?Math.round(Math.fround(value*255)):0;
 }return data;
}
test('direct RITA display exactly matches native rendering then sampling for every view/threshold/opacity',async()=>{
 const budget=new Budget(8*1024**2);for(const channels of [3,4]){
  const f=fixture(17,13,{channels,budget});for(const tile of [{x:0,y:0,w:17,h:13,step:1},{x:2,y:1,w:13,h:11,step:3},{x:16,y:12,w:1,h:1,step:4}])for(const view of ['overlay','probability','map','mask',0,1,2])for(const options of [{threshold:.5,opacity:.6},{threshold:0,opacity:0},{threshold:1,opacity:1},{threshold:.73,opacity:.42}]){
   const frame=await sampleRitaWindow(f.image,f.result,view,tile,{budget,...options});assert.deepEqual(frame.pixels.data,expected(f,view,tile,options));frame.release();assert.equal(budget.active,0);
   const full=await renderRitaWindow(f.image,f.result,view,undefined,{budget,...options}),sample=await samplePixels(full,tile,{budget});assert.deepEqual(sample.pixels.data,expected(f,view,tile,options));sample.release();full.release();assert.equal(budget.active,0);
  }
 }
});
test('overlay sampling asks the original surface for one sampled frame and one scientific row per output row',async()=>{
 const budget=new Budget(1024**2),f=fixture(101,97,{budget}),tile={x:1,y:2,w:97,h:93,step:4},frame=await sampleRitaWindow(f.image,f.result,'overlay',tile,{budget});assert.equal(f.calls.samples,1);assert.equal(f.calls.windows,0);assert.equal(f.calls.scores,Math.ceil(tile.h/tile.step));assert.deepEqual(frame.pixels.data,expected(f,'overlay',tile));frame.release();assert.equal(budget.active,0);
});
test('RGB source fallback and scientific-map-only views preserve sampling origin and skip unneeded source reads',async()=>{
 const budget=new Budget(1024**2),f=fixture(25,19,{fast:false,budget}),tile={x:3,y:4,w:19,h:13,step:3};
 for(const view of ['mask','probability','overlay']){const before=f.calls.windows,frame=await sampleRitaWindow(f.image,f.result,view,tile,{budget});assert.deepEqual(frame.pixels.data,expected(f,view,tile));assert.equal(f.calls.windows-before,view==='overlay'?Math.ceil(tile.h/tile.step):0);frame.release();assert.equal(budget.active,0);}
});
test('direct and ordinary display retain quotas and release every frame on cancellation/read failure',async()=>{
 const budget=new Budget(1024**2),f=fixture(25,19,{budget}),tile={x:0,y:0,w:25,h:19,step:1},controller=new AbortController();controller.abort();
 await assert.rejects(sampleRitaWindow(f.image,f.result,'overlay',tile,{budget,signal:controller.signal}),e=>e.code==='CANCELLED');assert.equal(f.calls.samples,0);assert.equal(budget.active,0);
 await assert.rejects(renderRitaWindow(f.image,f.result,'overlay',undefined,{budget,signal:controller.signal}),e=>e.code==='CANCELLED');assert.equal(budget.active,0);
 const tooLarge={data:{width:MAX_DISPLAY_PIXELS+1,height:1}};await assert.rejects(sampleRitaWindow(null,tooLarge,'mask',{x:0,y:0,w:MAX_DISPLAY_PIXELS+1,h:1,step:1},{budget}),e=>e.code==='INVALID_INPUT');assert.equal(budget.active,0);
 const live=new AbortController();f.result.data.map.readInto=async()=>{live.abort();};await assert.rejects(sampleRitaWindow(f.image,f.result,'overlay',tile,{budget,signal:live.signal}),e=>e.code==='CANCELLED');assert.equal(budget.active,0);
 f.result.data.map.readInto=async()=>{throw Error('scientific row unavailable');};await assert.rejects(sampleRitaWindow(f.image,f.result,'overlay',tile,{budget}),/scientific row unavailable/);assert.equal(budget.active,0);
 const tiny=new Budget(1);await assert.rejects(sampleRitaWindow(f.image,f.result,'mask',tile,{budget:tiny}),e=>e.code==='MEMORY_LIMIT');assert.equal(tiny.active,0);
});
