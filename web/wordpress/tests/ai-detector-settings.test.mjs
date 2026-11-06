import test from 'node:test';
import assert from 'node:assert/strict';
import {validIndividualSettings,validateSettings,defaultSettings} from '../sherloq-browser/assets/settings.js';
import {AI_DETECTOR_TOOLS,AI_DETECTOR_OPERATION} from '../sherloq-browser/assets/ai-detector-tools.js';

// Mirrors createToolWorkspace.serialize() for a visited detector. This transport
// is used again when a closed tool is opened on the same or a replacement image.
for(const tool of AI_DETECTOR_TOOLS.filter(tool=>tool.operation===AI_DETECTOR_OPERATION))test(tool.id+' survives saved-panel validation unchanged',()=>{
 const individual={[tool.id]:{method:tool.method},uiOptions:{backend:'auto',backendChoices:[],dtdOpacityVersion:2,responsePresentationVersion:4,comprintDisplayVersion:2,comprintDefaultViewVersion:2,truforDefaultVersion:2}},before=structuredClone(individual);
 const result=validateSettings({...defaultSettings(),individual});
 assert.deepEqual(result.individual,before);assert.deepEqual(individual,before);assert.notEqual(result.individual,individual);assert.notEqual(result.individual[tool.id],individual[tool.id]);
});

test('unsafe and malformed parameter names remain rejected',()=>{
 for(const name of ['__proto__','prototype','constructor','1leading','-leading','bad/name','bad name','bad[name]','bad\\name','bad:name','bad\u0000name','']){
  const object=Object.fromEntries([[name,{value:1}]]);
  assert.throws(()=>validIndividualSettings(object),/Invalid tool parameter name/,name);
  assert.throws(()=>validIndividualSettings({safe:object}),/Invalid tool parameter name/,'nested '+name);
 }
 assert.equal(Object.prototype.polluted,undefined);
});

test('transport value, array, object-size and depth guards remain active',()=>{
 for(const value of [NaN,Infinity,-Infinity,undefined,()=>{},'x'.repeat(4097)])assert.throws(()=>validIndividualSettings({safe:{value}}),/Invalid tool parameter/);
 assert.throws(()=>validIndividualSettings({safe:Array(1001).fill(1)}),/Invalid tool parameter array/);
 const crowded=Object.fromEntries(Array.from({length:65},(_,i)=>['key'+i,1]));assert.throws(()=>validIndividualSettings(crowded),/Invalid tool settings/);assert.throws(()=>validIndividualSettings({safe:crowded}),/Invalid tool parameter/);
 let deep=1;for(let i=0;i<7;i++)deep={safe:deep};assert.throws(()=>validIndividualSettings(deep),/Invalid tool parameter/);
});
