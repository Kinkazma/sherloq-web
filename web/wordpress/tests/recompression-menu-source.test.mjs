import test from 'node:test';
import assert from 'node:assert/strict';
import {VALIDATED_RECOMPRESSION_CHOICES,recompressionChoices,recompressionMenuValue,recompressionChoice,recompressionFromChoice,elaSourceCompressionSupported} from '../sherloq-browser/assets/recompression-controls.js';

test('a known source family has one named row with the source annotation',()=>{
 for(const sourceFormat of VALIDATED_RECOMPRESSION_CHOICES)for(const language of ['fr','en']){
  const choices=recompressionChoices({sourceFormat,language});
  assert.equal(choices.length,VALIDATED_RECOMPRESSION_CHOICES.length);
  assert.equal(choices.some(c=>c.value==='source'),false);
  const same=choices.find(c=>c.value===sourceFormat);
  assert.match(same.label,language==='fr'?/\(format source\)$/:/\(source format\)$/);
  assert.equal(same.mismatch,false);
  for(const c of choices)assert.equal(c.label.startsWith('⚠️ '),c.value!==sourceFormat);
 }
});
test('saved dynamic source recipes select that row without mutating the recipe',()=>{
 const recipe={codec:'source',lossless:false,paletteColors:191},before=JSON.stringify(recipe);
 assert.equal(recompressionMenuValue(recompressionChoice(recipe),'image/png'),'png');
 assert.equal(JSON.stringify(recipe),before);
 assert.equal(recompressionMenuValue('source','HEIF'),'heic');
 assert.equal(recompressionMenuValue('source','J2K'),'jp2');
 assert.equal(recompressionMenuValue('jpeg','png'),'jpeg');
 assert.equal(recompressionMenuValue('source',undefined),'source');
});
test('unknown sources and unavailable source formats do not create an active retired codec',()=>{
 assert.equal(recompressionChoices().find(c=>c.value==='source').disabled,undefined);
 for(const sourceFormat of ['bmp','qoi','tiff']){
  const choices=recompressionChoices({sourceFormat}),source=choices.find(c=>c.value==='source');
  assert.equal(source.disabled,true);assert.match(source.label,/format source/);
  assert.equal(elaSourceCompressionSupported(sourceFormat),false);
  assert.equal(choices.some(c=>c.value===sourceFormat),false);
  for(const c of choices.filter(c=>!c.disabled)){
   assert.equal(c.mismatch,true);
   assert.equal(recompressionFromChoice(c.value).lossless,false);
  }
 }
 assert.equal(elaSourceCompressionSupported('HEIF'),true);
 assert.equal(elaSourceCompressionSupported(undefined),true);
});
