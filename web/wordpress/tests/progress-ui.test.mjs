import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {hasProgressCounts,progressFraction,progressText,renderProgress} from '../sherloq-browser/assets/progress-ui.js';
import {createAutomaticProgress} from '../sherloq-browser/assets/automatic-state.js';

test('a fraction does not invent a native counter; complete finite counters still include zero',()=>{
 assert.equal(progressText('Running',{phase:'jpeg-encode',fraction:.87,total:5}),'Running · jpeg-encode');
 assert.equal(progressFraction({fraction:.87,total:5}),.87);
 assert.equal(progressText('Running',{phase:'jpeg-encode',completed:0,total:5}),'Running · jpeg-encode · 0/5');
 assert.equal(progressFraction({completed:0,total:5}),0);
 assert.equal(progressFraction({completed:3,total:5}),.6);
});
test('partial, nonnumeric, nonfinite and zero-total counters never produce a misleading ratio',()=>{
 for(const event of[{total:5},{completed:2},{completed:NaN,total:5},{completed:2,total:Infinity},{completed:2,total:'5'},{completed:0,total:0}]){
  assert.equal(hasProgressCounts(event),false);assert.equal(progressText('Running',{phase:'step',...event}),'Running · step');assert.equal(progressFraction(event),null);
 }
 assert.equal(progressFraction({fraction:Infinity,completed:3,total:5}),.6);
 assert.equal(progressFraction({fraction:NaN}),null);
});
test('actual DOM progress has a true finite fraction or an indeterminate bar',()=>{
 const{document}=parseHTML('<progress max="1" value=".2"></progress>'),bar=document.querySelector('progress');
 assert.equal(renderProgress(bar,{fraction:.87,total:5}),.87);assert.equal(Number(bar.value),.87);
 assert.equal(renderProgress(bar,{phase:'decode'}),null);assert.equal(bar.hasAttribute('value'),false);
 renderProgress(bar,{fraction:0});assert.equal(Number(bar.value),0);
 renderProgress(bar,{fraction:2});assert.equal(Number(bar.value),1);
});
test('automatic sub-step progress stays local, preserves its stage and requires both counters',()=>{
 const owner=createAutomaticProgress(true,()=>0);
 owner.accept({phase:'jpeg-encode',group:'ela',stage:'jpeg',fraction:.87,total:5});
 const group=owner.snapshot().groups.ela;assert.equal(hasProgressCounts(group),false);
 assert.equal(progressText('Automatic',group,{counts:false,stage:true}),'Automatic · jpeg-encode · jpeg');
 owner.accept({phase:'jpeg-encode',group:'ela',stage:'jpeg',completed:2,total:5});assert.equal(hasProgressCounts(owner.snapshot().groups.ela),true);
});
test('missing phases are omitted without dropping valid counts or changing event ownership',()=>{
 const event=Object.freeze({fraction:.3,completed:1,total:5});assert.equal(progressText('Running',event),'Running · 1/5');assert.equal(progressFraction(event),.3);assert.deepEqual(event,{fraction:.3,completed:1,total:5});
});

test('native context progress identifies its zero-based context without inventing global progress',()=>{
 const event=Object.freeze({phase:'strict-fragment-patchmatch',fragmentIndex:1,fragments:4,completed:1,total:198,fraction:1/198});
 assert.equal(progressText('Running',event),'Running · strict-fragment-patchmatch · context 2/4 · 1/198');
 assert.equal(progressText('Calcul en cours…',event,{language:'fr'}),'Calcul en cours… · strict-fragment-patchmatch · zone 2/4 · 1/198');
 assert.equal(progressFraction(event),1/198);
 assert.equal(progressText('Running',{...event,completed:undefined}), 'Running · strict-fragment-patchmatch · context 2/4');
 for(const bad of [{fragmentIndex:-1},{fragmentIndex:4},{fragmentIndex:.2},{fragmentIndex:'1'},{fragments:0},{fragments:Infinity},{fragments:'4'}])assert.equal(progressText('Running',{...event,...bad}), 'Running · strict-fragment-patchmatch · 1/198');
});
