import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createOriginalSourceRegionsController} from '../sherloq-browser/assets/original-source-regions-controller.js';

function mount({detectFactory=async()=>[],presentation='toolbar'}={}){
 const {document}=parseHTML('<html><body><section></section></body></html>');
 const parent=document.querySelector('section'),events=[];
 const controller=createOriginalSourceRegionsController({document,parent,presentation,source:()=>({blob:new Blob(['same image']),id:'same-owner',name:'fixture.png',sourceSha256:'a'.repeat(64),width:12,height:10}),onChange:(snapshot,event)=>events.push({snapshot,event}),detectFactory});
 return {controller,events,checkbox:parent.querySelector('[data-original-regions="texts"]')};
}
const uncheck=h=>{h.checkbox.checked=false;h.checkbox.onchange();};

test('Original session options carry the unchecked OCR choice into a fresh detection owner',async()=>{
 let seen;
 const a=mount(),b=mount({detectFactory:async(input,options)=>{seen=options.excludeTexts;return[];}});
 try{
  await Promise.all([a.controller.ready,b.controller.ready]);uncheck(a);
  const value=JSON.parse(JSON.stringify(a.controller.serializeOptions()));
  assert.deepEqual(value,{schema:'sherloq.original-region-options/1',excludeTexts:false});
  const before=b.controller.snapshot();b.controller.restoreOptions(value);
  assert.equal(b.checkbox.checked,false);assert.equal(b.controller.snapshot(),before,'UI preference must not revise scientific zones');
  await b.controller.detect();assert.equal(seen,false,'The actual detector receives the restored option');
 }finally{await Promise.all([a.controller.dispose(),b.controller.dispose()]);}
});

test('legacy sessions without options preserve the current choice and default true in a fresh owner',async()=>{
 const a=mount(),b=mount();try{
  await Promise.all([a.controller.ready,b.controller.ready]);uncheck(a);
  a.controller.restoreOptions(undefined);b.controller.restoreOptions(undefined);
  assert.equal(a.controller.serializeOptions().excludeTexts,false);assert.equal(b.controller.serializeOptions().excludeTexts,true);
 }finally{await Promise.all([a.controller.dispose(),b.controller.dispose()]);}
});

test('malformed options are rejected without changing preference, zones or publishing an edit',async()=>{
 const h=mount();try{
  await h.controller.ready;uncheck(h);assert.equal(typeof h.controller.restoreOptions,'function');const before=h.controller.snapshot(),count=h.events.length;
  for(const value of [null,{},false,{schema:'unknown',excludeTexts:false},{schema:'sherloq.original-region-options/1',excludeTexts:0},{schema:'sherloq.original-region-options/1',excludeTexts:'false'}]){
   assert.throws(()=>h.controller.restoreOptions(value),TypeError);assert.equal(h.checkbox.checked,false);assert.equal(h.controller.snapshot(),before);assert.equal(h.events.length,count);
  }
 }finally{await h.controller.dispose();}
});

test('serialized UI options are immutable and independently owned by Original instances',async()=>{
 const a=mount(),b=mount({presentation:'panel'});try{
  await Promise.all([a.controller.ready,b.controller.ready]);uncheck(a);const option=a.controller.serializeOptions();
  assert.ok(Object.isFrozen(option));assert.throws(()=>{option.excludeTexts=true;},TypeError);
  assert.equal(b.checkbox.checked,true);b.controller.restoreOptions(option);assert.equal(b.checkbox.checked,false);
  a.controller.restoreOptions({schema:option.schema,excludeTexts:true});assert.equal(b.checkbox.checked,false);
 }finally{await Promise.all([a.controller.dispose(),b.controller.dispose()]);}
});

test('restoring a different detector option cancels an in-flight proposal without publishing stale zones',async()=>{
 let release,signal;const gate=new Promise(resolve=>release=resolve);
 const h=mount({detectFactory:async(input,options)=>{signal=options.signal;await gate;return[{id:'late',kind:'acquisition',x0:0,y0:0,x1:5,y1:5}];}});
 try{
  await h.controller.ready;const before=h.controller.snapshot(),task=h.controller.detect();
  while(!signal)await new Promise(resolve=>setImmediate(resolve));
  h.controller.restoreOptions({schema:'sherloq.original-region-options/1',excludeTexts:false});
  assert.equal(signal.aborted,true);release();await assert.rejects(task);assert.equal(h.controller.snapshot(),before);assert.equal(h.checkbox.checked,false);
 }finally{release();await h.controller.dispose();}
});

test('a disposed Original cannot adopt restored UI options',async()=>{
 const h=mount();await h.controller.ready;await h.controller.dispose();
 assert.equal(h.controller.serializeOptions(),null);
 assert.throws(()=>h.controller.restoreOptions({schema:'sherloq.original-region-options/1',excludeTexts:false}),{code:'CANCELLED'});
});

test('restoration before initial source preparation completes keeps the chosen option',async()=>{
 const h=mount();try{
  h.controller.restoreOptions({schema:'sherloq.original-region-options/1',excludeTexts:false});
  await h.controller.ready;assert.equal(h.checkbox.checked,false);assert.equal(h.controller.serializeOptions().excludeTexts,false);
  assert.equal(h.controller.snapshot().sourceSha256,'a'.repeat(64));
 }finally{await h.controller.dispose();}
});

test('restoring the same choice or rejecting an invalid payload does not cancel a valid proposal',async()=>{
 let release,signal;const gate=new Promise(resolve=>release=resolve);
 const h=mount({detectFactory:async(input,options)=>{signal=options.signal;await gate;return[{id:'new',kind:'acquisition',x0:1,y0:1,x1:5,y1:5}];}});
 try{
  await h.controller.ready;const task=h.controller.detect();while(!signal)await new Promise(resolve=>setImmediate(resolve));
  h.controller.restoreOptions({schema:'sherloq.original-region-options/1',excludeTexts:true});
  assert.throws(()=>h.controller.restoreOptions({schema:'sherloq.original-region-options/1',excludeTexts:1}),/Invalid original source detection options/);
  assert.equal(signal.aborted,false);release();await task;assert.equal(h.controller.snapshot().zones[0].id,'new');
 }finally{release();await h.controller.dispose();}
});

test('changing a UI preference does not add a scientific zone undo step',async()=>{
 const h=mount();try{
  await h.controller.ready;const whole=h.controller.snapshot();
  const chosen={...whole,enabled:true,positiveMode:'selected',zones:[{id:'a',kind:'acquisition',enabled:true,x0:1,y0:1,x1:5,y1:5,polygon:[[1,1],[5,1],[5,5],[1,5]]}]};
  // Use the real editing path so the scientific fingerprint is recomputed.
  let detected;const owner=mount({detectFactory:async()=>chosen.zones});
  try{await owner.controller.ready;await owner.controller.detect();detected=owner.controller.snapshot();uncheck(owner);await owner.controller.undo();assert.equal(owner.controller.snapshot().zones.length,0);assert.equal(owner.checkbox.checked,false);await owner.controller.redo();assert.equal(owner.controller.snapshot().fingerprint,detected.fingerprint);assert.equal(owner.checkbox.checked,false);}finally{await owner.controller.dispose();}
 }finally{await h.controller.dispose();}
});
