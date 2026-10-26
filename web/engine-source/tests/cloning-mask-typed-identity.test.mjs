import test from 'node:test';
import assert from 'node:assert/strict';
import {assertCloningDetectionMask} from '../src/cloning-detection-mask.js';
import {sourceRegionBrisk} from '../src/source-region-brisk.js';
import {sourceRegionAkaze} from '../src/source-region-akaze.js';
const domain={sourceWidth:16,sourceHeight:12,fingerprint:'verified'};
for(const [name,sha256]of[['coercible SHA object',{toString(){return'b'.repeat(64);}}],['BigInt SHA',BigInt('1'.repeat(64))]]){
 test(name+' is not a verified string identity and rejects before source/cache',async()=>{
  const value={sha256,pixels:{width:16,height:12,format:'rgb8',data:new Uint8Array(576)}};
  assert.throws(()=>assertCloningDetectionMask(value,domain),{code:'INVALID_INPUT'});
  for(const [family,run]of[['brisk',sourceRegionBrisk],['akaze',sourceRegionAkaze]]){
   let touched=0;
   await assert.rejects(run({task:{operation:'tampering.copyMove.'+family,params:{maskImageId:'mask'}},domain,view:{domain,admittedRectangles(){touched++;throw Error('must not read');}},references:[{id:'mask',...value}],budget:{get(){touched++;throw Error('must not borrow cache');}}}),{code:'INVALID_INPUT'});
   assert.equal(touched,0);
  }
 });
}
