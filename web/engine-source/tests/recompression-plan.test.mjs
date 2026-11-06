import test from 'node:test';import assert from 'node:assert/strict';
import {validateRecompressionOptions,resolveRecompressionPlan,RECOMPRESSION_FORMATS,recompressionSourceSignature,usesAlternateRecompression,recompressionPaletteColors} from '../src/recompression-plan.js';
test('recompression options are one pass, strict, optional and registry driven',async()=>{
 assert.equal(validateRecompressionOptions(undefined),undefined);assert.equal(usesAlternateRecompression({}),false);assert.equal(usesAlternateRecompression({recompression:{codec:'png',lossless:true}}),true);assert(RECOMPRESSION_FORMATS.length>=19);
 assert.throws(()=>validateRecompressionOptions({codec:'jpeg',lossless:true}));assert.throws(()=>validateRecompressionOptions({codec:'webp',lossless:false,quality:0}));assert.throws(()=>validateRecompressionOptions({codec:'webp',lossless:false,secondary:{codec:'jpeg'}}));
 const plan=await resolveRecompressionPlan({quality:91,recompression:{codec:'webp',lossless:false,quality:23}},{provenance:{format:'png'}});assert.equal(plan.stage.quality,91);assert.equal(plan.stage.codec,'webp');
 const other=await resolveRecompressionPlan({recompression:{codec:'webp',lossless:false,quality:23}},{provenance:{format:'png'}});assert.equal(other.stage.quality,23);assert.notEqual(plan.identity,other.identity);
 const palette=await resolveRecompressionPlan({recompression:{codec:'png',lossless:false}},{provenance:{format:'png'}});assert.equal(palette.stage.lossless,false);assert.equal(palette.stage.quality,null);assert.equal(palette.stage.requestedQuality,75);assert.equal(palette.stage.paletteColors,recompressionPaletteColors(75));
});
test('direct palette counts190 and191 remain exact, with distinct plan identities independent of quality rounding',async()=>{
 for(const codec of ['png','bmp','source']){
  const first=await resolveRecompressionPlan({quality:75,recompression:{codec,lossless:false,paletteColors:190}},{provenance:{format:'png'}}),second=await resolveRecompressionPlan({quality:75,recompression:{codec,lossless:false,paletteColors:191}},{provenance:{format:'png'}});
  assert.equal(first.stage.paletteColors,190);assert.equal(second.stage.paletteColors,191);assert.equal(first.stage.quality,null);assert.equal(first.stage.requestedQuality,75);assert.notEqual(first.identity,second.identity);
 }
 for(const paletteColors of [1,257,190.5])assert.throws(()=>validateRecompressionOptions({codec:'png',lossless:false,paletteColors}));
 assert.throws(()=>validateRecompressionOptions({codec:'png',lossless:true,paletteColors:190}));assert.throws(()=>validateRecompressionOptions({codec:'webp',lossless:false,paletteColors:190}));
 await assert.rejects(resolveRecompressionPlan({recompression:{codec:'source',lossless:false,paletteColors:190}},{provenance:{format:'jpeg'}}));
});
test('source selects the actual codec family and preserves detected mode as provenance while honoring the requested mode',async()=>{
 const bytes=Uint8Array.from([82,73,70,70,13,0,0,0,87,69,66,80,86,80,56,76,1,0,0,0,0]);assert.deepEqual(recompressionSourceSignature(bytes),{format:'webp',lossless:true});
 const p=await resolveRecompressionPlan({recompression:{codec:'source',lossless:false}},{bytes,provenance:{format:'jpeg'},sourceFile:{name:'misleading.jpg'}});assert.equal(p.stage.codec,'webp');assert.equal(p.stage.lossless,false);assert.equal(p.sourceMode,'lossless');
 const avif=await resolveRecompressionPlan({recompression:{codec:'source',lossless:true}},{provenance:{format:'avif'}});assert.equal(avif.sourceMode,'unknown');assert.equal(avif.stage.lossless,true);
 await assert.rejects(resolveRecompressionPlan({recompression:{codec:'source',lossless:false}},{provenance:{format:'camera-raw'}}),{code:'UNSUPPORTED_FORMAT'});
});
test('PNG and BMP palette quality maps explicitly from two through256 colors without changing source provenance',async()=>{
 assert.equal(recompressionPaletteColors(1),2);assert.equal(recompressionPaletteColors(100),256);assert.throws(()=>recompressionPaletteColors(0));assert.throws(()=>recompressionPaletteColors(101));
 let prior=1;for(let q=1;q<=100;q++){const colors=recompressionPaletteColors(q);assert(colors>prior);prior=colors;}
 for(const codec of ['png','bmp']){
  const bytes=codec==='png'?Uint8Array.of(137,80,78,71,13,10,26,10):Uint8Array.of(66,77);
  const lossy=await resolveRecompressionPlan({quality:1,recompression:{codec:'source',lossless:false}},{bytes});assert.equal(lossy.stage.codec,codec);assert.equal(lossy.stage.lossless,false);assert.equal(lossy.stage.qualityKind,'palette-colors');assert.equal(lossy.stage.paletteColors,2);assert.equal(lossy.sourceMode,'lossless');
  const exact=await resolveRecompressionPlan({quality:100,recompression:{codec:'source',lossless:true}},{bytes});assert.equal(exact.stage.lossless,true);assert.equal(exact.stage.quality,null);assert.equal(exact.stage.paletteColors,undefined);assert.notEqual(lossy.identity,exact.identity);
 }
});
test('source reader loans are released and source changes alter plan selection',async()=>{
 let released=0;const image={source:{byteLength:4,async read(){return{bytes:Uint8Array.of(255,216,255,217),release(){released++;}};}}};const plan=await resolveRecompressionPlan({recompression:{codec:'source',lossless:false}},image);assert.equal(plan.stage.codec,'jpeg');assert.equal(released,1);
 const controller=new AbortController();controller.abort();await assert.rejects(resolveRecompressionPlan({},image,{signal:controller.signal}),{code:'CANCELLED'});
});
