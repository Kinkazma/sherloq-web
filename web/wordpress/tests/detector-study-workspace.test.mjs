import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';

function fixture(){
 const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
  get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},
  set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:600,left:0,top:0});
 window.HTMLElement.prototype.reportValidity=()=>true;
 window.HTMLElement.prototype.checkValidity=()=>true;
 window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(value,key)=>value[key]??(()=>{})});
 const previous=new Map();
 for(const [key,value]of Object.entries({document,window,
  Option:class{constructor(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;}},
  requestAnimationFrame:()=>1,cancelAnimationFrame(){},devicePixelRatio:1,
  ResizeObserver:class{observe(){}disconnect(){}},fetch:async()=>({ok:false,status:404})})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 let language='fr',calculations=0,clients=0;
 const settings=[];
 const ui=createToolWorkspace({document,language:()=>language,
  getSourceContext:()=>({width:100,height:80}),
  getClient:async()=>{clients++;throw Error('The study must not acquire an analysis client');},
  run(){calculations++;throw Error('The study must not run a detector');},cancel(){},
  showSurface(){throw Error('A generation classifier has no image surface');},
  download(){throw Error('The study must not export scientific data');},
  notify(){},onSettings:event=>settings.push(event)});
 return {ui,document,window,settings,
  get calculations(){return calculations;},get clients(){return clients;},
  language(value){language=value;ui.translate();},
  dispose(){ui.dispose();for(const [key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
}

// Independent totals from the recorded native decisions, not renderer exports.
const DETECTORS=[
 {method:'dda',tp:148,fp:59}, {method:'gapl',tp:205,fp:137},
 {method:'spai',tp:212,fp:160}, {method:'prl',tp:68,fp:43},
 {method:'community-forensics',tp:34,fp:11}, {method:'bfree',tp:23,fp:28}
];

function assertNoStudyInCommands(document){
 const controls=document.getElementById('tool-controls');
 assert.equal(controls.querySelector('.generation-evaluation'),null);
 assert.equal(controls.querySelector('[data-detector-study]'),null);
 assert.equal(controls.querySelector('.detector-study-host'),null);
 assert.equal(controls.querySelector('[data-detector-study-condition]'),null);
}

function ordinaryOutput(method,value=.73){
 const logit=Math.log(value/(1-value));
 return ['bfree','spai'].includes(method)?
  {operation:'ai.generation.'+method,status:'ok',data:{method,
   scores:{global_logit:logit,sigmoid_score_uncalibrated:value,default_logit_threshold:0}}}:
  {operation:'ai.generation.detect',status:'ok',data:{method,score:value,logit,
   threshold:.5,decisionOperator:['dda','prl'].includes(method)?'>=':'>',decision:value>=.5}};
}

function assertEvaluationShape(document,method){
 assertNoStudyInCommands(document);
 const gauge=document.querySelector('.generation-gauge');assert(gauge);
 const evaluation=gauge.querySelector('.generation-evaluation');assert(evaluation);
 assert.equal(document.querySelectorAll('.generation-evaluation').length,1);
 assert.equal(evaluation.dataset.detectorStudy,method);
 assert.equal(gauge.lastElementChild,evaluation,'evaluation remains below the native meter and verdict');
 assert.equal(evaluation.previousElementSibling.className,'generation-warning');
 assert.equal(evaluation.children.length,3,'keep only the existing heading, source line and table');
 assert.equal(evaluation.firstElementChild.tagName.toLowerCase(),'h3');
 assert.equal(evaluation.lastElementChild.tagName.toLowerCase(),'table');
 assert(['a','span'].includes(evaluation.children[1].tagName.toLowerCase()));
 assert.equal(evaluation.querySelectorAll('tbody tr').length,4);
 assert.equal(evaluation.querySelectorAll('thead th').length,2);
 assert.equal(evaluation.querySelector('input,select,button,details'),null);
 assert.equal(evaluation.querySelector('[href]'),null,'no link to the old unrelated CONVEX study');
 assert.doesNotMatch(evaluation.textContent,/CONVEX|sans bruit|avec bruit|No added noise|Added noise/);
 assert.deepEqual([...gauge.children].map(n=>(n.className?.baseVal??n.className)||n.tagName.toLowerCase()),
  ['generation-gauge-header','svg','generation-gauge-ends','generation-gauge-index','generation-verdict','generation-warning','generation-evaluation']);
 return {gauge,evaluation};
}

test('all six detectors leave commands untouched and show four study rows only under their result gauge',async()=>{
 const h=fixture();
 try{
  for(const reference of DETECTORS){
   const {method,tp,fp}=reference;
   h.ui.select('ai.generation.'+method);
   assertNoStudyInCommands(h.document);
   assert.equal(h.document.querySelector('.generation-evaluation'),null,'no new study before a result');
   const output=ordinaryOutput(method),before=structuredClone(output);
   await h.ui.render(output);
   const {evaluation}=assertEvaluationShape(h.document,method);
   const percent=new Intl.NumberFormat('fr',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
   const expected=[tp/318,fp/348,tp/(tp+fp),(tp+348-fp)/666].map(v=>percent.format(v));
   assert.deepEqual([...evaluation.querySelectorAll('tbody td')].map(n=>n.textContent),expected,method);
   assert.deepEqual(output,before);
  }
  assert.equal(h.calculations,0);assert.equal(h.clients,0);
 }finally{h.dispose();}
});

test('French/English study translation preserves all six native meter positions without analysis or parameter changes',async()=>{
 const h=fixture();
 try{
  for(const {method}of DETECTORS){
   h.language('fr');h.ui.select('ai.generation.'+method);
   await h.ui.render(ordinaryOutput(method));
   const parameters=structuredClone(h.ui.params()),settingsCount=h.settings.length;
   const before=assertEvaluationShape(h.document,method);
   const needle=before.gauge.querySelector('path.generation-gauge-needle').getAttribute('transform');
   assert.match(before.gauge.querySelector('.generation-gauge-index').textContent,/73,0/);
   assert.match(before.evaluation.textContent,/images non IA/);
   h.language('en');
   const english=assertEvaluationShape(h.document,method);
   assert.equal(english.evaluation.lang,'en');assert.match(english.evaluation.textContent,/non-AI images/);
   assert.match(english.gauge.querySelector('.generation-gauge-index').textContent,/73\.0/);
   assert.equal(english.gauge.querySelector('path.generation-gauge-needle').getAttribute('transform'),needle);
   h.language('fr');
   const french=assertEvaluationShape(h.document,method);
   assert.equal(french.evaluation.lang,'fr');
   assert.equal(french.gauge.querySelector('path.generation-gauge-needle').getAttribute('transform'),needle);
   assert.deepEqual(h.ui.params(),parameters);assert.equal(h.settings.length,settingsCount);
  }
  assert.equal(h.calculations,0);assert.equal(h.clients,0);
 }finally{h.dispose();}
});

function nativeContexts(){
 return {operation:'ai.generation.bfree',status:'ok',
  sourceRegionDomain:{sourceSha256:'a'.repeat(64),fingerprint:'native-domain'},
  data:{independentNativeContexts:true,fragments:[0,1].map(i=>({id:'context-'+i,
   originalBounds:[i*50+2,3,i*50+34,35],nativeDimensions:[32,32],evaluable:true,status:'analysed',
   data:{method:'bfree',window_logits:Array(5).fill(i?2:-2),scores:{global_logit:i?2:-2,
    sigmoid_score_uncalibrated:i?.8:.2,default_logit_threshold:0}}}))}};
}

test('native B-Free contexts keep only the active context meter and its unchanged global study table',async()=>{
 const h=fixture(),output=nativeContexts(),before=structuredClone(output);
 try{
  h.ui.select('ai.generation.bfree');
  await h.ui.render(output);
  const parameters=structuredClone(h.ui.params()),settingsCount=h.settings.length;
  const initial=assertEvaluationShape(h.document,'bfree');
  const globalRates=initial.evaluation.querySelector('tbody').textContent;
  assert.equal(h.document.querySelectorAll('.generation-gauge').length,1);
  const select=h.document.querySelector('.generation-native-contexts select');
  select.value='1';select.dispatchEvent(new h.window.Event('change'));
  assert.equal(h.document.querySelector('.generation-native-contexts').dataset.contextId,'context-1');
  assert.match(h.document.querySelector('.generation-gauge-index').textContent,/80,0/);
  const active=assertEvaluationShape(h.document,'bfree');
  assert.equal(active.evaluation.querySelector('tbody').textContent,globalRates,'study rates never become scores for the selected image context');
  const needle=active.gauge.querySelector('path.generation-gauge-needle').getAttribute('transform');
  h.language('en');
  assert.equal(h.document.querySelector('.generation-native-contexts').dataset.contextId,'context-1');
  assert.match(h.document.querySelector('.generation-gauge-index').textContent,/80\.0/);
  assert.equal(assertEvaluationShape(h.document,'bfree').gauge.querySelector('path.generation-gauge-needle').getAttribute('transform'),needle);
  await h.ui.render(output);
  assertEvaluationShape(h.document,'bfree');
  assert.equal(h.document.querySelectorAll('.generation-gauge').length,1);
  assert.equal(h.document.querySelector('.generation-native-contexts').dataset.contextId,'context-1');
  assert.deepEqual(h.ui.params(),parameters);assert.equal(h.settings.length,settingsCount);
  assert.deepEqual(output,before);
  assert.equal(h.calculations,0);assert.equal(h.clients,0);
 }finally{h.dispose();}
});

test('result invalidation and switching away remove the table without adding anything to commands',async()=>{
 const h=fixture();
 const output=ordinaryOutput('spai',0.8910197446750121);
 const before=structuredClone(output);
 try{
  h.ui.select('ai.generation.spai');await h.ui.render(output);
  assert.match(h.document.querySelector('.generation-gauge-index').textContent,/89,1/);
  assertEvaluationShape(h.document,'spai');h.language('en');
  assert.match(h.document.querySelector('.generation-gauge-index').textContent,/89\.1/);
  h.ui.invalidateResult();
  assert.equal(h.document.querySelector('.generation-gauge'),null);
  assert.equal(h.document.querySelector('.generation-evaluation'),null);assertNoStudyInCommands(h.document);
  await h.ui.render(output);assertEvaluationShape(h.document,'spai');
  for(const id of ['jpeg.comprint','ai.text.doctamper','not-a-real-tool']){
   h.ui.select(id);assertNoStudyInCommands(h.document);
   assert.equal(h.document.querySelector('.generation-evaluation'),null,id);
  }
  assert.deepEqual(output,before);
  assert.equal(h.calculations,0);assert.equal(h.clients,0);
 }finally{h.dispose();}
});
