import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpeningSourcePreview,createSourceOpeningPreviewRelay} from '../sherloq-browser/assets/opening-source-preview.js';
import {createOpeningImagePreview} from '../sherloq-browser/assets/opening-image-preview.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
const frame=()=>({pixels:{format:'rgb8',width:2,height:2,data:new Uint8Array(12)},sourceWidth:10000,sourceHeight:10000,decoder:'same-original-sdr'});
test('managed opening waits for the single Original decode and accepts an early packet once',async()=>{
 const file=new Blob(['AVIF transport']),slot=createOpeningSourcePreview({file}),preview=frame();assert.equal(slot.requested,false);assert.equal(slot.publish(preview),true);assert.equal(slot.publish(frame()),false);assert.equal(await slot.decodePreview(file),preview);assert.equal(slot.requested,true);
});
test('replacement, failure and cancellation settle waiting managed callbacks without any decoder',async()=>{
 const file=new Blob(['raw']);for(const way of ['replacement','failure','abort']){let current=true;const slot=createOpeningSourcePreview({file,isCurrent:()=>current}),controller=new AbortController(),waiting=slot.decodePreview(file,{signal:controller.signal});
  if(way==='replacement'){current=false;slot.fail();assert.equal(slot.publish(frame()),false);}else if(way==='failure')slot.fail(Object.assign(Error('Failed Original'),{code:'DECODE_FAILED'}));else controller.abort();
  await assert.rejects(waiting,error=>error.code===(way==='failure'?'DECODE_FAILED':'CANCELLED'));
 }
});
test('the actual preview owner retires a waiting AVIF callback without a second native decode',async()=>{
 const file=new Blob(['managed source']),slot=createOpeningSourcePreview({file});let natives=0;const owner=createOpeningImagePreview({file,document:{createElement(){throw Error('No pixels have arrived');}},imageDecoderClass:null,imageBitmapFactory:async()=>{natives++;throw Error('AVIF must use the Original');},decodePreview:slot.decodePreview});await tick();assert.equal(slot.requested,true);slot.fail();await owner.dispose();assert.equal(await owner.ready,false);assert.equal(natives,0);
});
test('source packets use the active file identity and never enter status progress',()=>{
 const seen=[];let revision=1;const relay=createSourceOpeningPreviewRelay({publish:(preview,owner)=>(seen.push({preview,owner}),true),isCurrent:owner=>owner.revision===revision}),file=new Blob(['raw']),first=relay.begin({file,imageId:'a',revision}),preview=frame();
 assert.equal(relay.progress({phase:'decode',id:'a'}),false);assert.equal(relay.progress({phase:'source-preview',id:'older',preview}),true);assert.equal(seen.length,0);assert.equal(relay.progress({phase:'source-preview',id:'a',preview}),true);assert.equal(seen.length,1);assert.equal(seen[0].owner.file,file);assert.equal(relay.progress({phase:'source-preview',id:'a',preview}),true);assert.equal(seen.length,1);
 revision=2;const next=relay.begin({file,imageId:'b',revision});relay.clear(first);relay.progress({phase:'source-preview',id:'a',preview});assert.equal(seen.length,1);relay.progress({phase:'source-preview',id:'b',preview});assert.equal(seen.length,2);relay.clear(next);
});
test('fallback is a bounded read of the existing 100MP surface, once, without decoding',async()=>{
 const calls=[],seen=[],relay=createSourceOpeningPreviewRelay({publish:preview=>(seen.push(preview),true)}),owner=relay.begin({imageId:'one'}),display={id:'already-decoded',width:10000,height:10000},gate=defer(),readDisplay=async payload=>{calls.push(payload);await gate.promise;return{pixels:{width:2000,height:2000,format:'rgb8',data:new Uint8Array(12_000_000)}};};
 const a=relay.fallback(owner,{display,readDisplay}),b=relay.fallback(owner,{display,readDisplay});assert.equal(a,b);assert.equal(calls.length,1);assert.deepEqual(calls[0],{display,tile:{x:0,y:0,w:10000,h:10000,step:5}});gate.resolve();assert.equal(await a,true);assert.equal(seen.length,1);assert.equal(seen[0].decoder,'shared-original-display');assert.equal(seen[0].pixels.width*seen[0].pixels.height,4_000_000);assert.equal(await relay.fallback(owner,{display,readDisplay}),false);assert.equal(calls.length,1);
});
test('an early decoder packet avoids fallback and a late old fallback cannot replace a newer source',async()=>{
 const seen=[],relay=createSourceOpeningPreviewRelay({publish:preview=>(seen.push(preview),true)}),display={width:2,height:2},first=relay.begin({imageId:'first'});relay.progress({phase:'source-preview',id:'first',preview:frame()});let reads=0;assert.equal(await relay.fallback(first,{display,readDisplay:async()=>{reads++;}}),false);assert.equal(reads,0);
 const old=relay.begin({imageId:'old'}),gate=defer(),flight=relay.fallback(old,{display,readDisplay:async()=>{await gate.promise;return frame();}});relay.begin({imageId:'new'});gate.resolve();assert.equal(await flight,false);assert.equal(seen.length,1);
});
