import test from 'node:test';
import assert from 'node:assert/strict';
import {binaryFrequencyMaskPlan,frequencyMaskPlanningBytes} from '../src/frequency-gpu-kernel.js';
const reflect=(x,n)=>{if(n===1)return 0;const period=2*(n-1),q=((x%period)+period)%period;return q>=n?period-q:q;};
test('binary row compression and column supports match exhaustive reflected tap support on irregular single-run rows',()=>{
 for(const [width,height]of[[1,9],[17,1],[13,17],[32,19]])for(const radius of[0,1,2,7,39]){const values=new Float32Array(width*height);for(let y=0;y<height;y++){if(y%5===1)continue;const first=(y*7)%width,last=Math.min(width-1,first+(y*3)%7);values.fill(1,y*width+first,y*width+last+1);}const original=new Uint8Array(values.buffer).slice(),plan=binaryFrequencyMaskPlan(values,width,height,new Float32Array(radius*2+1).fill(1));assert.ok(plan);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const row=plan.rowMap[y]*2,first=plan.bounds[row],last=plan.bounds[row+1];assert.equal(values[y*width+x],first>=0&&x>=first&&x<=last?1:0);}
  for(let x=0;x<width;x++){const rows=[];for(let y=0;y<height;y++){let nonzero=false;for(let k=-radius;k<=radius;k++)if(values[y*width+reflect(x+k,width)])nonzero=true;if(nonzero)rows.push(y);}assert.equal(plan.columnBounds[x*2],rows.length?rows[0]:-1);assert.equal(plan.columnBounds[x*2+1],rows.length?rows.at(-1):-1);}
  assert.deepEqual(new Uint8Array(values.buffer),original);assert.ok(frequencyMaskPlanningBytes(width,height)>=plan.metadataBytes);
 }
});
test('fractional, disjoint, nonfinite and signed-zero inputs retain generic arithmetic',()=>{
 const weights=Float32Array.of(.25,.5,.25);for(const input of[Float32Array.of(0,.5,1),Float32Array.of(1,0,1),Float32Array.of(0,NaN,1),Float32Array.of(0,-0,1)])assert.equal(binaryFrequencyMaskPlan(input,3,1,weights),null);
 for(const weight of[-1,-0,1e-40,Infinity])assert.equal(binaryFrequencyMaskPlan(Float32Array.of(1,1,1),3,1,Float32Array.of(1,weight,1)),null);assert.equal(binaryFrequencyMaskPlan(Float32Array.of(1,1,1),3,1,Float32Array.of(1,1)),null);
 const backing=Float32Array.of(99,0,1,1,0,99),view=backing.subarray(1,5),plan=binaryFrequencyMaskPlan(view,4,1,weights);assert.deepEqual([...plan.bounds],[1,2]);
});
