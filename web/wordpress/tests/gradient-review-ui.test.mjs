// DOM/controller checks only; scientific composition and browsers are separate.
import test from 'node:test';import assert from 'node:assert/strict';import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {equalizationMethods} from '../sherloq-browser/assets/equalization-menu.js';
function environment(){
 const {document,window}=parseHTML('<html><body><section id="analysis-controls"></section><div id="viewport"></div></body></html>'),previous=new Map(),frames=new Map(),timers=new Map(),events=[];let serial=0,time=0,language='fr';
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:600,left:0,top:0,bottom:20});window.HTMLElement.prototype.reportValidity=()=>true;window.HTMLElement.prototype.checkValidity=()=>true;
 window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({},{get:(value,key)=>value[key]??(()=>{})});
 for(const[key,value]of Object.entries({document,window,Option:class{constructor(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;}},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:class{observe(){}disconnect(){}},devicePixelRatio:1})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const ui=createToolWorkspace({document,experimentalTools:()=>true,getSourceContext:()=>({width:800,height:600}),interactiveControlOptions:{now:()=>time,delay:(fn,ms)=>{timers.set(++serial,{at:time+ms,fn});return serial;},cancelDelay:id=>timers.delete(id)},language:()=>language,getClient:async()=>({}),run(){throw Error('No image calculation expected');},cancel(){},showSurface(){},download(){},notify(){},onSettings(){},onInteractive:event=>events.push(event)});
 const emit=(target,type,properties={})=>target.dispatchEvent(Object.assign(new window.Event(type,{bubbles:true}),properties));
 return{ui,document,events,emit,input:key=>document.getElementById('tool-param-'+key),choose:method=>emit(document.querySelector('[data-method="'+method+'"]'),'click'),draw(ms=120){const until=time+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;time=next[1].at;timers.delete(next[0]);next[1].fn();}time=until;for(const[id,fn]of [...frames]){frames.delete(id);fn();}},language(value){language=value;ui.translate();},dispose(){ui.dispose();for(const[key,descriptor]of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
}
test('all standard equalizations preserve an editable gradient intensity on Sobel and Krawetz',()=>{const e=environment();try{e.ui.select('detail.gradient');for(const method of['sobel','krawetz']){e.ui.updateParams({method,intensity:37});for(const eq of equalizationMethods){e.choose(eq.id);assert.equal(e.ui.params().equalization.method,eq.id);assert.equal(e.input('intensity').disabled,false,method+'/'+eq.id);assert.equal(e.ui.params().intensity,37);e.ui.lock(true,true);assert.equal(e.input('intensity').disabled,true);e.ui.lock(false,true);assert.equal(e.input('intensity').disabled,false);assert.equal(Number(e.input('intensity').value),37);}e.choose('none');assert.equal(e.input('intensity').disabled,false);assert.equal(e.ui.params().intensity,37);}}finally{e.dispose();}});
test('BPDHE allows held intensity drafts and the final exact numeric value',()=>{const e=environment();try{e.ui.select('detail.gradient');e.choose('bpdhe');const input=e.input('intensity');e.emit(input,'pointerdown',{button:0,pointerId:1});input.value='10';e.emit(input,'input');e.draw();const draft=e.events.filter(v=>v.field==='intensity'&&v.phase==='preview').at(-1);assert.equal(draft.params.intensity,10);assert.equal(draft.params.equalization.method,'bpdhe');e.emit(e.document,'pointerup',{pointerId:1});assert.equal(e.events.at(-1).phase,'commit');assert.equal(e.events.at(-1).params.intensity,10);input.value='80';e.emit(input,'input');e.emit(input,'change');assert.equal(e.events.at(-1).phase,'commit');assert.equal(e.events.at(-1).params.intensity,80);assert.equal(e.events.at(-1).params.equalization.method,'bpdhe');assert.equal(e.ui.params().intensity,80);}finally{e.dispose();}});
test('modern equalization and intensity survive serialization and language changes',()=>{const e=environment();try{e.ui.select('detail.gradient');e.choose('ahe');e.ui.updateParams({intensity:80});const saved=e.ui.serialize();e.ui.restore(saved);assert.equal(e.input('intensity').disabled,false);assert.equal(e.ui.params().intensity,80);assert.equal(e.ui.params().equalization.method,'ahe');assert.match(e.input('intensity').title,/avant/);e.language('en');e.ui.select('detail.gradient',true);assert.equal(e.input('intensity').disabled,false);assert.match(e.input('intensity').title,/before equalization/);}finally{e.dispose();}});
test('restoring a legacy checkbox stays legacy until a human intensity edit upgrades the menu state',()=>{const e=environment();try{e.ui.select('detail.gradient');const saved=e.ui.serialize();saved['detail.gradient'].equalize=true;saved['detail.gradient'].intensity=37;delete saved['detail.gradient'].equalization;e.ui.restore(saved);assert.equal(e.ui.params().equalization,undefined);assert.equal(e.ui.params().equalize,true);assert.equal(e.input('intensity').disabled,false);const input=e.input('intensity');input.value='80';e.emit(input,'input');e.emit(input,'change');assert.equal(e.ui.params().intensity,80);assert.equal(e.ui.params().equalization.method,'histogram');assert.equal(e.events.at(-1).params.equalization.method,'histogram');assert.equal(e.events.at(-1).params.intensity,80);}finally{e.dispose();}});
test('native magnifier equalization keeps its genuinely unused clipping controls disabled',()=>{const e=environment();try{e.ui.select('inspection.magnifier');e.choose('histogram');for(const key of['percent','channel'])assert.equal(e.input(key).disabled,true);e.ui.lock(true,true);e.ui.lock(false,true);for(const key of['percent','channel'])assert.equal(e.input(key).disabled,true);e.choose('none');for(const key of['percent','channel'])assert.equal(e.input(key).disabled,false);}finally{e.dispose();}});
test('HSV field GPU and method-specific preferences are available in both languages',()=>{const e=environment();try{e.ui.select('detail.gradient');e.ui.updateParams({method:'sobel'});const backend=e.document.getElementById('tool-backend'),method=e.input('method');assert.ok(backend);assert.equal(e.ui.backend(),'auto');assert.equal([...backend.options].find(o=>o.value==='webgpu').disabled,false);backend.value='webgpu';e.emit(backend,'input');e.emit(backend,'change');assert.equal(e.ui.backend(),'webgpu');method.value=JSON.stringify('krawetz');e.emit(method,'input');e.emit(method,'change');assert.equal(e.ui.backend(),'auto');assert.equal([...backend.options].find(o=>o.value==='webgpu').disabled,true);e.ui.updateParams({view:'angle'});assert.equal([...backend.options].find(o=>o.value==='webgpu').disabled,false);assert.match(backend.options[0].textContent,/CPU \/ GPU$/);e.language('en');assert.equal(backend.options[0].textContent,'Automatic · CPU / GPU');method.value=JSON.stringify('sobel');e.emit(method,'input');e.emit(method,'change');assert.equal(e.ui.backend(),'webgpu');assert.equal([...backend.options].find(o=>o.value==='webgpu').disabled,false);}finally{e.dispose();}});
test('all nine field methods expose compatible controls and retain numeric settings, view and equalization',async()=>{const{GRADIENT_METHODS}=await import('../sherloq-browser/assets/gradient-methods.js');const e=environment();try{e.ui.select('detail.gradient');assert.equal(e.ui.params().view,'native');assert.equal(e.ui.params().method,'krawetz');e.choose('bpdhe');for(const method of GRADIENT_METHODS){e.ui.updateParams({method});assert.equal(e.ui.params().method,method);assert.equal(e.input('mode').closest('label').hidden,method==='krawetz'||e.ui.params().view!=='native');assert.equal(e.document.getElementById('tool-backend').options[2].disabled,method==='krawetz'&&e.ui.params().view==='native');if(method==='farid'){assert.equal(e.input('kernelSize').min,'5');assert.equal(e.input('kernelSize').max,'7');}e.ui.updateParams({view:'coherence',tensorSigma:2.3,tensorSize:15,preSigma:.7,preSize:7});assert.equal(e.input('tensorSize').closest('label').hidden,false);assert.equal(e.input('preSize').closest('label').hidden,false);assert.equal(e.ui.params().equalization.method,'bpdhe');const saved=e.ui.serialize();e.ui.restore(saved);assert.equal(e.ui.params().tensorSigma,2.3);assert.equal(e.ui.params().view,'coherence');}}finally{e.dispose();}});
test('batch recipes carry every field parameter and common equalization into the engine task',async()=>{const{batchCatalog,batchTask}=await import('../sherloq-browser/assets/batch-catalog.js');const{GRADIENT_METHODS,gradientDefaults}=await import('../sherloq-browser/assets/gradient-methods.js');const descriptor=batchCatalog.find(v=>v.operation==='detail.gradient');assert(descriptor.fields.some(v=>v.key==='tensorSize'));for(const method of GRADIENT_METHODS){const recipe={...structuredClone(descriptor),params:{...gradientDefaults(method),view:'coherence',tensorSize:15,tensorSigma:2.3,preSigma:.5,preSize:7,equalization:{method:'clahe',values:equalizationMethods.map(m=>m.default)}}},task=batchTask(recipe,{id:'batch-gradient',imageId:'original'});assert.deepEqual(task.params,recipe.params);assert.equal(task.backend,'auto');}});

test('switching methods preserves the current intensity rather than restoring per-method percentages',async()=>{const{GRADIENT_METHODS}=await import('../sherloq-browser/assets/gradient-methods.js');const e=environment();try{e.ui.select('detail.gradient');for(const intensity of[37,82,0,100]){const input=e.input('intensity');input.value=String(intensity);e.emit(input,'input');e.emit(input,'change');for(const method of GRADIENT_METHODS){const selector=e.input('method');selector.value=JSON.stringify(method);e.emit(selector,'input');e.emit(selector,'change');assert.equal(e.ui.params().method,method);assert.equal(e.ui.params().intensity,intensity);assert.equal(Number(e.input('intensity').value),intensity);}}}finally{e.dispose();}});

test('display, luminance, borders and shared controls follow the current selection across operators and saved profiles',async()=>{
 const{GRADIENT_METHODS}=await import('../sherloq-browser/assets/gradient-methods.js');const e=environment();
 try{
  e.ui.select('detail.gradient');
  // Seed different method histories, as in a session that predates shared controls.
  for(const method of GRADIENT_METHODS)e.ui.updateParams({method,view:'native',luma:'bt601',border:method==='krawetz'?'omit':'reflect',sampleStep:1,preSigma:0});
  const common={intensity:37,mode:3,invert:true,luma:'linear709',border:'nearest',sampleStep:2,preSigma:.7,preSize:7,tensorSigma:2.3,tensorSize:15,sigma:1.7,diskFill:.8};
  e.ui.updateParams(common);e.choose('clahe');
  for(const view of['angle','coherence','native']){
   e.ui.updateParams({view});
   for(const method of GRADIENT_METHODS){
    const input=e.input('method');input.value=JSON.stringify(method);e.emit(input,'input');e.emit(input,'change');
    const p=e.ui.params();assert.equal(p.method,method);assert.equal(p.view,view,method+' display');
    for(const[key,value]of Object.entries(common))assert.equal(p[key],value,method+'/'+key);
    assert.equal(p.equalization.method,'clahe');assert.equal(e.input('method').title,[...e.input('method').options].find(o=>o.value===e.input('method').value).textContent);assert.equal(e.input('view').title,[...e.input('view').options].find(o=>o.value===e.input('view').value).textContent);
    for(const key of['view','luma','border','sampleStep'])assert.equal(e.input(key).closest('label').hidden,false,key+' remains available');
    assert.equal(e.events.filter(v=>v.phase==='commit').at(-1).params.view,view);
   }
  }
  const saved=e.ui.serialize();e.ui.restore(saved);const input=e.input('method');input.value=JSON.stringify('scharr');e.emit(input,'input');e.emit(input,'change');
  assert.equal(e.ui.params().view,'native');assert.equal(e.ui.params().luma,'linear709');assert.equal(e.ui.params().border,'nearest');
 }finally{e.dispose();}
});

test('only incompatible named supports adapt when switching methods; other settings remain shared in batch too',async()=>{
 const{changeGradientMethod,gradientDefaults}=await import('../sherloq-browser/assets/gradient-methods.js');
 let params={...gradientDefaults('sobel'),kernelSize:9,view:'coherence',luma:'linear709',border:'nearest',sampleStep:3,mode:1};
 for(const[method,size]of[['prewitt',9],['farid',5],['sobel',5],['scharr',3],['gaussian',3],['krawetz',3]]){
  params=changeGradientMethod(params,method).parameters;assert.equal(params.kernelSize,size);assert.equal(params.view,'coherence');assert.equal(params.luma,'linear709');assert.equal(params.border,'nearest');assert.equal(params.sampleStep,3);assert.equal(params.mode,1);
 }
});

test('processor and action nodes precede advanced content and survive returning from other tools',()=>{
 const e=environment();try{
  for(let round=0;round<3;round++){
   e.ui.select('detail.gradient');const root=e.document.getElementById('tool-controls'),fields=e.input('method').closest('.tool-fields'),advanced=fields.querySelector('.gradient-advanced');
   assert(root.classList.contains('gradient-controls'));assert.equal(root.querySelectorAll('#tool-backend').length,1);
   const children=[...fields.children],group=fields.querySelector('.gradient-primary-actions');assert(children.indexOf(group)<children.indexOf(advanced));assert.equal(group.querySelector('.tool-attachments').parentNode,group);assert.equal(group.querySelector('.tool-actions').parentNode,group);
   const backend=e.document.getElementById('tool-backend');backend.value='cpu';e.emit(backend,'input');e.emit(backend,'change');assert.equal(e.ui.backend(),'cpu');
   e.ui.select('noise.separation');assert.equal(root.classList.contains('gradient-controls'),false);assert.equal(root.querySelector('.tool-actions').parentNode,root);assert.equal(root.querySelector('.tool-attachments').parentNode,root);assert.equal(root.querySelectorAll('.tool-actions').length,1);
  }
 }finally{e.dispose();}
});

test('seeded parameter walks preserve independent settings and valid committed tasks through rebuilds',async t=>{
 const{gradientParams}=await import('../../engine-source/src/gradient-parameters.js'),{equalizationPlan}=await import('../../engine-source/src/equalization-settings.js');
 const e=environment();let state=0x571a2f17;const pick=a=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return a[state%a.length];},walk=[],seen=new Set();
 try{
  e.ui.select('detail.gradient');e.choose('none');
  for(let step=0;step<3600;step++){
   const before=structuredClone(e.ui.params()),keys=['method','view','intensity','mode','invert','kernelSize','sampleStep','preSigma','preSize','tensorSigma','tensorSize','luma','border','sigma','diskFill','equalization','restore','rebuild','backend'],key=pick(keys);let chosen;
   if(key==='restore'){const saved=e.ui.serialize();e.ui.restore(saved);assert.deepEqual(e.ui.params(),before);}
   else if(key==='rebuild'){e.language(pick(['fr','en']));e.ui.select('detail.gradient',true);assert.deepEqual(e.ui.params(),before);}
   else if(key==='backend'){const input=e.document.getElementById('tool-backend');chosen=pick([...input.options].filter(o=>!o.disabled).map(o=>o.value));input.value=chosen;e.emit(input,'input');e.emit(input,'change');assert.equal(e.ui.backend(),chosen);assert.deepEqual(e.ui.params(),before);}
   else if(key==='equalization'){chosen=pick(['none','histogram','clahe','ahe','bpdhe']);e.choose(chosen);assert.equal(e.ui.params().equalization?.method??'none',chosen);assert.equal(e.ui.params().intensity,before.intensity);}
   else{
    const input=e.input(key);if(input.disabled||input.closest('label').hidden)continue;
    chosen=pick(({method:['sobel','krawetz','disk','central','prewitt','scharr','farid','gaussian','kirsch'],view:['native','angle','coherence'],intensity:[0,1,37,93,100],mode:[0,1,2,3],invert:[true,false],kernelSize:before.method==='farid'?[5,7]:[3,5,9,63],sampleStep:[1,2,16],preSigma:[0,.1,.7,32],preSize:[3,7,127],tensorSigma:[.1,1.5,32],tensorSize:[3,11,127],luma:['bt601','linear709'],border:['reflect','nearest','omit'],sigma:[.1,1,32],diskFill:[.1,.8,1]})[key]);
    if(input.type==='checkbox')input.checked=chosen;else input.value=input.tagName==='SELECT'?JSON.stringify(chosen):String(chosen);
    e.emit(input,'input');e.emit(input,'change');const after=e.ui.params();assert.equal(after[key],chosen,key+' at '+step);
    for(const k of Object.keys(before))if(k!==key&&!(key==='method'&&k==='kernelSize'))assert.deepEqual(after[k],before[k],'Unexpected change of '+k+' after '+key+' at '+step);
   }
   walk.push({step,key,chosen});const params=e.ui.params();seen.add(params.method+'/'+params.view);assert.equal(e.document.getElementById('tool-backend').value,e.ui.backend());gradientParams(equalizationPlan('detail.gradient',params)?.base??params);e.draw();
   for(const event of e.events.slice(-3))if(event.phase==='commit')gradientParams(equalizationPlan(event.operation,event.params)?.base??event.params);
  }
  assert.equal(seen.size,27);t.diagnostic(JSON.stringify({attemptedSteps:3600,appliedSteps:walk.length,methodDisplayPairs:seen.size}));
 }catch(error){error.message+='\nRecent walk: '+JSON.stringify(walk.slice(-20));throw error;}finally{e.dispose();}
});

test('method/view changes during held numeric gestures cancel obsolete drafts without reverting accepted values',()=>{
 const e=environment();try{e.ui.select('detail.gradient');
  for(const field of['intensity','sampleStep','preSigma','tensorSigma']){
   e.ui.updateParams({method:'scharr',view:'coherence',intensity:0,sampleStep:1,preSigma:0,tensorSigma:1.5});const input=e.input(field),value={intensity:37,sampleStep:3,preSigma:.8,tensorSigma:2.3}[field];
   e.emit(input,'pointerdown',{button:0,pointerId:31,clientX:0,clientY:0});input.value=String(value);e.emit(input,'input');e.draw(150);const before=e.events.length;
   const method=e.input('method');method.value=JSON.stringify('farid');e.emit(method,'input');e.emit(method,'change');assert.equal(e.ui.params()[field],value);
   const view=e.input('view');view.value=JSON.stringify('angle');e.emit(view,'input');e.emit(view,'change');e.emit(e.document,'pointerup',{pointerId:31});e.draw(1000);
   assert.equal(e.ui.params().method,'farid');assert.equal(e.ui.params().view,'angle');assert.equal(e.ui.params()[field],value);
   assert.equal(e.events.slice(before).filter(x=>x.phase==='preview'&&x.params.method==='scharr').length,0);
   const stale=input,saved=e.ui.serialize();e.ui.restore(saved);stale.value='99';e.emit(stale,'input');e.emit(stale,'change');assert.equal(e.ui.params()[field],value,'retired controls cannot change restored settings');
  }
 }finally{e.dispose();}
});
