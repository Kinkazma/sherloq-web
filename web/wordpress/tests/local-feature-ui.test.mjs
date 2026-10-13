import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {toolCatalog} from '../sherloq-browser/assets/tool-catalog.js';
import {localFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {catalogRecipe} from '../sherloq-browser/assets/batch-catalog.js';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../sherloq-browser/assets/feature-catalog.json',import.meta.url)));
function fixture(){
 const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div></body></html>'),messages=[];
 globalThis.document=document;globalThis.Option=class{constructor(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;}};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 const workspace=createToolWorkspace({document,language:()=> 'fr',getClient:async()=>{throw Error('No inference in UI fixture');},run(){},cancel(){},showSurface(){},download(){},notify:message=>messages.push(message)});
 return {document,workspace,messages};
}
test('the actual sparse algorithm menu hides removed methods and preserves saved scientific controls',async()=>{
 localFeaturePolicy.configure({catalog,local:true,state:{disabledFeatures:['clone.ssg']}});
 try{
  const h=fixture(),settings={...toolCatalog['tampering.copyMove.sparse'].params,algorithm:'SSG',rngSeed:42,ratio:.55};h.workspace.restore({'tampering.copyMove.sparse':settings});h.workspace.select('tampering.copyMove.sparse');
  assert.ok(![...h.document.getElementById('tool-param-algorithm').options].some(option=>option.value===JSON.stringify('SSG')));assert.equal(h.workspace.canRun(),false);assert.equal(h.workspace.serialize()['tampering.copyMove.sparse'].rngSeed,42);
  await localFeaturePolicy.enable(['clone.ssg']);h.workspace.refreshFeatures();assert.ok([...h.document.getElementById('tool-param-algorithm').options].some(option=>option.value===JSON.stringify('SSG')));assert.equal(h.workspace.canRun(),true);assert.equal(h.workspace.params().ratio,.55);
 }finally{localFeaturePolicy.configure({local:false,state:{}});}
});
test('the actual neural selector retains an uninstalled saved variant until deliberate reinstall',async()=>{
 localFeaturePolicy.configure({catalog,local:true,state:{disabledFeatures:['segmentation.mgcfdn']}});
 try{
  const h=fixture();h.workspace.restore({'ai.clones.d2prl':{minimum:517},uiOptions:{neuralMethod:'mgcfdn',neuralScope:'whole'}});h.workspace.select('ai.clones.d2prl');
  assert.ok(![...h.document.getElementById('tool-neural-method').options].some(option=>option.value==='mgcfdn'));assert.equal(h.workspace.serialize().uiOptions.neuralMethod,'mgcfdn');assert.equal(h.workspace.canRun(),false);assert.match(h.messages.at(-1),/désinstallée/);
  await localFeaturePolicy.enable(['segmentation.mgcfdn']);h.workspace.refreshFeatures();assert.equal(h.document.getElementById('tool-neural-method').value,'mgcfdn');assert.equal(h.workspace.canRun(),true);assert.equal(h.workspace.serialize()['ai.clones.d2prl'].minimum,517);
 }finally{localFeaturePolicy.configure({local:false,state:{}});}
});
test('batch execution omits removed recipes with explicit absence, while the kept tool executes normally',async()=>{
 const originalFetch=globalThis.fetch,calls=[],stored=new Map();globalThis.fetch=async()=>({ok:true,json:async()=>({assetBase:'./unified-assets/',engineVersion:'test',engineCommit:'test'})});
 localFeaturePolicy.configure({catalog,local:true,state:{disabledFeatures:['ai.clones.d2prl']}});
 try{
  const image={id:'image',hash:'pixels',width:8,height:8,name:'synthetic.png',blob:new Blob(['pixels']),selected:true,occurrences:[{studyId:'study'}],runs:[],state:'ready'},model={images:[image],studies:[{id:'study',errors:[]}],artifacts:{keys:()=>stored.keys(),set:async(path,blob)=>stored.set(path,blob),get:async path=>stored.get(path),delete:async path=>stored.delete(path)}};
  const tool={source:null,async load(input){this.source={id:input.id};},async run(task){calls.push(task.operation);return {operation:task.operation,data:{text:'00'}};},async export(){return {blob:new Blob(['{}'])};},async dispose(){}};
  const runner=createBatchRunner({scientificFiltering:false,toolFactory:async()=>tool});await runner.run(model,[catalogRecipe('ai.clones.d2prl'),catalogRecipe('file.hex')]);
  assert.deepEqual(calls,['file.hex']);assert.equal(image.runs.length,1);assert.equal(model.excludedFeatures[0].state,'feature-uninstalled');assert.equal(model.excludedFeatures[0].scientificResult,false);assert.ok(model.configuration.featurePolicy.disabledFeatures.includes('ai.clones.d2prl'));
  const direct=await createToolClient({engineFactory:()=>({dispose:async()=>{}})});await assert.rejects(direct.run({operation:'ai.clones.d2prl',params:{}}),{code:'FEATURE_UNINSTALLED'});await direct.dispose();
 }finally{globalThis.fetch=originalFetch;localFeaturePolicy.configure({local:false,state:{}});}
});
