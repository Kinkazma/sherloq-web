import test from 'node:test';
import assert from 'node:assert/strict';
import {denseDistanceLowerBound} from '../src/dense-distance-gpu.js';
const floats=new Float32Array(1),bits=new Uint32Array(floats.buffer);
const asBits=value=>{floats[0]=value;return bits[0];};
function integerBound(first,second){
 const a=first.map(asBits),b=second.map(asBits),exponent=Math.max(1,...a.map(x=>(x>>>23)&255),...b.map(x=>(x>>>23)&255));
 if(exponent===255)return [0,exponent];
 // An independent arithmetic reference uses real-number truncation rather
 // than the bit-shift implementation in the shader.
 const unit=2**(exponent-137);let sum=0;
 for(let i=0;i<first.length;i++){const delta=Math.max(0,Math.abs(Math.trunc(first[i]/unit)-Math.trunc(second[i]/unit))-2);sum+=delta*delta;}
 return [sum,exponent];
}
const distance=(a,b)=>a.reduce((sum,x,i)=>{const d=Math.fround(x-b[i]);return Math.fround(sum+Math.fround(d*d));},0);
test('Integer GPU bound stays below the unchanged float32 evaluator across normal/subnormal and extreme values',()=>{
 let random=729;const next=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return (random>>>0)/2**32;};
 for(const dimensions of [1,12,16,128])for(let trial=0;trial<2000;trial++){
  const exponent=Math.floor(next()*277)-149,scale=2**exponent,a=Array.from({length:dimensions},()=>Math.fround((next()-.5)*scale)),b=a.map(x=>trial%2?Math.fround((next()-.5)*scale):Math.fround(x*(1+(next()-.5)/1024))),[sum,e]=integerBound(a,b),actual=distance(a,b),lower=denseDistanceLowerBound(sum,e,dimensions);
  assert.ok(lower<=actual,JSON.stringify({dimensions,trial,lower,actual,sum,e}));
 }
});
test('Prefixes are valid full-distance bounds and nonfinite inputs cannot prove a rejection',()=>{
 const a=[1,2,3,4],b=[-.5,.25,.75,6],[sum,e]=integerBound(a.slice(0,2),b.slice(0,2));
 assert.ok(denseDistanceLowerBound(sum,e,4)<=distance(a,b));assert.ok(Number.isNaN(denseDistanceLowerBound(0,255,128)));
 assert.ok(128*4092**2<2**31);assert.equal(denseDistanceLowerBound(0,1,128),0);
});
