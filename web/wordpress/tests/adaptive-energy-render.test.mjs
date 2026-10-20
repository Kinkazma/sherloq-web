import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
test('larger admitted Energy and Biome previews preserve native fields and exact final pixels',async()=>{
 const width=640,height=320,n=width*height,source={width,height,data:new Uint8Array(n*3).fill(100)},data={width,height,energy_labels:new Int32Array(n).fill(1),regionColors:[{id:1,rgb:[255,0,0]}],energy_scope:new Int32Array(n).fill(1),energy_high_score:new Float32Array(n).fill(.5),energy_low_score:new Float32Array(n)},before=data.energy_high_score.slice(),native=await renderEnergy(data,source,{view:'scores',field:'unified'});
 const large=await renderEnergy(data,source,{view:'labels'},{preview:{maxWidth:600,maxHeight:600}});assert.equal(large.width,600);assert.equal(large.height,300);assert.equal(large.preview,true);
 const both=await renderEnergy(data,source,{view:'scores',field:'both'},{preview:{maxWidth:1024,maxHeight:1024}});assert.equal(both.width,1024);assert.equal(both.height,256);assert.equal(both.logicalWidth,1280);
 const after=await renderEnergy(data,source,{view:'scores',field:'unified'});assert.deepEqual(after.data,native.data);assert.deepEqual(data.energy_high_score,before);await assert.rejects(renderEnergy(data,source,{view:'labels'},{preview:{maxWidth:2049,maxHeight:2048}}),/Invalid energy preview bounds/);
});
