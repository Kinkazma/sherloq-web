import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneEvidence,evidenceContext} from '../sherloq-browser/assets/batch-evidence.js';
import {readFile} from 'node:fs/promises';
import {Budget} from '../../engine-source/src/cache.js';
import {createCloneCorroboration} from '../../engine-source/src/clone-corroboration.js';

test('SSG batch evidence uses exact localized pixels, preserves holes and does not invent biome hull coverage',async()=>{
 const width=12,height=8,mask=new Uint8Array(width*height);
 for(const [x,y]of [[1,1],[2,1],[1,2],[2,2],[8,5],[9,5],[10,5],[8,6],[10,6]])mask[y*width+x]=1;
 const budget=new Budget(256*1024**2),composer=createCloneCorroboration({budget,wasmBinary:await readFile(new URL('../../engine-source/vendor/composition/composition.wasm',import.meta.url))}),context={budget,dispose(){composer.dispose();}};
 const output={operation:'tampering.copyMove.sparse',data:{width,height,mask,params:{algorithm:'SSG'},metadata:{completeDetector:true,scientificDefinitions:{localization:'known sparse fixture'}},points:Float64Array.of(0,0,1,0,0,0,0,11,7,1,0,0,0,0),pairs:Float64Array.of(0,1,1,13),groups:[Uint32Array.of(0)]}},recipe={operation:output.operation,kind:'clones',params:{algorithm:'SSG'}};let evidence;
 try{
  evidence=await cloneEvidence(output,recipe,{}, {width,height},context);
  assert.equal(evidence.entries.length,2);const reconstructed=new Uint8Array(mask.length);
  for(const entry of evidence.entries){assert.equal(entry.methodKey,'SSG');assert.equal(entry.label,'SSG');assert.deepEqual(entry.provenance.original_shape,[height,width]);assert.equal(Object.hasOwn(entry.provenance,'native_grid'),false);const [left,top]=entry.origin,m=entry.pixel_mask;for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)reconstructed[(top+y)*width+left+x]=m.data[y*m.width+x];}
  assert.deepEqual(reconstructed,mask);assert.equal(reconstructed[6*width+9],0,'Localized hole is not filled by a hull');
  const counts=await composer.counts({entries:evidence.entries,width,height});try{assert.equal(Math.max(...counts.values),1,'All SSG components contribute one method vote');}finally{counts.release();}
 }finally{evidence?.release();context.dispose();}
 assert.equal(context.budget.total(),0);
});
test('A partial SSG core or a mask from a different image cannot count as full-detector evidence',async()=>{
 const context=evidenceContext(),recipe={operation:'tampering.copyMove.sparse',kind:'clones',params:{algorithm:'SSG'}};
 try{for(const data of [{metadata:{completeDetector:false}},{metadata:{completeDetector:true},params:{algorithm:'SSG'},width:4,height:4,mask:new Uint8Array(16)}])await assert.rejects(cloneEvidence({data},recipe,{}, {width:12,height:8},context),{code:'BATCH_EVIDENCE_INVALID'});}finally{context.dispose();}
 assert.equal(context.budget.total(),0);
});
