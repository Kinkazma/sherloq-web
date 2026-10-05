import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';import {createDenseMath} from '../src/dense-math.js';import {runPagedDenseCoherence} from '../src/dense-paged-coherence.js';
const math=await createDenseMath(),plane=a=>({byteLength:a.byteLength,readInto(out,at){out.set(new Uint8Array(a.buffer,a.byteOffset+at,out.length));}}),proof=[];
for(const [width,height,radius,minimum] of [[71,43,1,6],[1031,29,3,6],[1079,37,6,30000],[537,47,6,1]]){
 const n=width*height,targets=new Int32Array(n),distancesSquared=new Float32Array(n);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;targets[i]=(y*width+(x+17)%width);distancesSquared[i]=x%127<4?1:.01;if((x%89<3&&y%13<5)||x%151===0)targets[i]=-1;}
 const expected=math.coherence(targets,distancesSquared,width,height,{radius,minimum,errorThreshold:3}),budget=new Budget(32*1024**2);
 const begin=performance.now(),result=await runPagedDenseCoherence({width,height,targets:plane(targets),distancesSquared:plane(distancesSquared)},{budget,radius,minimum,errorThreshold:3,pageBytes:512,cachePages:2});
 let selected=0;for(const key of ['selected','errors']){const actual=new Uint8Array(expected[key].byteLength);await result[key].readInto(actual);assert.deepEqual(actual,new Uint8Array(expected[key].buffer),key);if(key==='selected')selected=actual.reduce((n,v)=>n+v,0);}
 proof.push({width,height,radius,minimum,selected,milliseconds:performance.now()-begin,...result.metrics});await result.dispose();assert.equal(budget.total(),0);
}
await writeFile(new URL('../docs/dense-paged-coherence-proof.json',import.meta.url),JSON.stringify({status:'passed',cases:proof},null,2)+'\n');console.log(JSON.stringify(proof));
