import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {TileCache,visibleTiles,sampleTile,createTiledSurface} from '../sherloq-browser/assets/tiled-surface.js';
import {exportRGBPNG} from '../sherloq-browser/assets/png-export.js';
function pixels(w,h){return{width:w,height:h,data:Uint8Array.from({length:w*h*3},(_,i)=>(i*31+(i>>>4))%256)};}
test('visible tiles use source coordinates, bound presentation size and cover seams',()=>{
 const list=visibleTiles(1025,513,{left:250,top:250,right:530,bottom:513},1);
 assert.equal(list.length,9);assert.ok(list.every(t=>t.width<=256&&t.height<=256&&t.step===1));
 assert.deepEqual(list.at(-1),{x:512,y:512,w:256,h:1,step:1,width:256,height:1,level:0});
 assert.equal(visibleTiles(100,100,{left:-100,top:-100,right:-1,bottom:-1},1).length,0);
 assert.equal(visibleTiles(100,100,{left:101,top:0,right:200,bottom:100},1).length,0);
 const huge=visibleTiles(1000000,1000000,{left:0,top:0,right:1000000,bottom:1000000},.001);
 assert.ok(huge.length<=64);assert.ok(huge.every(t=>t.width<=256&&t.height<=256));
});
test('100% tiles reproduce every RGB channel exactly including odd edges',()=>{
 const p=pixels(517,259),out=new Uint8Array(p.data.length);
 for(const t of visibleTiles(p.width,p.height,{left:0,top:0,right:p.width,bottom:p.height},1)){
  const rgba=new Uint8ClampedArray(t.width*t.height*4);sampleTile(p,t,rgba);
  for(let y=0;y<t.height;y++)for(let x=0;x<t.width;x++){const i=(y*t.width+x)*4,j=((t.y+y)*p.width+t.x+x)*3;out.set(rgba.subarray(i,i+3),j);assert.equal(rgba[i+3],255);}
 }
 assert.deepEqual(out,p.data);
});
test('low zoom samples display only, with no alteration of full RGB data',()=>{
 const p=pixels(513,259),before=p.data.slice(),t=visibleTiles(p.width,p.height,{left:0,top:0,right:p.width,bottom:p.height},.25)[0];
 assert.equal(t.step,4);const rgba=new Uint8ClampedArray(t.width*t.height*4);sampleTile(p,t,rgba);
 assert.deepEqual(rgba.slice(4,7),new Uint8ClampedArray(p.data.slice(12,15)));assert.deepEqual(p.data,before);
});
test('shared LRU enforces real canvas byte accounting, release preserves other surfaces',()=>{
 const cache=new TileCache(1024**2),a={width:512,height:256},b={width:512,height:256},c={width:512,height:256};
 cache.put('a:1',a);cache.put('b:1',b);cache.get('a:1');cache.put('c:1',c);
 assert.equal(cache.bytes,1024**2);assert.equal(b.width,0);assert.equal(cache.get('b:1'),undefined);
 cache.release('a:');assert.equal(a.width,0);assert.equal(cache.bytes,512*256*4);assert.equal(cache.get('c:1'),c);
 const surface=createTiledSurface(pixels(3,3),cache);assert.equal(surface.byteLength,27);surface.close();assert.equal(surface.byteLength,0);assert.throws(()=>surface.pixels,/released/);
});
async function unpack(blob){const data=new Uint8Array(await blob.arrayBuffer()),dv=new DataView(data.buffer),parts=[];let header;
 for(let i=8;i<data.length;){const size=dv.getUint32(i),type=new TextDecoder().decode(data.subarray(i+4,i+8));if(type==='IDAT')parts.push(data.subarray(i+8,i+8+size));if(type==='IHDR')header={width:dv.getUint32(i+8),height:dv.getUint32(i+12),depth:data[i+16],type:data[i+17]};i+=size+12;}
 return{header,raw:inflateSync(Buffer.concat(parts))};
}
test('streamed PNG retains all pixels and full dimensions across scanline batches',async()=>{
 const p=pixels(517,259),before=p.data.slice(),{header,raw}=await unpack(await exportRGBPNG(p));
 assert.deepEqual(header,{width:517,height:259,depth:8,type:2});assert.equal(raw.length,259*(517*3+1));
 for(let y=0;y<p.height;y++){const start=y*(p.width*3+1);assert.equal(raw[start],0);assert.deepEqual(new Uint8Array(raw.subarray(start+1,start+1+p.width*3)),p.data.slice(y*p.width*3,(y+1)*p.width*3));}assert.deepEqual(p.data,before);
});
test('encoded export budget refuses output and cancellation never resolves a partial PNG',async()=>{
 await assert.rejects(exportRGBPNG(pixels(127,91),{maxBytes:50}),e=>e.code==='EXPORT_BUDGET');
 const controller=new AbortController();let ticks=0;await assert.rejects(exportRGBPNG(pixels(517,259),{signal:controller.signal,onProgress:()=>{ticks++;controller.abort();}}),e=>e.code==='CANCELLED');assert.equal(ticks,1);
 const already=new AbortController();already.abort();await assert.rejects(exportRGBPNG(pixels(3,3),{signal:already.signal}),e=>e.code==='CANCELLED');
 assert.equal((await unpack(await exportRGBPNG(pixels(3,3)))).header.width,3);
});

test('very wide PNG scanlines are segmented without changing pixels',async()=>{const p=pixels(100003,1),{raw}=await unpack(await exportRGBPNG(p));assert.equal(raw[0],0);assert.deepEqual(new Uint8Array(raw.subarray(1)),p.data);});
