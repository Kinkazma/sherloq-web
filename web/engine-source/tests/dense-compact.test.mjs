import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDenseMath,denseGray,canonicalDenseSift} from '../src/dense-math.js';import {alignDenseSupports} from '../src/dense-links.js';
function pixels(w,h){let s=1234567;return Uint8Array.from({length:w*h*3},()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s>>>24;});}
test('compact SIFT reconstructs every float32 and global field for paired mirrors and quarter frames',async()=>{
 const math=await createDenseMath(),w=71,h=63,gray=denseGray(pixels(w,h));let cases=0;
 for(const [patch,target]of [[3,3],[4,6],[8,6],[8,10],[8,12]])for(const reflection of [false,true])for(const quarterTurn of [false,true]){
  const a=math.features(gray,w,h,{method:1,patch}),b=math.features(gray,w,h,{method:1,patch:target,reflection}),full=alignDenseSupports(a,b,patch,target),mask=new Uint8Array(full.width*full.height).fill(1),options={dimensions:128,minimum:3,radius:30,iterations:3,cacheSlots:47};if(quarterTurn){const da=canonicalDenseSift(full.first),db=canonicalDenseSift(full.second);for(let i=0;i<mask.length;i++)if(!da[i]||!db[i])mask[i]=0;}
  const support=Math.max(patch,target);math.compactPrepare(gray,w,h,{patch,support,quarterTurn,slot:0});math.compactPrepare(gray,w,h,{patch:target,support,reflection,quarterTurn,slot:1});
  for(const [slot,values]of [[0,full.first],[1,full.second]])for(let at=0;at<mask.length;at+=137){const n=Math.min(137,mask.length-at);assert.deepEqual(math.compactUnpack(slot,at,n),values.subarray(at*128,(at+n)*128),JSON.stringify({patch,target,reflection,quarterTurn,slot,at}));}
  const reference=math.field(full.first,full.second,mask,full.width,full.height,options),actual=math.compactField(new Uint8Array(mask.length).fill(1),full.width,full.height,{...options,second:1});assert.deepEqual(actual.allowed,mask);delete actual.allowed;assert.deepEqual(actual,reference);math.compactRelease();cases++;
 }console.log({cases,heap:math.heapBytes});
});
