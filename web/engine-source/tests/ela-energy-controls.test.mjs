import test from 'node:test';import assert from 'node:assert/strict';import {createElaEnergyControls} from '../src/ela-energy-controls.js';
test('Each manual energy edit preserves the other three values and never reapplies automatic or standard settings',()=>{
 const c=createElaEnergyControls();assert.deepEqual(c.snapshot().values,{histogramLow:10,histogramHigh:990,shadow:50,highlight:50});c.selectProfile('sensitive');c.edit({histogramLow:27});assert.deepEqual(c.snapshot().values,{histogramLow:27,histogramHigh:990,shadow:50,highlight:50});c.edit({histogramHigh:941});c.edit({shadow:13});c.edit({highlight:178});assert.deepEqual(c.snapshot().values,{histogramLow:27,histogramHigh:941,shadow:13,highlight:178});assert.deepEqual(c.snapshot().quantiles,[.027,.941]);assert.deepEqual(c.snapshot().thresholds,[1.3,17.8]);assert.equal(c.snapshot().profileId,'manual');assert.equal(c.snapshot().adaptive,false);assert.equal(c.snapshot().analysisAvailable,true);
});
test('Manual intent at an unchanged endpoint invalidates a pending profile estimate and its stale render',()=>{
 const c=createElaEnergyControls(),request=c.selectProfile('conservative');const old={revision:request.revision,profileId:request.profileId,values:{histogramLow:90,histogramHigh:900,shadow:20,highlight:20}};c.beginManualEdit();assert.equal(c.acceptAutomatic(old),false);assert.equal(c.accepts(old),false);assert.deepEqual(c.snapshot().values,{histogramLow:10,histogramHigh:990,shadow:50,highlight:50});
});
test('Explicit profile requests may update all four controls once; snapshots remain independent and partial estimates are rejected',()=>{
 const c=createElaEnergyControls(),request=c.selectProfile('sensitive'),answer={...request.estimateRequest,values:{histogramLow:75,histogramHigh:926,shadow:24,highlight:63}};assert.equal(c.acceptAutomatic(answer),true);assert.equal(c.acceptAutomatic(answer),false);assert.equal(c.accepts(answer),false);assert.equal(c.snapshot().adaptive,true);assert.equal(c.snapshot().estimatePending,false);const saved=c.snapshot();c.edit({shadow:0});assert.equal(saved.values.shadow,24);c.applySnapshot({id:'user:local',values:saved.values});assert.deepEqual(c.snapshot().values,saved.values);c.selectProfile('manual');assert.deepEqual(c.snapshot().values,saved.values);c.selectProfile('standard');assert.deepEqual(c.snapshot().values,{histogramLow:10,histogramHigh:990,shadow:50,highlight:50});const pending=c.selectProfile('conservative');assert.throws(()=>c.acceptAutomatic({...pending.estimateRequest,values:{shadow:30}}),{code:'INVALID_INPUT'});assert.throws(()=>c.edit({shadow:201}),{code:'INVALID_INPUT'});
});

test('Completing an estimate invalidates renders for its old values; another profile request rejects the previous response',()=>{
 const c=createElaEnergyControls(),first=c.selectProfile('sensitive'),next=c.selectProfile('conservative');
 assert.equal(c.acceptAutomatic({...first.estimateRequest,values:{histogramLow:90,histogramHigh:900,shadow:20,highlight:20}}),false);
 const oldRender={revision:next.revision};assert.equal(c.accepts(oldRender),true);
 assert.equal(c.acceptAutomatic({...next.estimateRequest,values:{histogramLow:20,histogramHigh:980,shadow:30,highlight:40}}),true);
 assert.equal(c.accepts(oldRender),false);assert.equal(c.accepts(c.snapshot()),true);
 const values=c.snapshot().values;values.shadow=0;assert.equal(c.snapshot().values.shadow,30);
});
