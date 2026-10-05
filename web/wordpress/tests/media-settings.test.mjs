import test from 'node:test';import assert from 'node:assert/strict';
import {validateMediaPreferences,validateExportSettings,loupeKey,loupeScale,resolveChroma} from '../sherloq-browser/assets/media-settings.js';
test('media settings survive portable JSON roundtrip without browser storage',()=>{
 const p=validateMediaPreferences({font:'montserrat',exports:{format:'heic',chroma:'444',quality:93,heicQuality:77},loupe:{enabled:true,unlock:true,zoom:2}});
 assert.deepEqual(validateMediaPreferences(JSON.parse(JSON.stringify(p))),p);
 assert.equal(validateMediaPreferences().exports.quality,90);assert.equal(resolveChroma('source'), '422');assert.equal(resolveChroma('source','420'),'420');
 assert.throws(()=>validateExportSettings({format:'jpeg'}));assert.throws(()=>validateMediaPreferences({loupe:{zoom:3601}}));assert.throws(()=>validateMediaPreferences({font:'unknown'}));
});
test('L uses logical key on AZERTY and QWERTY, preserves typing and browser shortcuts',()=>{
 for(const code of ['KeyL','KeyQ'])assert.equal(loupeKey({key:'l',code}),true);
 assert.equal(loupeKey({key:'L',shiftKey:true}),true);
 for(const e of [{key:'l',ctrlKey:true},{key:'l',altKey:true},{key:'l',repeat:true},{key:'l',isComposing:true},{key:'l',composedPath:()=>[{tagName:'INPUT'}]},{key:'l',target:{isContentEditable:true}},{key:'a',code:'KeyL'}])assert.equal(loupeKey(e),false);
});
test('magnifier is constrained by Fit unless explicitly unlocked',()=>{
 assert.equal(loupeScale({zoom:2,unlock:false},.12),.12);assert.equal(loupeScale({zoom:2,unlock:true},.12),.02);assert.equal(loupeScale({zoom:3600,unlock:false},.12),36);
});
test('lossless defaults, format-specific settings and pixel dimensions round-trip independently',async()=>{
 const {exportDefaults,linkedExportSize}=await import('../sherloq-browser/assets/media-settings.js');assert.equal(exportDefaults.format,'webp');assert.equal(exportDefaults.webpLossless,true);
 for(const format of ['avif','webp','heic','png','tiff'])assert.equal(validateExportSettings({format,webpLossless:true,avifLossless:true,heicLossless:true}).format,format);
 assert.deepEqual(linkedExportSize({resizeAxis:'width',width:900},{width:6000,height:4000}),{width:900,height:600});assert.deepEqual(linkedExportSize({}, {width:6000,height:4000},'height',900),{width:1350,height:900});
 assert.equal(validateExportSettings({adaptive:true,maximumMegapixels:2}).resize,false);
});
test('loupe dimensions scale with the actual screen and migrate the obsolete default',async()=>{
 const {loupeDefaults,loupeGeometry,validateLoupeSettings}=await import('../sherloq-browser/assets/media-settings.js');
 assert.deepEqual(loupeGeometry(loupeDefaults,{width:2056,height:1329}),{diameter:300,transition:60,factor:1});assert.deepEqual(loupeGeometry(loupeDefaults,{width:1028,height:664.5}),{diameter:150,transition:30,factor:.5});
 assert.equal(loupeGeometry({...loupeDefaults,proportional:false},{width:1028,height:664}).diameter,300);assert.equal(validateLoupeSettings({diameter:100,transition:30}).diameter,300);
});
