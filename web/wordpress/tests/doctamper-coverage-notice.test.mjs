import test from 'node:test';import assert from 'node:assert/strict';
import {nativeContextEvaluationNotice} from '../sherloq-browser/assets/native-context-evaluation-ui.js';
import {extensionSummary} from '../sherloq-browser/assets/extension-tools.js';
const make=(analysed=786176,selected=786368)=>({operation:'ai.text.doctamper',status:'ok',data:{preprocessing:{native_contexts:true,original_preprocessing_mode:'native-original-JPEG',contexts:[{evaluable:analysed>0}]}},metrics:{analysedPixels:analysed,selectedPixels:selected,sourceRegionEvaluation:analysed===0?'native-not-evaluable':'partially-evaluable'}});
for(const language of ['fr','en'])for(const n of [786176,0])test('DTD has exact pixel coverage without false unanalysed regions '+language+'/'+n,()=>{const out=make(n),rows=extensionSummary(out,language);assert.equal(rows.length,2);assert.equal(nativeContextEvaluationNotice(out,language),null);assert.match(rows[1].text,language==='fr'?/pixels.*sélectionnés/:/selected pixels/);assert.match(rows[1].text,language==='fr'?/score nul/:/not scored zero/);});
test('Incomplete DTD metadata keeps generic warning',()=>{const out=make();delete out.metrics.analysedPixels;assert.ok(nativeContextEvaluationNotice(out));});
test('Unqualified DTD metadata never suppresses native warning',()=>{const out=make();delete out.data.preprocessing.native_contexts;assert.ok(nativeContextEvaluationNotice(out));});
test('Other operation generic warning remains',()=>{const out=make();out.operation='tampering.copyMove.sparse';assert.ok(nativeContextEvaluationNotice(out));});
