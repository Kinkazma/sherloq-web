import assert from 'node:assert/strict';
import {Budget} from '../../../src/cache.js';
import {createRgbSurface} from '../../../src/rgb-surface.js';
import {resourceAllocationKind} from '../../../src/errors.js';
import {runWithResourceRecovery} from '../../../src/resource-recovery.js';

// Small fault injection only. No capacity test or real allocation pressure.
// Run from this checkout: node docs/audits/integration27-96mp-20261003/window-errors-repro.mjs
const NativeUint8Array=globalThis.Uint8Array,records=[];
for(const fault of ['output-allocation','storage-bounds']) {
 const budget=new Budget(8*1024**2),raw=new RangeError(fault==='output-allocation'?'Array buffer allocation failed':'offset is out of bounds'),windowBytes=300,rowBytes=30;
 let attempts=0,typedReclaims=0,ordinaryReclaims=[],waits=0,readCalls=0;
 const surface=createRgbSurface({byteLength:windowBytes,readInto(){readCalls++;throw raw;},dispose(){}},{width:10,height:10,budget});
 budget.reclaimAllocation=async()=>{typedReclaims++;return 0;};
 budget.reclaim=async bytes=>{ordinaryReclaims.push(bytes);return 0;};
 if(fault==='output-allocation')globalThis.Uint8Array=new Proxy(NativeUint8Array,{construct(target,args,newTarget){if(args[0]===windowBytes)throw raw;return Reflect.construct(target,args,newTarget);}});
 try {
  await runWithResourceRecovery(async()=>{attempts++;return surface.readWindow();},{budget,owner:'audit',operation:'pixel-window',wait:async()=>{waits++;}});
  assert.fail('The injected refusal should reach the caller.');
 }catch(error){
  const result={fault,injectedName:raw.name,injectedMessage:raw.message,windowBytes,rowBytes,reportedCode:error.code,reportedMessage:error.message,causeKept:error.cause===raw,allocationKind:resourceAllocationKind(error),requestedBytes:error.details?.requestedBytes??null,attempts,typedReclaims,ordinaryReclaims,waits,readCalls,loopDetected:error.details?.recovery?.loopDetected,finalBudgetBytes:budget.total()};
  assert.equal(result.reportedCode,'MEMORY_ALLOCATION');assert.equal(result.causeKept,false);assert.equal(result.allocationKind,null);assert.equal(result.requestedBytes,null);assert.equal(attempts,5);assert.equal(typedReclaims,0);assert.equal(waits,4);assert.equal(result.finalBudgetBytes,0);assert.equal(readCalls,fault==='output-allocation'?0:5);records.push(result);
 }finally{globalThis.Uint8Array=NativeUint8Array;await surface.dispose();}
}
console.log(JSON.stringify({source:'44a39f5',scope:'Actual createRgbSurface and resource recovery; deterministic injected errors only, with no real memory pressure.',records},null,2));
