import test from 'node:test';import assert from 'node:assert/strict';
import {validateMediaPreferences,loupeSettingsKey,loupeScale,loupeMinimumZoom,loupeDefaults} from '../sherloq-browser/assets/media-settings.js';
import {validateLoupeEffects,sweepPixels} from '../sherloq-browser/assets/loupe-effects-settings.js';
import {createLoupeEffectsKernel} from '../sherloq-browser/assets/loupe-effects-kernel.js';
import {createLoupeEffectQueue} from '../sherloq-browser/assets/loupe-effects-client.js';
test('R is logical, preserves text/browser shortcuts and new effects survive portable settings',()=>{
 assert.equal(loupeSettingsKey({key:'R',code:'KeyP'}),true);for(const e of [{key:'r',ctrlKey:true},{key:'r',metaKey:true},{key:'r',repeat:true},{key:'r',target:{tagName:'INPUT'}}])assert.equal(loupeSettingsKey(e),false);
 const value=validateMediaPreferences({loupe:{effects:{adjust:{enabled:true,hue:53},enhance:{enabled:true,mode:'contrast'},sweep:{enabled:true,width:17}}}});assert.deepEqual(validateMediaPreferences(JSON.parse(JSON.stringify(value))),value);assert.equal('median' in value.loupe.effects,false);assert.throws(()=>validateLoupeEffects({sweep:{width:0}}));
});
test('Enhanced magnifier always stays one percentage point above fit, including unlocked preferences',()=>{
 for(const unlock of [false,true]){const settings={...loupeDefaults,unlock,zoom:2};assert.equal(loupeMinimumZoom(settings,.39,true),40);assert.equal(loupeScale(settings,.39,true),.4);assert.equal(loupeMinimumZoom(settings,.394,true),40);assert.equal(loupeMinimumZoom(settings,.396,true),41);assert.equal(loupeScale(settings,.39),unlock?.02:.39);assert.equal(loupeScale(settings,50,true),36);}
});
test('level sweep expands the requested interval and mixes opacity without changing input',()=>{
 const image={width:5,height:1,data:Uint8Array.of(0,100,111,112,127,128,143,144,145,200,254,255,20,30,40)};const old=image.data.slice(),r=sweepPixels(image,{position:128,width:32,opacity:100});assert.deepEqual([...r.data.slice(3,9)],[0,120,128,247,255,255]);assert.deepEqual(image.data,old);assert.deepEqual(sweepPixels(image,{position:128,width:32,opacity:0}).data,old);
});
test('bounded local pipeline stacks effects, reuses upstream work and retains alpha',async()=>{
 let adjustments=0,enhancements=0;const process=createLoupeEffectsKernel({adjust:async(image,p)=>{adjustments++;return{...image,data:image.data.map(v=>Math.min(255,v+p.brightness))};},enhance:async image=>{enhancements++;return{...image,data:image.data.map(v=>v*2)};}});
 const frames=Array.from({length:3},()=>({width:3,height:1,data:Uint8ClampedArray.of(0,0,0,0,20,30,40,255,50,60,70,255)})),effects=validateLoupeEffects({adjust:{enabled:true,brightness:10},enhance:{enabled:true}});
 const a=await process({id:'first',frames,effects});assert.deepEqual([...a.frames[0].data],[0,0,0,0,60,80,100,255,120,140,160,255]);assert.equal(a.metrics.sampledPixels,6);
 const b=await process({id:'first',effects:{...effects,sweep:{enabled:true,position:128,width:32,opacity:100}}});assert.equal(adjustments,3);assert.equal(enhancements,3);assert.deepEqual(b.metrics.reused,['adjust','enhance']);assert.deepEqual([...frames[0].data.slice(4,7)],[20,30,40]);
 await assert.rejects(process({id:'wrong',effects}),/expired/);await assert.rejects(process({id:'large',frames:frames.map(f=>({...f,width:1025})),effects}),/Invalid loupe/);
});
test('slider bursts keep only one pending job and reuse worker input for new parameters',async()=>{
 const messages=[];let worker,terminated=0;const queue=createLoupeEffectQueue(()=>worker={postMessage:job=>messages.push(job),terminate(){terminated++;}});const capture=()=>[{data:new Uint8ClampedArray(4)}];
 const a=queue.run('first',{},capture,1),obsolete=queue.run('discard',{},capture,1),latest=queue.run('last',{},capture,1);assert.equal(await obsolete,null);assert.equal(messages.length,1);worker.onmessage({data:{ticket:messages[0].ticket,frames:[]}});await a;assert.equal(messages.length,2);assert.equal(messages[1].id,'last');worker.onmessage({data:{ticket:messages[1].ticket,frames:[]}});await latest;
 const same=queue.run('last',{changed:true},()=>{throw Error('unneeded readback');},1);assert.equal(messages[2].frames,null);worker.onmessage({data:{ticket:messages[2].ticket,frames:[]}});await same;queue.dispose();assert.equal(terminated,1);
});
