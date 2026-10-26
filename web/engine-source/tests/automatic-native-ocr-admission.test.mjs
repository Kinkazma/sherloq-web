import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/automatic-complete-fixture.mjs';
const poly=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]];
import {createStrictPanelsPreparation} from '../src/sparse-panels-strict-preparation.js';
test('private OCR launch review and product native English route are separate; no seal or text.complete is fabricated',async()=>{
 const f=await fixture({hole:null}),params={algorithm:'SIFT + G2NN + RANSAC + Panels + Text',regions:[poly(0,0,192,96)]},language={data:Uint8Array.of(0),sha256:'b'.repeat(64)},calls=[];
 const textEngine={async detect(image,{language:actual}){assert.strictEqual(actual,language);calls.push([image.width,image.height]);return{boxes:[],metadata:{controlledNativeTextBoundary:true},release(){}};}},hooks={language,nativeWindowContext:{sourceDomain:f.domain,source:f.image.surface}},privatePrep=createStrictPanelsPreparation(f.budget,{maxWorkers:10},{textEngine}),productPrep=createStrictPanelsPreparation(f.budget,{maxWorkers:10},{textEngine,nativeProductOcr:true});let receipt;
 try{await assert.rejects(privatePrep.prepare({sha256:f.image.sha256},params,hooks),e=>e.code==='REVIEW_REQUIRED');assert.equal(calls.length,0);receipt=await productPrep.prepare({sha256:f.image.sha256},params,hooks);assert.equal(calls.length,1);assert.equal(receipt.preprocessing.text_engine,'Tesseract / eng / PSM 11');assert.equal(receipt.preprocessing.strictUpstream.qualification,'native-product-Tesseract');assert.equal(receipt.preprocessing.scientific_scope,undefined);await receipt.release();receipt=null;}finally{await receipt?.release();await privatePrep.dispose();await productPrep.dispose();assert.equal(f.budget.total(),0);}
});
