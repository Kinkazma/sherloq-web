import test from 'node:test';import assert from 'node:assert/strict';import {Budget} from '../src/cache.js';import {createFloatPlane} from '../src/segmented-float-plane.js';import {segmentedDft} from '../src/segmented-dft.js';import {frequencyStreamMath} from '../src/frequency-stream-math.js';
test('whole-axis forward and inverse DFT preserve global scale and conjugate completion',async()=>{
 const budget=new Budget(32*1024**2),math=await frequencyStreamMath();
 for(const [width,height]of [[1,8],[7,1],[3,5],[16,15],[17,19],[30,32],[64,45]]){
  const values=Float64Array.from({length:width*height},(_,i)=>(i*73+Math.floor(i/7)*13)%256),source=await createFloatPlane(width,height,{budget});await source.write(values,0,0,width,height);
  let a,b;try{a=await segmentedDft(source,{budget,blockPixels:67});const forward=await a.read(0,0,width,height);assert.deepEqual(forward,math.full(Float32Array.from(values),width,height));b=await segmentedDft(a,{budget,inverse:true,blockPixels:67});assert.deepEqual(await b.read(0,0,width,height),math.full(forward,width,height,true));}finally{await source.dispose();await a?.dispose();await b?.dispose();}assert.equal(budget.total(),0);
 }
});
