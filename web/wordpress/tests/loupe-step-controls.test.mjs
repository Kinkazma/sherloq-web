import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {effectDefaults,effectRanges} from '../sherloq-browser/assets/loupe-effects-settings.js';
import {loupeStepFields,nudgeLoupeEffects,validateLoupeStepSettings,mountLoupeStepControls} from '../sherloq-browser/assets/loupe-step-controls.js';
import {createLoupeStepPlayback} from '../sherloq-browser/assets/loupe-step-playback.js';
import {validateLoupeSettings} from '../sherloq-browser/assets/media-settings.js';

test('all fifteen step targets preserve disabled groups and clamp to their real bounds',()=>{
 assert.equal(loupeStepFields.length,15);
 for(const [target] of loupeStepFields){
  const [group,key]=target.split('.'),[min,max]=effectRanges[group][key];
  const off=structuredClone(effectDefaults);off[group].enabled=false;
  assert.equal(nudgeLoupeEffects(off,1,{target,step:255}),null,target);
  const input=structuredClone(effectDefaults);input[group].enabled=true;input[group][key]=min;
  const before=structuredClone(input),up=nudgeLoupeEffects(input,1,{target,step:255});
  assert.equal(up[group][key],Math.min(max,min+255),target);
  assert.deepEqual(input,before,'caller owned effects remain unchanged');
  const atMax={...input,[group]:{...input[group],[key]:max}};
  assert.equal(nudgeLoupeEffects(atMax,1,{target,step:1}),null,target);
  const down=nudgeLoupeEffects(atMax,-1,{target,step:255});
  assert.equal(down[group][key],Math.max(min,max-255),target);
 }
});

test('step preferences survive validation; malformed values are rejected',()=>{
 const value=validateLoupeSettings({stepTarget:'enhance.percent',stepSize:7});
 assert.equal(value.stepTarget,'enhance.percent');assert.equal(value.stepSize,7);
 assert.equal(validateLoupeSettings().stepSize,10);
 for(const bad of [{step:0},{step:256},{step:1.5},{step:NaN},{target:'enabled'},{target:'adjust.enabled'}])assert.throws(()=>validateLoupeStepSettings(bad));
 assert.throws(()=>validateLoupeSettings({stepTarget:'wrong'}));
 assert.throws(()=>validateLoupeSettings({stepSize:0}));
 assert.throws(()=>nudgeLoupeEffects(effectDefaults,0));
});

test('distinct clicks wait for the exact native owner and effect key',()=>{
 let value=0;const applied=[],errors=[];
 const playback=createLoupeStepPlayback({step(direction,request){assert.equal(request.target,'adjust.sweep');value+=direction;applied.push(value);return{owner:'source-A',effectsKey:String(value)};},onError:error=>errors.push(error)});
 for(let i=0;i<3;i++)assert.equal(playback.once(1,{target:'adjust.sweep'}),true);
 assert.deepEqual(applied,[1]);assert.equal(playback.state.queued,2);
 assert.equal(playback.presented({owner:'source-B',effectsKey:'1'}),false);
 assert.equal(playback.presented({owner:'source-A',effectsKey:'0'}),false);
 assert.equal(playback.presented({owner:'source-A',effectsKey:'1',native:false}),false);
 assert.deepEqual(applied,[1]);
 assert.equal(playback.presented({owner:'source-A',effectsKey:'1',native:true}),true);assert.deepEqual(applied,[1,2]);
 playback.presented({owner:'source-A',effectsKey:'2'});assert.deepEqual(applied,[1,2,3]);
 playback.presented({owner:'source-A',effectsKey:'3'});assert.equal(playback.state.busy,false);assert.equal(playback.state.completed,3);assert.deepEqual(errors,[]);
 playback.dispose();
});

test('reset/source replacement cancels queued steps; errors and bound no-ops do not hang',()=>{
 const applied=[],errors=[];let owner='A';
 const playback=createLoupeStepPlayback({step(direction){if(direction<0)return null;applied.push(owner);return{owner,effectsKey:'next'};},onError:e=>errors.push(e)});
 playback.once(1);playback.once(1);playback.reset();owner='B';
 assert.equal(playback.presented({owner:'A',effectsKey:'next'}),false);
 playback.once(-1);assert.equal(playback.state.busy,false);
 playback.once(1);assert.equal(playback.presented({owner:'A',effectsKey:'next'}),false);
 playback.presented({owner:'B',effectsKey:'next'});assert.deepEqual(applied,['A','B']);
 playback.dispose();assert.equal(playback.once(1),false);assert.equal(playback.state.queued,0);
 const invalid=createLoupeStepPlayback({step:()=>({owner:'A'}),onError:e=>errors.push(e)});
 invalid.once(1);assert.equal(invalid.state.busy,false);assert.equal(errors.length,1);invalid.dispose();
});

