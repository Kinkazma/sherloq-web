import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {initContrastWasm,contrastRows,contrastCells,contrastHeapBytes,CONTRAST_HEAP_BYTES} from '../src/contrast-math.js';
await initContrastWasm({wasmBinary:await readFile(new URL('../vendor/contrast/contrast.wasm',import.meta.url))});
const hash=values=>createHash('sha256').update(new Uint8Array(values.buffer,values.byteOffset,values.byteLength)).digest('hex');
test('Contrast core rows preserve native derivatives/padded block maps and all159 median/nearest displays',async()=>{
 const reference=JSON.parse(await readFile(new URL('../fixtures/contrast-reference.json',import.meta.url)));reference.cases.push(...JSON.parse(await readFile(new URL('../fixtures/contrast-reduction-reference.json',import.meta.url))).cases);let count=0;
 for(const f of reference.cases){const input=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url)));
  for(const e of f.expected){const b=e.block,pw=f.width+b-f.width%b,ph=f.height+b-f.height%b,maps={cols:pw/b+1,rows:ph/b+1,values:new Float32Array((pw/b+1)*(ph/b+1)*3)};
   for(let y=0;y<ph;y+=b){const top=Math.max(0,y-1),bottom=Math.min(ph,y+b+1),data=new Uint8Array(pw*(bottom-top)*3);for(let sy=top;sy<Math.min(f.height,bottom);sy++)data.set(input.subarray(sy*f.width*3,(sy+1)*f.width*3),(sy-top)*pw*3);const values=await contrastRows({width:pw,height:bottom-top,format:'rgb8',data},y-top,b,b);maps.values.set(values,y/b*maps.cols*3);}
   assert.equal(hash(maps.values),e.sha256,f.name+' map '+b);assert.deepEqual([maps.rows,maps.cols,3],e.shape);
   for(let mode=0;mode<3;mode++){const cells=await contrastCells(maps,mode),out=new Uint8Array(f.width*f.height*3);for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const value=cells[Math.floor(y/b)*maps.cols+Math.floor(x/b)],i=(y*f.width+x)*3;out[i]=out[i+1]=out[i+2]=value;}assert.equal(hash(out),e.views[mode],f.name+' view '+mode+' block '+b);count++;}
  }
 }assert.equal(count,159);assert.equal(contrastHeapBytes(),CONTRAST_HEAP_BYTES);
});
