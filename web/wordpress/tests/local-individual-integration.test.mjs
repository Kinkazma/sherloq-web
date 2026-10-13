import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';
import {defaultSettings} from '../sherloq-browser/assets/settings.js';
import {exportDefaults} from '../sherloq-browser/assets/media-settings.js';
import {capturePreferenceBackup,serializePreferenceBackup,importPreferenceBackup,createPreferenceAccess} from '../sherloq-browser/assets/preferences-recovery.js';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {localFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';

class Storage{
 constructor(values={}){this.values=new Map(Object.entries(values));}
 get length(){return this.values.size;}key(index){return [...this.values.keys()][index]??null;}
 getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,String(value));}removeItem(key){this.values.delete(key);}
}
test('complete preference recovery after storage wipe retains new batch export/view and selected individual controls',async()=>{
 const batch={options:{threshold:3,basis:'total',panels:true,compare:false,reuse:true},preferredBasis:'clones',imageExport:{...exportDefaults,format:'heic',heicQuality:83,resize:true,width:1800,height:1200,resizeAxis:'width',resizeAlgorithm:'lanczos3'},recipes:[{id:'clone-4',params:{minimum:7},signal:{threshold:.6,minimumPixels:20},backend:'cpu',view:{low:0,high:100000,minimum:4,areas:true,circles:false,lines:false,points:false,textExclusions:false}}]};
 const settings={...defaultSettings(),individual:{'ai.clones.d2prl':{minimum:517},uiOptions:{neuralMethod:'d2prl',neuralScope:'regions',neuralView:'mask',sparseViewVersion:1,sparseView:{low:17,minimum:4,areas:true}}}},raw=JSON.stringify(settings),source=new Storage({'sherloq.settings':raw,'sherloq.workspace.tools':JSON.stringify({'ai.clones.d2prl':settings}),'sherloq.batch.settings':JSON.stringify(batch)}),library=async()=>null;
 const backup=serializePreferenceBackup(await capturePreferenceBackup({storage:source,library,origin:'https://previous-origin.example'})),target=new Storage({'unrelated':'keep'});
 await importPreferenceBackup(backup,{storage:target,library});const access=createPreferenceAccess(target);
 assert.deepEqual(access.read('sherloq.batch.settings').value,batch);
 assert.deepEqual(access.read('sherloq.settings').value.individual,settings.individual);
 assert.deepEqual(access.read('sherloq.workspace.tools').value['ai.clones.d2prl'].individual,settings.individual);
 assert.equal(target.getItem('sherloq.settings'),raw);assert.equal(target.getItem('unrelated'),'keep');
});

test('feature exclusion refresh retains the original/result context and deliberate neural settings without inference',async()=>{
 const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div></body></html>'),catalog=JSON.parse(fs.readFileSync(new URL('../sherloq-browser/assets/feature-catalog.json',import.meta.url))),originalDocument=globalThis.document,originalOption=globalThis.Option;
 globalThis.document=document;globalThis.Option=class{constructor(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;}};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 localFeaturePolicy.configure({catalog,local:true,state:{}});let clientRequests=0;
 try{
  const workspace=createToolWorkspace({document,language:()=> 'fr',getClient:async()=>{clientRequests++;throw Error('No inference during feature refresh');},run(){throw Error('No implicit calculation');},cancel(){},showSurface(){},download(){},notify(){}});
  workspace.restore({'ai.clones.d2prl':{minimum:517},uiOptions:{neuralMethod:'d2prl',neuralScope:'regions',neuralView:'mask'}});workspace.select('ai.clones.d2prl');workspace.renderPrepared({operation:'ai.clones.d2prl'});workspace.setOriginal(true);
  await localFeaturePolicy.disable(['ai.clones.d2prl']);workspace.refreshFeatures();
  assert.equal(workspace.canRun(),false);assert.equal(document.getElementById('tool-presentation-context').hidden,false);assert.match(document.getElementById('tool-presentation-context').textContent,/Image originale.*conservé/);
  assert.equal(workspace.serialize()['ai.clones.d2prl'].minimum,517);assert.equal(workspace.serialize().uiOptions.neuralScope,'regions');
  await localFeaturePolicy.enable(['ai.clones.d2prl']);workspace.refreshFeatures();workspace.setOriginal(false);
  assert.equal(workspace.canRun(),true);assert.match(document.getElementById('tool-presentation-context').textContent,/Dernier résultat calculé/);assert.equal(clientRequests,0);
 }finally{localFeaturePolicy.configure({local:false,state:{}});globalThis.document=originalDocument;globalThis.Option=originalOption;}
});
