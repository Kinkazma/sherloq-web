import test from 'node:test';
import assert from 'node:assert/strict';
import {gradientFieldHeadroom} from '../src/gradient-field.js';
import {externalPreviewParallelHeadroom} from '../src/external-preview-parallel-admission.js';
import {externalPreviewScopedGradientHeadroom} from '../src/external-preview-admission.js';
import {FIELD_METHODS} from '../src/gradient-field-parameters.js';

const image={surface:{descriptor:{width:96,height:72}}};
const domain={width:96,height:72,countIncluded:6912};
for(const params of [{method:'bad'},{method:'scharr',kernelSize:5},{method:'farid',sampleStep:NaN},{method:'gaussian',sigma:Infinity},{method:'sobel',view:'bad'}]){
 test('Invalid field request never receives an admissible preview budget: '+JSON.stringify(params),()=>{
  assert.equal(gradientFieldHeadroom(96,72,params),null);
  assert.equal(externalPreviewParallelHeadroom('detail.gradient',image,params),null);
  assert.equal(externalPreviewScopedGradientHeadroom('detail.gradient',domain,{params}),null);
 });
}
test('All field methods and views receive finite positive budgets without mutating the request',()=>{
 for(const method of FIELD_METHODS)for(const view of ['native','angle','coherence']){
  const params={method,view},before=structuredClone(params);
  const result=gradientFieldHeadroom(96,72,params);
  assert.ok(Number.isSafeInteger(result?.bytes)&&result.bytes>96*72*3,method+'/'+view);
  assert.deepEqual(params,before);
 }
});
test('Invalid dimensions, metadata sizes and overflow cannot produce an admissible field budget',()=>{
 for(const [w,h]of [[NaN,72],[96,Infinity],[0,72],[96,-1],[1.5,72],[Number.MAX_SAFE_INTEGER,72]])assert.equal(gradientFieldHeadroom(w,h,{method:'scharr'}),null);
 for(const options of [{runtimeBytes:NaN},{runtimeBytes:-1},{transportBytes:Infinity},{transportBytes:0.5}])assert.equal(gradientFieldHeadroom(96,72,{method:'scharr'},options),null);
});
test('Additional presentation metadata does not retire an otherwise valid field preview',()=>{
 const plain={method:'scharr',view:'coherence'};
 const decorated={...plain,equalization:{method:'clahe'},sourceContext:{native:true}};
 assert.deepEqual(gradientFieldHeadroom(96,72,decorated),gradientFieldHeadroom(96,72,plain));
 for(const input of [null,[],1,'scharr'])assert.equal(gradientFieldHeadroom(96,72,input),null);
});
