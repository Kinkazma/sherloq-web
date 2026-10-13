import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createDetectionRegionsDock,createDock} from '../sherloq-browser/assets/detection-regions-dock.js';
import {createDetectionRegionsPanel} from '../sherloq-browser/assets/detection-regions-panel.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(){
 const {document,window}=parseHTML('<html><body><nav id="tools"><div id="tree"></div><div id="navigation"><button>Fit</button></div></nav><aside id="inspector"><p id="before"></p><div id="owner"></div><p id="after"></p></aside></body></html>');
 const parent=document.getElementById('tools'),before=document.getElementById('navigation'),owner=document.getElementById('owner'),focusCalls=[];let active=null,language='fr';
 Object.defineProperty(document,'activeElement',{get:()=>active,configurable:true});
 window.HTMLElement.prototype.focus=function(options){const previous=active;if(previous===this)return;active=this;previous?.dispatchEvent(new window.Event('blur'));this.dispatchEvent(new window.Event('focus'));focusCalls.push({element:this,options});};
 const dock=createDetectionRegionsDock({document,parent,before,language:()=>language});
 // Browser moves can blur an input. Model that transport behavior explicitly,
 // while the real mounted controls and handlers use LinkeDOM unchanged.
 const append=dock.body.append.bind(dock.body);let moves=0;
 dock.body.append=(...nodes)=>{moves++;if(nodes.some(node=>node.contains(active)))active=null;append(...nodes);};
 return {document,window,parent,before,owner,dock,focusCalls,get moves(){return moves;},setLanguage(value){language=value;}};
}
test('global dock is below tools and above navigation, accessible and hidden without an active visible panel',async()=>{
 const f=fixture();try{
  assert.deepEqual([...f.parent.children].map(n=>n.id||n.className),['tree','detection-regions-dock','navigation']);assert.equal(f.dock.element.hidden,true);assert.equal(f.dock.toggle.type,'button');assert.equal(f.dock.toggle.getAttribute('aria-controls'),f.dock.body.id);assert.equal(f.dock.toggle.getAttribute('aria-expanded'),'true');assert.equal(f.dock.toggle.getAttribute('aria-label'),'Masquer Zones / Biomes');
  f.owner.hidden=true;f.dock.attach(f.owner);assert.equal(f.dock.element.hidden,true);f.owner.hidden=false;await flush();assert.equal(f.dock.element.hidden,false);f.owner.hidden=true;await flush();assert.equal(f.dock.element.hidden,true);assert.equal(f.dock.body.firstChild,f.owner);assert.equal(f.moves,1);
  f.dock.attach(null);assert.equal(f.dock.element.hidden,true);assert.equal(f.owner.parentNode,f.document.getElementById('inspector'));
 }finally{f.dock.dispose();}
});
test('switching/restoring live panels preserves controls, exact position, handlers and values without cloning',()=>{
 const f=fixture(),input=f.document.createElement('input'),other=f.document.createElement('div');let changes=0;input.value='unchanged';input.onchange=()=>changes++;f.owner.append(input);try{
  input.focus();f.dock.attach(f.owner);assert.equal(f.document.activeElement,input);assert.deepEqual(f.focusCalls.at(-1).options,{preventScroll:true});assert.equal(f.dock.body.firstChild,f.owner);
  f.dock.attach(f.owner);f.dock.refresh();assert.equal(f.moves,1);assert.equal(f.document.activeElement,input);
  f.dock.attach(other);assert.deepEqual([...f.document.getElementById('inspector').children].map(n=>n.id),['before','owner','after']);assert.equal(input.value,'unchanged');assert.equal(f.owner.firstChild,input);input.onchange();assert.equal(changes,1);
  f.dock.attach(f.owner);assert.equal(other.parentNode,null,'originally detached owners remain detached when inactive');assert.equal(f.owner.firstChild,input);assert.equal(input.value,'unchanged');assert.equal(changes,1);
 }finally{f.dock.dispose();}assert.deepEqual([...f.document.getElementById('inspector').children].map(n=>n.id),['before','owner','after']);assert.equal(f.owner.firstChild,input);assert.equal(f.parent.querySelector('.detection-regions-dock'),null);
});
test('collapse is global across active owners and preserves the mounted native panel, history and focused control',()=>{
 const f=fixture(),calls=[],panel=createDetectionRegionsPanel({document:f.document,parent:f.owner,onUndo:()=>calls.push('undo'),onRedo:()=>calls.push('redo')});
 panel.update({zones:[{id:'a',kind:'acquisition'}],canUndo:true,canRedo:false});const undo=panel.element.querySelector('[data-detection-action=undo]'),row=panel.element.querySelector('[data-zone-id=a]'),other=f.document.createElement('div');
 try{
  f.dock.attach(f.owner);row.focus();f.dock.setCollapsed(true);assert.equal(f.dock.body.hidden,true);assert.equal(f.dock.element.hidden,false);assert.equal(f.dock.toggle.getAttribute('aria-expanded'),'false');assert.equal(f.dock.toggle.getAttribute('aria-label'),'Afficher Zones / Biomes');assert.equal(f.document.activeElement,f.dock.toggle);assert.equal(f.owner.parentNode,f.dock.body);assert.equal(panel.element.querySelector('[data-zone-id=a]'),row);assert.equal(undo.disabled,false);assert.deepEqual(calls,[]);
  f.dock.attach(other);assert.equal(f.dock.collapsed,true);assert.equal(f.dock.body.hidden,true);f.dock.attach(f.owner);assert.equal(f.dock.collapsed,true);f.dock.toggle.click();assert.equal(f.dock.collapsed,false);assert.equal(f.dock.body.hidden,false);assert.equal(f.document.activeElement,row);assert.equal(panel.element.querySelector('[data-detection-action=undo]'),undo);undo.click();assert.deepEqual(calls,['undo']);
  row.focus();f.dock.refresh();assert.equal(f.document.activeElement,row);assert.equal(f.moves,3);
 }finally{f.dock.dispose();panel.dispose();}
});
test('language changes only the shared disclosure labels and preserve current mode/history and node identity',()=>{
 const f=fixture(),panel=createDetectionRegionsPanel({document:f.document,parent:f.owner}),group={id:'g',color:[20,100,200],nativeGeometry:true,nativeGroupIndex:0,polygons:[[[1,1],[2,1],[2,2]],[[10,10],[11,10],[11,11]]]};
 try{
  panel.update({biomes:[group],resultIdentity:'one',canRedo:true});f.dock.attach(f.owner);const row=panel.element.querySelector('[data-zone-id=g]');row.focus();f.setLanguage('en');f.dock.translate();assert.equal(f.dock.toggle.getAttribute('aria-label'),'Hide Regions / Biomes');assert.equal(panel.mode,'biomes');assert.equal(panel.element.querySelector('[data-zone-id=g]'),row);assert.equal(f.document.activeElement,row);
  f.dock.setCollapsed(true);f.dock.translate('fr');assert.equal(f.dock.toggle.getAttribute('aria-label'),'Afficher Zones / Biomes');assert.equal(f.dock.body.hidden,true);assert.equal(panel.mode,'biomes');assert.equal(panel.element.querySelector('[data-detection-action=redo]').disabled,false);
 }finally{f.dock.dispose();panel.dispose();}
});
test('unique disclosure controls, invalid nodes and idempotent disposal retain ownership boundaries',()=>{
 const f=fixture(),second=createDock({document:f.document,parent:f.parent,before:f.before,language:'en'});try{
  assert.notEqual(second.body.id,f.dock.body.id);assert.equal(second.toggle.getAttribute('aria-controls'),second.body.id);assert.throws(()=>f.dock.attach(f.parent),{code:'DETECTION_REGIONS_DOCK_INVALID'});assert.throws(()=>f.dock.attach(f.dock.toggle),{code:'DETECTION_REGIONS_DOCK_INVALID'});assert.throws(()=>f.dock.setCollapsed(1),{code:'DETECTION_REGIONS_DOCK_INVALID'});
  f.dock.attach(f.owner);f.dock.dispose();f.dock.dispose();assert.equal(f.owner.parentNode,f.document.getElementById('inspector'));assert.throws(()=>f.dock.attach(f.owner),{code:'DETECTION_REGIONS_DOCK_INVALID'});f.dock.refresh();
 }finally{second.dispose();f.dock.dispose();}
});
