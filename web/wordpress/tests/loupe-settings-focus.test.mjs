import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountMediaControls} from '../sherloq-browser/assets/media-controls.js';
import {loupeSettingsKey,validateMediaPreferences} from '../sherloq-browser/assets/media-settings.js';

function setup(){
 const {document,window}=parseHTML('<html><body><button id="image-anchor">Image</button><details id="settings-menu"><div><hr></div></details></body></html>');
 const selectValue=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value'),inputValidity=window.HTMLInputElement.prototype.checkValidity,focusDescriptor=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,'focus');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(option=>option.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
 window.HTMLInputElement.prototype.checkValidity=function(){return Number.isFinite(Number(this.value));};
 let focused=document.body,preferences=validateMediaPreferences({loupe:{enabled:true}}),ui;
 const focusCalls=[],panelStates=[];
 Object.defineProperty(document,'activeElement',{configurable:true,get:()=>focused});
 Object.defineProperty(window.HTMLElement.prototype,'focus',{configurable:true,writable:true,value:function(options){focused=this;focusCalls.push({element:this,options});}});
 ui=mountMediaControls(document,{language:()=> 'fr',getPreferences:()=>preferences,setPreferences:value=>{preferences=validateMediaPreferences(value);ui?.sync();},onLoupePanel:value=>{panelStates.push(value);return{x:100,y:100};}});
 const dialog=document.getElementById('loupe-dialog'),anchor=document.getElementById('image-anchor');
 // Native dialog.show() focuses its first focusable control. The shipped
 // magnifier starts with its context SELECT, which intentionally rejects R.
 dialog.show=()=>{dialog.setAttribute('open','');dialog.querySelector('button,input,select,textarea')?.focus();};
 dialog.showModal=()=>{throw Error('The magnifier settings must remain non-modal.');};
 dialog.close=()=>dialog.removeAttribute('open');
 const route=event=>{if(event.defaultPrevented||document.querySelector('dialog[open]:not(#loupe-dialog)'))return;if(loupeSettingsKey(event)){event.preventDefault();ui.toggleLoupe();}};
 document.addEventListener('keydown',route);
 const key=(value='r',options={})=>{const event=new window.Event('keydown',{bubbles:true,cancelable:true});Object.assign(event,{key:value,...options});(focused??document).dispatchEvent(event);return event;};
 anchor.focus();
 return{document,window,dialog,anchor,ui,key,panelStates,focusCalls,get focused(){return focused;},setFocused(value){focused=value;},close(){ui.dispose();document.removeEventListener('keydown',route);if(selectValue)Object.defineProperty(window.HTMLSelectElement.prototype,'value',selectValue);else delete window.HTMLSelectElement.prototype.value;window.HTMLInputElement.prototype.checkValidity=inputValidity;if(focusDescriptor)Object.defineProperty(window.HTMLElement.prototype,'focus',focusDescriptor);else delete window.HTMLElement.prototype.focus;}};
}

test('R opens and closes magnifier settings repeatedly without clicking or focusing the image again',()=>{
 const h=setup();try{
  for(let cycle=0;cycle<4;cycle++){
   assert.equal(h.key(cycle%2?'R':'r').defaultPrevented,true);
   assert.equal(h.ui.loupeOpen(),true);
   assert.ok(h.focused===h.dialog.querySelector('[data-action="shortcut"]'),'Opening owns a non-editing keyboard target instead of the automatic SELECT.');
   assert.equal(h.key().defaultPrevented,true);
   assert.equal(h.ui.loupeOpen(),false);
   assert.ok(h.focused===h.anchor,'Closing restores the preceding image keyboard context.');
  }
  assert.deepEqual(h.panelStates,[true,false,true,false,true,false,true,false]);
 }finally{h.close();}
});

