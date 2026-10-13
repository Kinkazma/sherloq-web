import test from 'node:test';
import assert from 'node:assert/strict';
import {batchAutomaticThreshold,batchAiRecipe,batchRecipeLabel} from '../sherloq-browser/assets/batch-selection-policy.js';
test('threshold follows the requested integer half with a minimum of one',()=>{
 for(const [n,value]of [[0,1],[1,1],[2,1],[3,1],[4,2],[5,2],[6,3],[7,3],[8,4],[9,4],[10,5]]){
  const recipes=Array.from({length:n},(_,i)=>({kind:'clones',operation:'detector-'+i}));assert.equal(batchAutomaticThreshold(recipes).threshold,value);
 }
});
test('only scientific detectors count; descriptive ELA, contrast, exports and duplicate detector recipes do not',()=>{
 const recipes=[{kind:'clones',operation:'ai.clones.d2prl'},{kind:'map',operation:'m2.trufor'},{kind:'regions',operation:'noise.noisesniffer'},{kind:'ela',operation:'ela.biomes'},{kind:'view',operation:'colors.contrast'},{kind:'required',operation:'noise.prnu'},{kind:'clones',operation:'ai.clones.d2prl'}];
 const result=batchAutomaticThreshold(recipes);assert.equal(result.count,3);assert.equal(result.threshold,1);
});
test('automatic bundle counts its clone detectors once and excludes its descriptive ELA branch',()=>{
 const result=batchAutomaticThreshold([{kind:'automatic',operation:'analysis.complete'},{kind:'clones',operation:'ai.clones.d2prl'},{kind:'clones',operation:'tampering.copyMove.sparse',params:{algorithm:'PatchMatch Zernike'}}]);
 assert.equal(result.count,4);assert.equal(result.threshold,2);
});
test('D2PRL label identifies the effective method and AI classification is independent of suitability',()=>{
 assert.equal(batchRecipeLabel({operation:'ai.clones.d2prl',fr:'Détection de clones par IA'}),'D2PRL');
 assert.equal(batchAiRecipe({operation:'ai.clones.segmentation',group:'recommended'}),true);
 assert.equal(batchAiRecipe({operation:'tampering.copyMove.sparse',params:{algorithm:'EfficientLoFTR'},group:'required'}),true);
 assert.equal(batchAiRecipe({operation:'tampering.copyMove.sparse',params:{algorithm:'SIFT + G2NN + RANSAC'}}),false);
});
