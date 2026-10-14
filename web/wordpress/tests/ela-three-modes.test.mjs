import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';
import {createEnergyUI} from '../sherloq-browser/assets/energy-ui.js';
import {defaults,defaultSettings,validElaMode,validEnergySettings,validateSettings,recoverSettings} from '../sherloq-browser/assets/settings.js';

test('Energy renders the raw LOW and HIGH maps with the fixed README scale, independently of biome labels',async()=>{
 const low=new Float32Array([0,.125,.5,0,2]),high=new Float32Array([2,0,0,.125,0]),labels=new Int32Array([9,9,0,0,9]);
 const data={width:5,height:1,energy_low_score:low,energy_high_score:high,energy_labels:labels,energy_scope:new Int32Array(5).fill(1),regionColors:[{id:9,rgb:[1,200,88]}]};
 const before={low:low.slice(),high:high.slice(),labels:labels.slice()},source={readPixels(){throw Error('Scores must not copy or read original RGB');}};
 for(const [field,values]of [['low',low],['high',high]]){
  const frame=await renderEnergy(data,source,{view:'scores',field,threshold:0});
  assert.deepEqual(frame.data,Uint8Array.from([...values].flatMap(value=>[Math.min(255,Math.round(value*255)),0,0])));
  assert.equal(frame.data.byteLength,3*values.length);assert.equal(frame.presentation.observedMaximum,2);assert.equal(frame.presentation.probability,false);
 }
 const filtered=await renderEnergy(data,source,{view:'scores',field:'low',threshold:.5});
 assert.deepEqual(filtered.data,Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,255,0,0]));
 assert.deepEqual(low,before.low);assert.deepEqual(high,before.high);assert.deepEqual(labels,before.labels);
});

test('score rendering rejects invalid maps and an in-flight cancellation without publishing a partial RGB buffer',async()=>{
 for(const score of [NaN,Infinity,-.1])await assert.rejects(renderEnergy({width:1,height:1,energy_high_score:new Float32Array([score]),energy_low_score:new Float32Array(1),energy_scope:new Int32Array([1])},null,{view:'scores'}),/Invalid raw energy score/);
 await assert.rejects(renderEnergy({width:1,height:1,energy_high_score:new Float64Array([1]),energy_low_score:new Float32Array(1),energy_scope:new Int32Array([1])},null,{view:'scores'}),/Invalid raw energy score map/);
 const controller=new AbortController(),scores=new Float32Array(64*768).fill(.3),before=scores.slice();
 const promise=renderEnergy({width:64,height:768,energy_high_score:scores,energy_low_score:new Float32Array(scores.length),energy_scope:new Int32Array(scores.length).fill(1)},null,{view:'scores'},{signal:controller.signal});controller.abort();
 await assert.rejects(promise,{code:'CANCELLED'});assert.deepEqual(scores,before);
});