test('Text, numeric, select and editable fields keep R and browser shortcuts while settings are open',()=>{
 const h=setup();try{
  h.key();
  for(const field of [h.dialog.querySelector('[data-loupe-context]'),h.dialog.querySelector('[data-loupe-number="zoom"]'),h.document.createElement('textarea'),h.document.createElement('input'),h.document.createElement('div')]){
   if(field.tagName==='DIV')field.setAttribute('contenteditable','true');
   if(!field.isConnected)h.dialog.append(field);field.focus();
   assert.equal(h.key().defaultPrevented,false);assert.equal(h.ui.loupeOpen(),true);
  }
  h.dialog.querySelector('[data-action="shortcut"]').focus();
  for(const options of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true},{repeat:true}]){assert.equal(h.key('r',options).defaultPrevented,false);assert.equal(h.ui.loupeOpen(),true);}
  h.key();assert.equal(h.ui.loupeOpen(),false);assert.ok(h.focused===h.anchor);
 }finally{h.close();}
});

test('Closing a non-modal magnifier does not steal focus moved to another control',()=>{
 const h=setup();try{
  h.key();const outside=h.document.createElement('input');h.document.body.append(outside);outside.focus();
  h.ui.closeLoupe();assert.equal(h.ui.loupeOpen(),false);assert.ok(h.focused===outside);
 }finally{h.close();}
});

test('Settings preserve a shadow-root image keyboard owner across repeated R toggles',()=>{
 const h=setup();try{
  const host=h.document.createElement('div');h.document.body.append(host);const shadow=host.attachShadow({mode:'open'}),image=h.document.createElement('button');image.textContent='Image in analysis panel';shadow.append(image);let inner=null,count=0;
  Object.defineProperty(shadow,'activeElement',{configurable:true,get:()=>inner});image.focus=()=>{inner=image;count++;h.setFocused(host);};image.focus();
  h.key();assert.equal(h.ui.loupeOpen(),true);h.key();assert.equal(h.ui.loupeOpen(),false);assert.ok(h.focused===host);assert.ok(shadow.activeElement===image);assert.equal(count,2,'The deep image focus owner is restored, not just its host.');
 }finally{h.close();}
});

test('A removed image focus owner is not focused again during closure',()=>{
 const h=setup();try{
  h.key();h.anchor.remove();const before=h.focusCalls.length;h.ui.closeLoupe();assert.equal(h.ui.loupeOpen(),false);assert.equal(h.focusCalls.length,before);
 }finally{h.close();}
});

test('Other modal dialogs keep their keyboard scope and do not open magnifier settings',()=>{
 const h=setup();try{
  const modal=h.document.createElement('dialog');modal.id='batch-dialog';modal.setAttribute('open','');const action=h.document.createElement('button');modal.append(action);h.document.body.append(modal);action.focus();
  assert.equal(h.key().defaultPrevented,false);assert.equal(h.ui.loupeOpen(),false);assert.ok(h.focused===action);
 }finally{h.close();}
});

test('Placement magnifier R toggles keep the enclosing editor focused without another pointer click',()=>{
 const h=setup();try{
  const parent=h.document.createElement('dialog');parent.id='placement-editor';parent.setAttribute('open','');const image=h.document.createElement('button');image.textContent='Placement image';parent.append(image);h.document.body.append(parent);
  const pinned=[],controller={enabled:true,pin:value=>pinned.push(value),anchor:()=>({x:100,y:100}),refresh(){}};
  parent.addEventListener('keydown',event=>{if(loupeSettingsKey(event)){event.preventDefault();h.ui.openPlacementLoupe({parent,controller});}});image.focus();
  for(let cycle=0;cycle<3;cycle++){
   assert.equal(h.key().defaultPrevented,true);assert.equal(h.ui.loupeOpen(),true);assert.ok(h.dialog.parentNode===parent);assert.ok(h.focused===h.dialog.querySelector('[data-action="shortcut"]'));
   assert.equal(h.key().defaultPrevented,true);assert.equal(h.ui.loupeOpen(),false);assert.ok(h.focused===image);
  }
  assert.deepEqual(pinned,[true,false,true,false,true,false]);
 }finally{h.close();}
});
