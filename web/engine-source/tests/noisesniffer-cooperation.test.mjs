import test from 'node:test';
import assert from 'node:assert/strict';
import {noisesnifferRegions} from '../src/noisesniffer.js';
const counts=(w,h,value=0)=>({gridWidth:w,gridHeight:h,all_blocks:new Float64Array(w*h).fill(value),low_noise_blocks:new Float64Array(w*h).fill(value)});
async function controlled(run,{advance=0,onYield}={}){
 const descriptor=Object.getOwnPropertyDescriptor(performance,'now'),timer=globalThis.setTimeout;let time=0,yields=0;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>time+=advance});globalThis.setTimeout=(callback,ms,...args)=>{if(ms===0){yields++;onYield?.(yields);}return timer(callback,ms,...args);};
 try{return{result:await run(),yields};}finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;globalThis.setTimeout=timer;}
}
test('small empty native grids do not yield a clamped timer per cell row',async()=>{
 const {result,yields}=await controlled(()=>noisesnifferRegions(640,640,3,10,.5,counts(65,65),{tail:()=>0,materializeMask:false}));assert.equal(yields,0);assert.equal(result.mask,null);assert.deepEqual(result.grid,new Uint8Array(65*65));assert.deepEqual(result.regions,[]);
});
test('bounded cooperation preserves exact ordered growth, selected counts and native mask',async()=>{
 const actual=await noisesnifferRegions(20,20,3,10,.5,counts(3,3,4),{tail:K=>-4*K});assert.deepEqual([...actual.grid],Array(9).fill(255));assert.equal(actual.regions.length,1);assert.equal(actual.regions[0].selected_blocks,36);assert.equal(actual.regions[0].all_blocks,36);assert.deepEqual(actual.regions[0].cells,[[0,0],[1,0],[0,1],[2,0],[1,1],[0,2],[2,1],[1,2],[2,2]]);assert.deepEqual(actual.mask,new Uint8Array(400).fill(255));
 const stepped=await controlled(()=>noisesnifferRegions(20,20,3,10,.5,counts(3,3,4),{tail:K=>-4*K}),{advance:9});assert.deepEqual(stepped.result,actual);assert(stepped.yields>0);
});
test('pre-cancelled region work rejects before statistics or output publication',async()=>{
 let calls=0;await assert.rejects(noisesnifferRegions(20,20,3,10,.5,counts(3,3,4),{tail:()=>{calls++;return-100;},signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(calls,0);
});
test('control-message cancellation during bounded yield rejects the whole result',async()=>{
 const controller=new AbortController();let calls=0;await assert.rejects(controlled(()=>noisesnifferRegions(640,640,3,10,.5,counts(65,65,4),{tail:()=>{calls++;return-100;},signal:controller.signal}),{advance:9,onYield:()=>controller.abort()}),{code:'CANCELLED'});assert.equal(calls,0);
});
test('cancellation inside growing regions is checked without waiting for a later grid row',async()=>{
 const controller=new AbortController();let calls=0;await assert.rejects(noisesnifferRegions(640,640,3,10,.5,counts(65,65,4),{tail:K=>{if(++calls===50)controller.abort();return-4*K;},signal:controller.signal}),{code:'CANCELLED'});assert(calls>=50&&calls<100);
});