function controls(){
 globalThis.Option=class{constructor(text,value){this.text=text;this.value=value;}};
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',min:0,max:1000,listeners:new Map(),addEventListener(type,fn){const list=this.listeners.get(type)??[];list.push(fn);this.listeners.set(type,list);},removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item!==fn));},emit(type,event={}){for(const fn of this.listeners.get(type)??[])fn(event);},replaceChildren(){},reportValidity:()=>true});return nodes.get(id);};
 let science=0,views=0,saves=0;
 const ui=createEnergyUI({$,t:value=>value,changed:()=>science++,viewChanged:()=>views++,persist:()=>saves++});
 return{$,ui,get science(){return science;},get views(){return views;},get saves(){return saves;}};
}
test('fresh ELA opens in Classic, Energy defaults to Unified/map/zero and explicit restored choices retain their recipes',()=>{
 const fresh=defaultSettings(),h=controls();assert.equal(fresh.preferences.elaMode,'classic');assert.deepEqual(fresh.energy,validEnergySettings());
 assert.deepEqual(h.ui.presentation('scores'),{view:'scores',field:'unified',threshold:0,scoreView:'map'});assert.deepEqual(h.ui.presentation('biomes'),{view:'overlay',opacity:70});
 h.ui.load();assert.deepEqual(h.ui.presentation('scores'),{view:'scores',field:'unified',threshold:0,scoreView:'map'});
 for(const field of ['high','low','both','unified']){
  const stored={...fresh,preferences:{...fresh.preferences,elaMode:'scores'},energy:{...fresh.energy,selected:'manual',values:{histogramLow:37,histogramHigh:953,shadow:71,highlight:26},quality:75,block:64,minimum:7,view:'labels',opacity:49,scoreField:field,scoreThreshold:field==='both'?-.7:.7,scoreView:'overlay'}};
  const recovered=recoverSettings(JSON.parse(JSON.stringify(stored)));assert.deepEqual(recovered.issues,[]);assert.equal(recovered.value.preferences.elaMode,'scores');assert.deepEqual(recovered.value.energy,stored.energy);
  h.ui.load(recovered.value.energy);assert.deepEqual(h.ui.bundle(),stored.energy);assert.deepEqual(h.ui.presentation('scores'),{view:'scores',field,threshold:stored.energy.scoreThreshold,scoreView:'overlay'});
 }
 assert.equal(h.science,0);h.ui.dispose();
});
test('LOW/HIGH and the score slider change only presentation and preserve the native recipe, profiles and biome overlay',()=>{
 const h=controls(),old=validEnergySettings({selected:'manual',values:{histogramLow:37,histogramHigh:953,shadow:71,highlight:26},quality:75,block:32,minimum:7,view:'labels',opacity:49,profiles:[],scoreField:'high'});h.ui.load(old);
 const native=h.ui.prepare('biomes').params,biomes=h.ui.presentation('biomes'),token=h.ui.prepare('biomes').token;
 assert.deepEqual(h.ui.presentation('scores'),{view:'scores',field:'high',threshold:0,scoreView:'map'});
 h.$('energy-score-threshold').value='.73';h.$('energy-score-threshold').oninput();h.$('energy-score-field').value='low';h.$('energy-score-field').onchange();
 assert.equal(h.science,0);assert.equal(h.views,2);assert.equal(h.saves,2);assert.deepEqual(h.ui.prepare('scores').params,native);assert.deepEqual(h.ui.prepare('scores').token,token);assert.deepEqual(h.ui.presentation('biomes'),biomes);
 assert.deepEqual(h.ui.bundle().values,old.values);assert.deepEqual(h.ui.bundle().profiles,old.profiles);assert.deepEqual(h.ui.presentation('scores'),{view:'scores',field:'low',threshold:.73,scoreView:'map'});
});
test('positive saved thresholds remain pending before native bounds, then clamp to the exact maximum without changing science',()=>{
 const h=controls();h.ui.load({...validEnergySettings(),scoreField:'high',scoreThreshold:4.2});assert.equal(h.ui.bundle().scoreThreshold,4.2);
 assert.equal(h.ui.observePresentation({view:'scores',field:'high',observedMaximum:2.11}),true);assert.equal(Number(h.$('energy-score-threshold').max),2.11);assert.equal(h.ui.bundle().scoreThreshold,2.11);
 h.$('energy-score-threshold-number').value='.2';h.$('energy-score-threshold-number').oninput();assert.equal(Number(h.$('energy-score-threshold').max),2.11);
 h.$('energy-score-field').value='low';h.$('energy-score-field').onchange();assert.equal(h.ui.observePresentation({view:'scores',field:'low',observedMaximum:.123}),true);
 assert.equal(Number(h.$('energy-score-threshold').max),.123);assert.equal(h.ui.bundle().scoreThreshold,.123);assert.equal(h.science,0);
});
test('Both keeps its signed range; Unified and individual levels use positive bounds and preserve the scientific recipe',()=>{
 const h=controls();h.ui.load({...h.ui.bundle(),scoreField:'both'});assert.deepEqual(h.ui.presentation('scores'),{view:'scores',field:'both',threshold:0,scoreView:'map'});const original=h.ui.prepare('biomes');
 h.$('energy-score-threshold-number').value='-1.27';h.$('energy-score-threshold-number').oninput();assert.equal(h.ui.bundle().scoreThreshold,-1.27);
 h.ui.observePresentation({view:'scores',field:'both',observedMaximum:2.13,observedMaxima:{high:.51,low:2.13},signedRanges:{high:{minimum:-2.13,maximum:.51},low:{minimum:-.51,maximum:2.13}}});assert.equal(Number(h.$('energy-score-threshold').min),-2.13);assert.equal(Number(h.$('energy-score-threshold').max),2.13);assert.equal(h.ui.bundle().scoreThreshold,-1.27);
 h.$('energy-score-field').value='unified';h.$('energy-score-field').onchange();assert.equal(h.ui.bundle().scoreThreshold,0);assert.equal(Number(h.$('energy-score-threshold').min),0);assert.equal(Number(h.$('energy-score-threshold').max),2.13);
 const views=h.views;for(const input of ['-1','3']){h.$('energy-score-threshold-number').value=input;h.$('energy-score-threshold-number').oninput();assert.equal(h.ui.bundle().scoreThreshold,0);assert.equal(Number(h.$('energy-score-threshold-number').value),0);}assert.equal(h.views,views);
 h.$('energy-score-threshold-number').value='1.8';h.$('energy-score-threshold-number').oninput();h.$('energy-score-field').value='high';h.$('energy-score-field').onchange();assert.equal(h.ui.bundle().scoreThreshold,.51);assert.equal(Number(h.$('energy-score-threshold').max),.51);assert.equal(Number(h.$('energy-score-threshold').min),0);assert.deepEqual(h.ui.prepare('scores').params,original.params);assert.equal(h.science,0);
 h.ui.load({...h.ui.bundle(),scoreField:'high',scoreView:'overlay'});assert.equal(h.$('energy-score-field').value,'high');assert.equal(h.$('energy-score-view').value,'overlay');assert.equal(h.ui.bundle().scoreThreshold,.51);
});
test('all-zero and LOW-only native maps keep exact zero HIGH bounds and never substitute signed maxima',()=>{
 const h=controls();h.ui.observePresentation({view:'scores',field:'both',observedMaximum:2,observedMaxima:{high:0,low:2},signedRanges:{high:{minimum:-2,maximum:-.1},low:{minimum:.1,maximum:2}}});h.$('energy-score-field').value='high';h.$('energy-score-field').onchange();assert.equal(Number(h.$('energy-score-threshold').min),0);assert.equal(Number(h.$('energy-score-threshold').max),0);assert.equal(h.ui.bundle().scoreThreshold,0);
 h.ui.resetBounds();h.$('energy-score-field').value='unified';h.$('energy-score-field').onchange();h.ui.observePresentation({view:'scores',field:'unified',observedMaximum:0,observedMaxima:{high:0,low:0}});assert.equal(Number(h.$('energy-score-threshold').max),0);h.$('energy-score-threshold-number').value='.1';h.$('energy-score-threshold-number').oninput();assert.equal(h.ui.bundle().scoreThreshold,0);
});
test('negative historical thresholds migrate only for High, Low and Unified while Both and explicit choices survive recovery',()=>{
 const original=validEnergySettings();for(const field of ['high','low','unified'])assert.equal(validEnergySettings({...original,scoreField:field,scoreThreshold:-2.7}).scoreThreshold,0);assert.equal(validEnergySettings({...original,scoreField:'both',scoreThreshold:-2.7}).scoreThreshold,-2.7);
 const h=controls();h.ui.load({...original,scoreField:'unified',scoreThreshold:-2,scoreView:'overlay'});assert.deepEqual(h.ui.presentation('scores'),{view:'scores',field:'unified',threshold:0,scoreView:'overlay'});assert.equal(h.ui.bundle().selected,original.selected);assert.deepEqual(h.ui.bundle().values,original.values);
});
test('dual score and source overlay choices remain independent of Biome settings and the native recipe',()=>{
 const h=controls(),before=h.ui.prepare('biomes'),old=h.ui.bundle();h.$('energy-score-field').value='both';h.$('energy-score-field').onchange();h.$('energy-score-view').value='overlay';h.$('energy-score-view').onchange();
 assert.deepEqual(h.ui.prepare('scores').presentation,{view:'scores',field:'both',threshold:0,scoreView:'overlay'});assert.deepEqual(h.ui.prepare('scores').params,before.params);assert.deepEqual(h.ui.presentation('biomes'),before.presentation);assert.equal(h.ui.bundle().opacity,old.opacity);assert.equal(h.science,0);assert.equal(h.views,2);
 h.ui.load(JSON.parse(JSON.stringify(h.ui.bundle())));assert.equal(h.$('energy-score-view').value,'overlay');assert.equal(h.$('energy-score-field').value,'both');assert.equal(h.$('energy-view').value,old.view);
});
test('slider gesture drafts produce bounded previews, commit exactly once and remove lifecycle listeners on dispose',()=>{
 const h=controls(),requests=[];let scientific=0;const ui=createEnergyUI({$:h.$,t:key=>key,changed:()=>scientific++,persist(){},viewChanged:options=>requests.push(options??{})}),range=h.$('energy-score-threshold');
 range.emit('pointerdown',{button:0,isPrimary:true});range.value='.3';range.oninput();range.value='.8';range.oninput();
 assert.deepEqual(requests.slice(-2),[{preview:{maxWidth:320,maxHeight:320}},{preview:{maxWidth:320,maxHeight:320}}]);range.emit('pointerup');range.emit('change');range.emit('blur');assert.deepEqual(requests.at(-1),{});assert.equal(requests.length,3);
 range.emit('keydown',{key:'ArrowRight'});range.value='1.1';range.oninput();range.emit('keyup',{key:'ArrowRight'});assert.equal(requests.length,5);assert.deepEqual(requests.at(-1),{});assert.equal(scientific,0);
 const before=requests.length;ui.dispose();range.emit('pointerdown',{button:0});range.value='1.3';range.oninput();assert.deepEqual(requests.at(-1),{});assert.equal(requests.length,before+1,'disposed global gesture listeners cannot create a preview');h.ui.dispose();
});

