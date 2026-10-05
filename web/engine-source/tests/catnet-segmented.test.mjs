import test from 'node:test';import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';import {createNeuralTensor} from '../src/neural-tensor-store.js';
import {catnetOrientTensor} from '../src/catnet-segmented-analyzer.js';import {catnetCropOrient} from '../src/catnet-analyzer.js';
test('segmented CAT-Net cropping/orientation equals dense mapping across internal tiles',async()=>{
 const budget=new Budget(32*1024**2),h=263,w=267,ph=264,pw=272,data=Float32Array.from({length:ph*pw},(_,i)=>(i*13%8191)/8191),source=await createNeuralTensor(1,ph,pw,{budget,chunkBytes:1001});await source.writeRows(0,ph,data);
 try{for(let orientation=1;orientation<=8;orientation++){
  const metadata={source_shape:[h,w],padded_shape:[ph,pw],orientation},expected=catnetCropOrient(data,metadata),out=await catnetOrientTensor(source,metadata,{budget,storage:'memory'});
  try{const actual=new Float32Array(w*h);await out.readInto(actual);assert.equal(out.width,expected.width);assert.equal(out.height,expected.height);assert.deepEqual(actual,expected.data);}finally{await out.dispose();}
 }}finally{await source.dispose();}assert.equal(budget.total(),0);
});
