import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentedElaSynthesisHeadroom} from '../src/ela-synthesis-source-headroom.js';
import {rgbRecompressionArchivePlan,rgbRecompressionPlan} from '../src/jpeg-rgb-stream.js';
import {Budget} from '../src/cache.js';
import {createElaSynthesisAccumulator} from '../src/ela-synthesis-accumulator.js';
const MiB=1024**2;
const surface=(width,height)=>({descriptor:{width,height,format:'rgb8'}});
test('the qualified segmented live set admits a fitting 700×500 series in RAM even with temporary storage available',async()=>{
 const input=surface(700,500),headroom=segmentedElaSynthesisHeadroom(input,{histogram100:true}),budget=new Budget(4*1024**3);let selected,temporaryCreates=0;
 const accumulator=await createElaSynthesisAccumulator({width:700,height:500,count:99,budget,nativeHeadroomBytes:headroom.bytes,temporarySession:{backend:'opfs',create(){temporaryCreates++;throw Error('Fitting exact native stack should remain in RAM');}},async createStore(bytes,{storage}){selected=storage;return{storage,byteLength:bytes,markCold(){},dispose(){}};}});
 try{assert.equal(selected,'memory');assert.equal(temporaryCreates,0);assert.ok(headroom.bytes+700*500*3*99<budget.limit);assert.equal(headroom.archiveEligible,true);}finally{await accumulator.dispose();}assert.equal(budget.total(),0);
});
test('headroom preserves every actual scanline/encoded/source/output owner and bounded GPU work beyond the archive limit',()=>{
 for(const [width,height]of[[83,79],[700,500],[10000,10000]]){const input=surface(width,height),cpu=segmentedElaSynthesisHeadroom(input,{backend:'cpu',histogram100:true}),gpu=segmentedElaSynthesisHeadroom(input,{backend:'webgpu',histogram100:true}),p=rgbRecompressionPlan(input),a=rgbRecompressionArchivePlan(input);assert.equal(cpu.sourceBytes,width*height*3);assert.equal(cpu.encodedBytes,p.encodedCapacityBytes*2);assert.equal(cpu.codecBytes,p.workingBytes+p.windowAllowance);assert.equal(cpu.gpuBytes,0);assert.ok(gpu.bytes>cpu.bytes);assert.equal(gpu.archiveEligible,a.eligible);assert.ok(gpu.equalizationBytes>=cpu.equalizationBytes);if(width===10000){assert.equal(a.eligible,false);assert.ok(gpu.gpuBytes<100*MiB,'The maintained fallback uses native bands, not another 100MP whole-context engine');}}
});
