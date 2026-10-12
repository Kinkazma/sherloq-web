import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createToolWorkspace} from '../sherloq-browser/assets/tool-workspace.js';
import {cloneMethodFamily,CLONE_ALGORITHMS} from '../sherloq-browser/assets/clone-methods.js';
import {sparseParameters} from '../sherloq-browser/assets/sparse-controls.js';

test('Method families distinguish classical detection from learned matching',()=>{
 assert.equal(CLONE_ALGORITHMS[16],'SIFT + G2NN + RANSAC + Panels + Text');
 assert.equal(CLONE_ALGORITHMS.at(-1),'EfficientLoFTR');
 assert.equal(cloneMethodFamily('PatchMatch Zernike'),'dense');
 assert.equal(cloneMethodFamily('SIFT + G2NN + RANSAC + Panels + Text'),'classical');
 for(const name of ['ALIKED + LightGlue','SIFT + LightGlue','EfficientLoFTR'])assert.equal(cloneMethodFamily(name),'learned');
});

test('EfficientLoFTR compares two regions and sends only its declared transform parameters',()=>{
 const boxes=[{x0:0,y0:10,x1:320,y1:330},{x0:340,y0:10,x1:660,y1:330},{x0:0,y0:10,x1:660,y1:330,envelope:true}];
 const p=sparseParameters({algorithm:'EfficientLoFTR',compare:true,compact:false,reflections:true,rotationMode:'quarter-turns',longSide:832},boxes);
 assert.equal(p.regions.length,2);assert.equal(p.compare,true);assert.equal(p.reflections,true);
 assert.deepEqual(p.rotations,[0,90,180,270]);assert.equal(p.rotationMode,undefined);assert.equal(p.longSide,832);
 const sift=sparseParameters({...p,algorithm:'SIFT',rotationMode:'none'},[]);
 assert.equal(sift.longSide,undefined);assert.equal(sift.rotationMode,undefined);assert.equal(sift.rotations,undefined);
});

test('The real clone panel offers family groups and enables only relevant EfficientLoFTR settings',()=>{
 const {document,window}=parseHTML('<div id="analysis-controls"></div><div id="viewport"></div>');globalThis.document=document;
 window.HTMLInputElement.prototype.reportValidity=()=>true;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value||this.options[0]?.value||'';},set(v){for(const o of this.options)o.toggleAttribute('selected',o.value===String(v));}});
 globalThis.Option=function(text,value){const o=document.createElement('option');o.textContent=text;o.value=value;return o;};
 let language='fr';
 const ui=createToolWorkspace({document,language:()=>language,getClient:async()=>({}),run(){},cancel(){},showSurface(){},download(){},notify(){}});
 ui.select('tampering.copyMove.sparse');
 const detector=document.getElementById('tool-param-algorithm');
 assert.equal(detector.querySelectorAll('optgroup').length,3);
 for(const name of ['EfficientLoFTR','ALIKED + LightGlue','XFeat']){const option=[...detector.options].find(o=>JSON.parse(o.value)===name);assert.match(option.textContent,/202[34]/);assert.equal(option.dataset.newFeature,'yellow');}
 detector.value=JSON.stringify('EfficientLoFTR');detector.onchange();
 for(const key of ['longSide','rotationMode'])assert.equal(document.getElementById('tool-param-'+key).closest('label').hidden,false);
 for(const key of ['radius','autoRadius','compact','patch'])assert.equal(document.getElementById('tool-param-'+key).closest('label').hidden,true);
 assert.equal(document.getElementById('tool-param-compare').checked,true);assert.equal(document.getElementById('tool-param-compare').disabled,true);
 assert.equal(ui.canRun([]),false);assert.equal(ui.canRun([{},{}, {envelope:true}]),true);assert.equal(ui.canRun([{}]),false);assert.equal(ui.params([]).threshold,.2);assert.deepEqual(ui.params([]).rotations,[0]);
 assert.equal(document.getElementById('tool-param-threshold').closest('label').querySelector('span').textContent,'Confiance minimum');
 language='en';ui.translate();assert.equal(detector.querySelector('[data-clone-family="learned"]').label,'Learned matching');
 detector.value=JSON.stringify('ALIKED + LightGlue');detector.onchange();
 assert.equal(document.getElementById('tool-param-longSide').closest('label').hidden,true);assert.equal(ui.params([]).longSide,undefined);
});
