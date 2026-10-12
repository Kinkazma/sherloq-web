import test from 'node:test';
import assert from 'node:assert/strict';
import {renderSparseCopy} from '../src/sparse-copy-view.js';
import {Budget} from '../src/cache.js';

test('SSG presents its exact mask with the compiled renderer and keeps the original unchanged',async()=>{
 const width=7,height=5,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*13)%256),original=data.slice(),mask=new Uint8Array(width*height);mask[9]=1;mask[23]=1;
 const image={format:'rgb8',width,height,data},result={params:{algorithm:'SSG'},width,height,mask,points:new Float64Array(0),pairs:new Float64Array(0),colors:new Uint8Array(0),groups:[],bases:[]},budget=new Budget(768*1024**2),leases=[];
 const reserveMemory=n=>{const free=budget.reserve(n);leases.push(free);return free;};
 try{
  const overlay=await renderSparseCopy(image,result,{circles:false,lines:false,points:false,areas:true},{reserveMemory});
  for(let i=0;i<mask.length;i++)for(let c=0;c<3;c++)assert.equal(overlay.pixels.data[i*3+c],mask[i]?Math.round(original[i*3+c]*.5+[255,50,25][c]*.5):original[i*3+c]);
  const plain=await renderSparseCopy(image,result,{circles:false,lines:false,points:false,areas:false},{reserveMemory});assert.deepEqual(plain.pixels.data,original);assert.deepEqual(data,original);
  await assert.rejects(renderSparseCopy(image,{...result,width:6},{areas:true},{reserveMemory}),/original image coordinates/);
 }finally{for(const free of leases)free();}
 assert.equal(budget.total(),0);
});
