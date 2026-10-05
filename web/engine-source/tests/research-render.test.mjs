import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {renderResearch} from '../src/research-render.js';import {Budget} from '../src/cache.js';
for(const c of JSON.parse(await readFile(new URL('./data/research-render.json',import.meta.url),'utf8')))test(c.method+' render '+c.mode,async()=>{
 const budget=new Budget(1024**2),image={width:c.width,height:c.height,data:Uint8Array.from(c.rgb)},data={...c.result};
 if(c.method==='catnet'){data.map=Float32Array.from(c.result.map.flat());data.width=3;data.height=2;}else{data.suspicion=Float32Array.from(c.result.suspicion.flat());data.local_grid=Uint8Array.from(c.result.local_grid.flat());}
 const output=await renderResearch(image,data,c.mode,{budget});assert.deepEqual([...output.data],c.expected);output.release();assert.equal(budget.active,0);
});
test('CFA window rendering uses original global coordinates including native border',async()=>{
 const width=49,height=41,rgb=Uint8Array.from({length:width*height*3},(_,i)=>i%251),data={metadata:{method:'adaptive_cfa',origin:[4,4],valid_shape:[32,40],block:8},suspicion:Float32Array.from({length:20},(_,i)=>i/20),local_grid:Uint8Array.from({length:20},(_,i)=>i%4)};
 for(const mode of [0,1,2]){
  const full=await renderResearch({width,height,data:rgb},data,mode);
  for(const rect of [{x:0,y:0,width:13,height:11},{x:29,y:27,width:20,height:14}]){
   const crop=new Uint8Array(rect.width*rect.height*3),expected=new Uint8Array(crop.length);
   for(let y=0;y<rect.height;y++){const at=((rect.y+y)*width+rect.x)*3;crop.set(rgb.subarray(at,at+rect.width*3),y*rect.width*3);expected.set(full.data.subarray(at,at+rect.width*3),y*rect.width*3);}
   const output=await renderResearch({width:rect.width,height:rect.height,data:crop},data,mode,{origin:[rect.x,rect.y]});assert.deepEqual(output.data,expected);output.release();
  }full.release();
 }
});
