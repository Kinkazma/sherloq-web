import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {createElaEnergyControls} from '../sherloq-browser/assets/energy-engine/src/ela-energy-controls.js';
import {validEnergySettings,validateSettings} from '../sherloq-browser/assets/settings.js';
test('four energy values remain independent, intent rejects a delayed adaptive result even at a limit',()=>{
 for(const [key,value]of Object.entries({histogramLow:0,histogramHigh:1000,shadow:200,highlight:0})){
  const c=createElaEnergyControls(),token=c.selectProfile('sensitive').estimateRequest,before=c.snapshot().values;
  c.beginManualEdit();c.edit({[key]:value});assert.deepEqual(c.snapshot().values,{...before,[key]:value});assert.equal(c.snapshot().profileId,'manual');
  assert.equal(c.acceptAutomatic({...token,values:{histogramLow:50,histogramHigh:900,shadow:10,highlight:30}}),false);
 }
});
test('energy snapshots keep all saved profiles and reject invalid units/identity',()=>{
 const a=validEnergySettings();a.profiles=[{id:'profile-one',name:'One',values:{...a.values,shadow:90},quality:83,block:16,minimum:4},{id:'profile-two',name:'Two',values:a.values,quality:0,block:32,minimum:3}];a.selected='profile-one';assert.deepEqual(validEnergySettings(JSON.parse(JSON.stringify(a))),a);
 assert.throws(()=>validEnergySettings({...a,values:{...a.values,shadow:201}}));assert.throws(()=>validEnergySettings({...a,selected:'missing'}));assert.throws(()=>validEnergySettings({...a,profiles:[a.profiles[0],a.profiles[0]]}));
});
test('energy rendering preserves holes and disjoint support; opacity does not change scientific arrays',async()=>{
 const labels=new Int32Array([1,0,1,2]),data={width:4,height:1,energy_labels:labels,regionColors:[{id:1,rgb:[200,0,0]},{id:2,rgb:[0,200,0]}]},source={data:new Uint8Array(12).fill(100)};
 assert.deepEqual((await renderEnergy(data,source,{view:'overlay',opacity:0})).data,source.data);
 assert.deepEqual((await renderEnergy(data,source,{view:'labels',opacity:70})).data,new Uint8Array([200,0,0,0,0,0,200,0,0,0,200,0]));
 assert.deepEqual((await renderEnergy(data,source,{view:'overlay',opacity:50})).data,new Uint8Array([150,50,50,100,100,100,150,50,50,50,150,50]));assert.deepEqual(labels,new Int32Array([1,0,1,2]));
});
