import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {rolledRgbSurface} from '../src/rolled-rgb-surface.js';
import {rgbRecompressionPlan} from '../src/jpeg-rgb-stream.js';
import {createReusableRgbWindow} from '../src/reusable-rgb-window.js';

test('admitted reusable windows preserve all orientations and circular phases after a live budget decrease',async()=>{
 const sw=37,sh=35,data=Uint8Array.from({length:sw*sh*3},(_,i)=>(i*73+i%11)&255);
 for(let orientation=1;orientation<=8;orientation++){
  const budget=new Budget(16*1024**2),surface=createRgbSurface({byteLength:data.length,async readInto(target,offset){target.set(data.subarray(offset,offset+target.length));},dispose(){}},{width:sw,height:sh,orientation,budget}),{width,height}=surface.descriptor;
  const reference=await surface.readWindow({width,height});
  for(let x=0;x<8;x++)for(let y=0;y<8;y++){
   budget.setLimit(16*1024**2);const rolled=rolledRgbSurface(surface,x,y,budget),plan=rgbRecompressionPlan(rolled),window=await createReusableRgbWindow(rolled,{budget,rows:plan.rows,bytes:plan.windowAllowance});let backing;
   try{budget.setLimit(1);const accounted=budget.total();for(let start=0;start<height;start+=plan.rows){const count=Math.min(plan.rows,height-start),part=await window.read({x:0,y:start,width,height:count});try{backing??=part.pixels.data.buffer;assert.equal(part.pixels.data.buffer,backing);for(let row=0;row<count;row++)for(let col=0;col<width;col++){const input=(((start+row-y+height)%height)*width+(col-x+width)%width)*3,output=(row*width+col)*3;assert.deepEqual(part.pixels.data.subarray(output,output+3),reference.pixels.data.subarray(input,input+3));}}finally{part.release();}assert.equal(budget.total(),accounted);}}
   finally{window.dispose();}assert.equal(budget.total(),reference.pixels.data.byteLength);
  }
  reference.release();await surface.dispose();assert.equal(budget.total(),0);assert.equal(budget.resources.backings.size,0);
 }
});

test('failed or cancelled reusable reads keep the original error and release their admitted workspace',async()=>{
 const budget=new Budget(8*1024**2),cause=Error('original read error'),controller=new AbortController(),surface=createRgbSurface({byteLength:32*32*3,readInto(){throw cause;},dispose(){}},{width:32,height:32,budget}),plan=rgbRecompressionPlan(surface),window=await createReusableRgbWindow(surface,{budget,rows:plan.rows,bytes:plan.windowAllowance,signal:controller.signal});
 try{await assert.rejects(window.read({x:0,y:0,width:32,height:32}),error=>error===cause);controller.abort();await assert.rejects(window.read({x:0,y:0,width:32,height:32}),{code:'CANCELLED'});}finally{window.dispose();window.dispose();await surface.dispose();}assert.equal(budget.total(),0);assert.equal(budget.resources.backings.size,0);
});