const bundle=()=>({schema:'sherloq.settings/1',profiles:[],current:{...defaults},activeProfile:'native',preferences:{theme:'dark',language:'fr',layout:'tabs',computeProfile:'maximum',regionMode:'whole',favorite:false,showZones:true,toolsVisible:true,inspectorVisible:true,elaMode:'energy'},energy:validEnergySettings()});
test('old Energy preferences retain the previous Biome meaning; new score presentation settings round-trip and recover independently',()=>{
 assert.equal(validElaMode('energy'),'biomes');for(const mode of ['classic','scores','biomes'])assert.equal(validElaMode(mode),mode);assert.throws(()=>validElaMode('labels'));
 const old=bundle(),oldRecipe=structuredClone(old.energy);assert.equal(validateSettings(old).preferences.elaMode,'biomes');assert.deepEqual(validateSettings(old).energy,oldRecipe);
 const newSettings={...old,preferences:{...old.preferences,elaMode:'scores'},energy:{...old.energy,scoreField:'both',scoreThreshold:1.23,scoreView:'overlay'}};
 assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(newSettings))),{...newSettings,preferences:{...newSettings.preferences,navigationMode:'auto'}});
 const recovered=recoverSettings({...newSettings,energy:{...newSettings.energy,quality:999}}).value;
 assert.equal(recovered.energy.scoreThreshold,1.23);assert.equal(recovered.energy.scoreField,'both');assert.equal(recovered.preferences.elaMode,'scores');assert.equal(recovered.energy.scoreView,'overlay');
 assert.equal(validEnergySettings({...old.energy,scoreField:'both',scoreThreshold:-1}).scoreThreshold,-1);for(const value of [Infinity,NaN])assert.throws(()=>validEnergySettings({...old.energy,scoreThreshold:value}));assert.throws(()=>validEnergySettings({...old.energy,scoreField:'scope'}));
});
