import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCloningDetectionMask} from '../src/cloning-detection-mask.js';
import {sourceRegionBrisk} from '../src/source-region-brisk.js';
import {sourceRegionAkaze} from '../src/source-region-akaze.js';
const domain={sourceWidth:16,sourceHeight:12,fingerprint:'verified'},sha256='b'.repeat(64);
const mask=data=>({sha256,pixels:{width:16,height:12,format:'rgb8',data}});
for(const [name,value]of[
 ['gray8',{...mask(new Uint8Array(192)),pixels:{width:16,height:12,format:'gray8',data:new Uint8Array(192)}}],
 ['shortRGB',mask(new Uint8Array(575))],
 ['Uint16',mask(new Uint16Array(576))],
 ['wrongSHA',{...mask(new Uint8Array(576)),sha256:'short'}],
 ['missingReader',{sha256,surface:{descriptor:{width:16,height:12,format:'rgb8'}}}],
]){
 test(name+' detection mask rejects before any source observation or cache lookup',async()=>{
  assert.throws(()=>assertCloningDetectionMask(value,domain),{code:'INVALID_INPUT'});
  for(const [family,run]of[['brisk',sourceRegionBrisk],['akaze',sourceRegionAkaze]]){
   let touched=0;
   await assert.rejects(run({task:{operation:'tampering.copyMove.'+family,params:{maskImageId:'mask'}},domain,view:{domain,admittedRectangles(){touched++;throw Error('must not read');}},references:[{id:'mask',...value}],budget:{get(){touched++;throw Error('must not borrow cache');}}}),{code:'INVALID_INPUT'});
   assert.equal(touched,0);
  }
 });
}
test('complete native RGB8 mask and bounded native window owner remain valid',()=>{
 assert.doesNotThrow(()=>assertCloningDetectionMask(mask(new Uint8Array(576)),domain));
 assert.doesNotThrow(()=>assertCloningDetectionMask({sha256,surface:{descriptor:{width:16,height:12,format:'rgb8'},readWindow(){}}},domain));
 assert.doesNotThrow(()=>assertCloningDetectionMask(null,domain));
});
