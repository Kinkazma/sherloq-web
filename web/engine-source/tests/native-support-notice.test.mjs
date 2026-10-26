import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSupportNotice} from '../../wordpress/sherloq-browser/assets/native-support-notice.js';
const support={requiredCandidates:40,availableCandidates:12,calculationPerformed:false,negativeModelObservation:false};
const result=status=>({status,notice:{code:'NATIVE_SUPPORT_INSUFFICIENT',windows:[support]}});
test('A prerequisite failure states native40/N and no calculation in French and English',()=>{
 assert.match(nativeSupportNotice(result('insufficient-support'),'fr'),/12\/40.*aucun calcul/);
 assert.match(nativeSupportNotice(result('insufficient-support'),'en'),/12\/40.*no calculation/);
});
test('Mixed completed windows retain an explicit partial status',()=>{
 assert.match(nativeSupportNotice(result('partial'),'fr'),/^Résultats partiels/);
 assert.match(nativeSupportNotice(result('partial'),'en'),/^Partial results/);
 assert.equal(nativeSupportNotice(result('ok'),'fr'),null);
});
test('A direct product response can retain its no-calculation metadata without invented fields',()=>{
 const output={status:'insufficient-support',data:{metadata:{nativeSupport:support}}};
 assert.match(nativeSupportNotice(output),/aucun calcul/);assert.equal(output.surface,undefined);assert.equal(output.data.probability,undefined);
});
test('Calculated negatives and malformed support cannot be relabelled as no calculation',()=>{
 for(const change of [{calculationPerformed:true},{negativeModelObservation:true},{availableCandidates:40},{availableCandidates:-1}]){
  const output=result('insufficient-support');output.notice.windows=[{...support,...change}];assert.equal(nativeSupportNotice(output),null);
 }
});