test('step UI keeps its explicit target, updates its current value, respects group state and translates',t=>{
 const {document}=parseHTML('<main></main>');let settings={target:'adjust.sweep',step:3},effects=structuredClone(effectDefaults),language='fr',resets=0;effects.adjust.enabled=true;effects.adjust.sweep=100;
 // Linkedom exposes a read-only select.value; browsers provide the setter.
 const prototype=document.createElement('select').constructor.prototype,descriptor=Object.getOwnPropertyDescriptor(prototype,'value');
 if(!descriptor.set){Object.defineProperty(prototype,'value',{...descriptor,set(value){for(const option of this.options)option.removeAttribute('selected');const option=[...this.options].find(option=>option.value===String(value));option?.setAttribute('selected','');}});t.after(()=>Object.defineProperty(prototype,'value',descriptor));}
 const steps=[];const ui=mountLoupeStepControls(document.querySelector('main'),{getSettings:()=>settings,setSettings:x=>{settings=x;},getEffects:()=>effects,onStep:(direction,p)=>steps.push({direction,...p}),onReset:()=>{resets++;ui.sync();},language:()=>language});
 const find=key=>ui.element.querySelector(`[data-loupe-step="${key}"]`);
 assert.equal(find('value').textContent,'100');assert.equal(find('increase').disabled,false);
 find('increase').onclick();find('increase').onclick();assert.deepEqual(steps,[{direction:1,target:'adjust.sweep',step:3},{direction:1,target:'adjust.sweep',step:3}]);
 effects.adjust.brightness=30;ui.sync();assert.equal(find('target').value,'adjust.sweep');
 find('target').value='enhance.percent';find('target').onchange();assert.equal(settings.target,'enhance.percent');assert.equal(resets,1);assert.equal(find('increase').disabled,true);
 find('increase').onclick();assert.equal(steps.length,2);
 effects.enhance.enabled=true;effects.enhance.percent=9;language='en';ui.sync();assert.equal(find('value').textContent,'9');assert.equal(ui.element.querySelector('summary').textContent,'Step adjustment');
 find('step').checkValidity=()=>true;for(const invalid of ['', '0', '1.5', '256']){find('step').value=invalid;assert.doesNotThrow(()=>find('step').oninput());assert.equal(settings.step,3,'partial or invalid edit does not replace current step');}
 find('step').value='4';find('step').oninput();assert.equal(settings.step,4);find('step').onchange();assert.equal(settings.step,4);
 ui.dispose();assert.equal(document.querySelector('.loupe-step-controls'),null);
});


test('PDF zoom round trips preserve step settings and share the default ten',async()=>{
 const {validateLoupeSettings:pdf}=await import('../sherloq-browser/assets/pdf-media-settings.js');
 assert.equal(pdf().stepSize,10);
 for(const stepSize of [1,10,19,100,255])for(const stepTarget of loupeStepFields.map(x=>x[0])){
  const chosen=validateLoupeSettings({enabled:true,stepSize,stepTarget});
  assert.deepEqual(validateLoupeSettings(pdf({...chosen,zoom:300})),{...chosen,zoom:300});
 }
 assert.throws(()=>pdf({zoom:100}));assert.throws(()=>pdf({stepSize:0}));
});

test('unrelated key releases do not resync an edited number field',()=>{
 let updates=0;const p=createLoupeStepPlayback({step:()=>({owner:'A',effectsKey:'one'}),onChange:()=>updates++});
 assert.equal(p.up('loupe-step:Digit1'),false);assert.equal(updates,0);
 p.down('loupe-step:Equal',1);const count=updates;assert.equal(p.up('loupe-step:Digit0'),false);assert.equal(updates,count);
 assert.equal(p.up('loupe-step:Equal'),true);assert.equal(updates,count+1);assert.equal(p.up('loupe-step:Equal'),false);assert.equal(updates,count+1);p.dispose();
});

test('independent group settings retain their selected field and step through validation and PDF callbacks',async()=>{
 const {selectLoupeStepGroup}=await import('../sherloq-browser/assets/loupe-step-controls.js');
 const {validateLoupeSettings:pdf}=await import('../sherloq-browser/assets/pdf-media-settings.js');
 let p=validateLoupeSettings({stepTarget:'adjust.gamma',stepSize:19});
 p=validateLoupeSettings({...selectLoupeStepGroup(p,'enhance'),stepSize:3});
 assert.equal(p.stepTarget,'enhance.percent');assert.equal(p.stepGroups.adjust.step,19);
 p=validateLoupeSettings({...selectLoupeStepGroup(p,'sweep'),stepTarget:'sweep.width',stepSize:7});
 p=pdf({...p,zoom:500});p=validateLoupeSettings(selectLoupeStepGroup(p,'adjust'));assert.equal(p.stepTarget,'adjust.gamma');assert.equal(p.stepSize,19);
 p=validateLoupeSettings(selectLoupeStepGroup(p,'enhance'));assert.equal(p.stepTarget,'enhance.percent');assert.equal(p.stepSize,3);
 p=validateLoupeSettings(selectLoupeStepGroup(p,'sweep'));assert.equal(p.stepTarget,'sweep.width');assert.equal(p.stepSize,7);
 assert.throws(()=>validateLoupeSettings({stepGroups:{adjust:{target:'enhance.percent',step:10}}}));
 assert.throws(()=>validateLoupeSettings({stepGroups:{enhance:{target:'enhance.percent',step:0}}}));
});
