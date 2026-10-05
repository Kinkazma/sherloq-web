import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {Budget} from '../src/cache.js';import {createDenseRegions} from '../src/dense-regions.js';import {createPagedRegionsMask} from '../src/dense-paged-regions.js';
const native=await createDenseRegions(),budget=new Budget(32*1024**2),width=71,height=53,image={width,height,data:new Uint8Array(width*height*3)};let seed=7729;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/2**32;};let cases=0;
for(const method of [0,1])for(const patch of [3,8])for(let i=0;i<24;i++){
 const path=()=>Array.from({length:3+i%6},()=>[Math.round((random()*1.7-.35)*width*2)/2,Math.round((random()*1.7-.35)*height*2)/2]);
 const regions=i%3===0?[]:i%3===1?[path()]:[path(),path()],excluded=i%2?[path()]:[],options={method,patch,regions,excluded,texture:0};
 const expected=native.allowed(image,options),result=await createPagedRegionsMask(width,height,{...options,budget}),actual=new Uint8Array(result.mask.byteLength);await result.mask.readInto(actual);
 assert.deepEqual(actual,expected.mask,JSON.stringify({method,patch,i,regions,excluded}));await result.dispose();assert.equal(budget.total(),0);cases++;
}
const proof={status:'passed',cases,width,height,bitExact:true,semantics:'Full OpenCV LINE_8 polygon mask, integer and half-pixel descriptor centers; clipped and self-intersecting paths, overlap and exclusions.'};await writeFile(new URL('../docs/dense-paged-regions-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(proof);
