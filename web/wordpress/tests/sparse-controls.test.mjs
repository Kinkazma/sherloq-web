// Exercise the actual adapter against native validators and distance policy.
// No image processing, native model inference, or visual test is performed.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toolCatalog} from '../sherloq-browser/assets/tool-catalog.js';
import {sparseParameters,detectedRectangles,PANELS_SIFT,restoreSparseView,sparseViewDefaults} from '../sherloq-browser/assets/sparse-controls.js';
import {sparseCopyParams,SPARSE_COPY_ALGORITHMS} from '../sherloq-browser/assets/unified-engine/src/sparse-copy.js';
import {copyDistancePolicy,compactCopyAxes} from '../sherloq-browser/assets/unified-engine/src/copy-policy.js';
import {errorText,localizeStatus} from '../sherloq-browser/assets/ui-errors.js';
import {createToolClient} from '../sherloq-browser/assets/tool-client.js';
const defaults=toolCatalog['tampering.copyMove.sparse'].params;
const rectangles=[{x0:10,y0:10,x1:30,y1:40},{x0:100,y0:10,x1:120,y1:40}];
test('Every offered detector accepts restored reflections and automatic radius after normalization',()=>{
 for(const algorithm of SPARSE_COPY_ALGORITHMS){const p=sparseParameters({...defaults,algorithm,reflections:true,autoRadius:true},rectangles);assert.doesNotThrow(()=>sparseCopyParams(p),algorithm);assert.equal(p.reflections,algorithm===PANELS_SIFT);const policy=copyDistancePolicy(p,p.regions);assert.equal(policy.radius,Math.hypot(20,30));}
});
test('Compacting has real distance guides outside comparison; no envelope can fill the gap back in',()=>{
 const detected=detectedRectangles({regions:[{bounds:[10,10,31,41]},{bounds:[100,10,121,41]}],polygons:[[[10,10],[30,10],[30,40],[10,40]],[[100,10],[120,10],[120,40],[100,40]]]});
 assert.equal(detected.length,3);assert.equal(detected[2].envelope,true);
 const p=sparseParameters({...defaults,compact:true},detected);assert.equal(p.regions.length,3);assert.equal(p.guides.length,2);
 let reserved=0;const [axis]=compactCopyAxes(130,50,p.guides,{reserveMemory:n=>reserved+=n});assert.equal(reserved,900);assert.equal(axis[100]-axis[30],1);
 const compared=sparseCopyParams(sparseParameters({...defaults,compact:true,autoRadius:true,compare:true},detected));assert.equal(compared.regions.length,2);assert.deepEqual(compared.guides,[]);assert.deepEqual(copyDistancePolicy(compared,compared.regions).gap,[69,0]);
 assert.deepEqual(detectedRectangles({regions:[]}),[]);
});
test('Errors use the requested language without mutating native evidence or doubling prefixes',()=>{
 const cause=Error('allocation failure'),e=Object.assign(Error('Invalid input: The reflected sparse pass belongs to Panels + Text.'),{code:'INVALID_INPUT',cause});
 assert.match(errorText(e,'fr'),/^Les réflexions nécessitent/);assert.match(errorText(e,'en'),/^Reflections require/);assert.equal(e.cause,cause);assert.match(e.message,/Invalid input/);
 assert.equal(localizeStatus('Error · Arbitrary native failure','en'),'Error · Arbitrary native failure');assert.match(localizeStatus('Erreur · INVALID_INPUT Compare requires two regions.','fr'),/exactement deux zones/);
 assert.equal(localizeStatus('Calcul terminé','fr'),'Calcul terminé');
});
async function transport({full=false,failed=false,cleanupFails=false,unsupported=false}={}){
 const saved=globalThis.fetch;globalThis.fetch=async()=>({json:async()=>({assetBase:'./'})});const calls=[],original=new Blob(['transport only']);const failure=Object.assign(Error('detector refused'),{code:'MEMORY_LIMIT'});
 const client=await createToolClient({engineFactory:()=>({loadBlob:async input=>{calls.push(['load',input]);return {id:input.id,surface:{id:input.id+'-surface',revision:1,width:2,height:2,format:'rgb8'},availableOperations:full||input.layout==='auto'&&!unsupported?['subimages.detect']:[]};},run:async task=>{calls.push(['run',task]);if(task.operation==='subimages.detect'){if(failed)throw failure;return {data:{regions:[]}};}return {surface:{id:'result',revision:1,width:2,height:2,format:'rgb8'}};},releaseSurface:async id=>calls.push(['release',id]),unload:async id=>{calls.push(['unload',id]);if(cleanupFails&&id!=='original')throw Error('cleanup refused');},dispose:async()=>{}})});
 try{
  await client.load({id:'original',blob:original});const previous=await client.run({id:'previous',operation:'file.hex',params:{}});
  if(failed){await assert.rejects(client.detectSubimages(),e=>e===failure);if(cleanupFails)assert.equal(failure.cleanupError.message,'cleanup refused');}else if(unsupported)await assert.rejects(client.detectSubimages(),/SUBIMAGES_MEMORY/);else assert.deepEqual(await client.detectSubimages(),{regions:[]});
  assert.equal(client.result,previous);assert.equal(calls.some(c=>c[0]==='release'),false);
  if(full){assert.equal(calls.filter(c=>c[0]==='load').length,1);assert.equal(calls.some(c=>c[0]==='unload'),false);}
  else{const input=calls.filter(c=>c[0]==='load')[1][1];assert.equal(input.blob,original);assert.equal(input.layout,'auto');assert.equal(calls.at(-1)[0],'unload');assert.equal(calls.at(-1)[1],input.id);}
  if(unsupported)assert.equal(calls.filter(c=>c[0]==='run').length,1);
 }finally{await client.dispose();globalThis.fetch=saved;}
}
test('Subimage detection preserves the result and releases its temporary decoded source',()=>transport());
test('Subimage detection reuses an already compatible source',()=>transport({full:true}));
test('Detection failure and cleanup failure retain the original cause and previous result',()=>transport({failed:true,cleanupFails:true}));
test('Segmented fallback reports an unavailable detector and unloads its temporary source',()=>transport({unsupported:true}));

test('Only the exact legacy initial display migrates; customized and versioned choices survive',()=>{
 const legacy={...sparseViewDefaults(),circles:true,lines:true};assert.deepEqual(restoreSparseView(legacy),sparseViewDefaults());assert.deepEqual(restoreSparseView(legacy,1),legacy);const custom={...legacy,minimum:8};assert.deepEqual(restoreSparseView(custom),custom);
});
