import test from 'node:test';import assert from 'node:assert/strict';import{writeFile}from'node:fs/promises';
import{fullHead}from'./full-head-control03.mjs';
import{planMgcfdnWindowGpuMemory}from'../src/mgcfdn-window-gpu-memory.js';
test('All eleven original head stages complete with exact copied-output lifetimes and the derived coexistence peak',async()=>{
 const p=planMgcfdnWindowGpuMemory(3200),v=await fullHead(p.graphBudgetBytes);assert.equal(v.failure,undefined);assert.equal(v.executed.length,11);assert.equal(v.created.length,9);assert.equal(v.completeContexts,2);assert.equal(p.graphBudgetBytes,619923005);assert.equal(v.graphFinal.peakAccountedBytes,p.graphBudgetBytes);assert.equal(v.graphFinal.activeReservationBytes,0);const after=label=>v.events.find(e=>e.label===label&&e.phase==='after').graph.activeReservationBytes;
 assert.equal(after('global-consistency'),482506301+41472000);assert.equal(after('global-pools'),482506301+41472000+2720);assert.equal(after('global-attention'),482506301+41472000+3276800);assert.equal(p.nativeGpuMaximumBytes,536870912);assert.equal(p.nativeWasmMaximumBytes,536870912);if(process.env.MGCFDN03_RECEIPT_DIR)await writeFile(new URL('FULL-HEAD-LIVENESS03.json','file://'+process.env.MGCFDN03_RECEIPT_DIR+'/'),JSON.stringify({plan:p,...v},null,2)+'\n',{flag:'wx'});
});
