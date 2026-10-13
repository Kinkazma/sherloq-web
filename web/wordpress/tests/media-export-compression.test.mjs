import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {mountMediaControls} from '../sherloq-browser/assets/media-controls.js';
import {validateMediaPreferences,validateExportSettings} from '../sherloq-browser/assets/media-settings.js';
import {rasterOptions} from '../sherloq-browser/assets/raster-export-client.js';
import {batchImageExportControls} from '../sherloq-browser/assets/batch-image-export.js';
test('individual export offers explicit PNG uncompressed level and independent lossless TIFF choices',async()=>{
 const {document,window}=parseHTML('<html><body><details id="settings-menu"><div><button>Last</button></div></details></body></html>');
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return [...this.options].find(o=>o.hasAttribute('selected'))?.value??this.options[0]?.value??'';},set(value){for(const o of this.options)o.toggleAttribute('selected',o.value===String(value));}});
 let preferences=validateMediaPreferences({exports:{format:'png'}}),controls;controls=mountMediaControls(document,{language:()=> 'fr',getPreferences:()=>preferences,setPreferences:value=>{preferences=validateMediaPreferences(value);controls?.sync();}});
 const dialog=document.getElementById('image-export-dialog'),field=key=>dialog.querySelector('[data-export="'+key+'"]'),pending=controls.requestExport(settings=>settings,{width:8,height:8});
 const png=field('pngCompression');assert.equal(png.tagName,'SELECT');assert.equal(png.options[0].textContent,'Sans compression (0)');assert.deepEqual([...png.options].map(o=>Number(o.value)),[0,1,2,3,4,5,6,7,8,9]);png.value='0';png.oninput();assert.equal(preferences.exports.pngCompression,0);assert.equal(rasterOptions(preferences.exports).compression,0);
 field('format').value='tiff';field('format').oninput();assert.equal(png.closest('label').hidden,true);assert.equal(field('tiffCompression').closest('label').hidden,false);assert.deepEqual([...field('tiffCompression').options].map(o=>o.value),['none','deflate']);
 assert.equal(rasterOptions(preferences.exports).compression,6);field('tiffCompression').value='none';field('tiffCompression').oninput();assert.equal(rasterOptions(preferences.exports).compression,0);assert.equal(rasterOptions(preferences.exports).lossless,true);
 dialog.querySelector('[data-action="export"]').onclick();assert.equal((await pending).tiffCompression,'none');controls.dispose();
});
test('portable TIFF settings and batch controls never reinterpret PNG levels as TIFF choices',()=>{
 for(const tiffCompression of ['none','deflate']){const settings=validateExportSettings({format:'tiff',tiffCompression,pngCompression:9});assert.deepEqual(validateExportSettings(JSON.parse(JSON.stringify(settings))),settings);assert.equal(rasterOptions(settings).compression,tiffCompression==='none'?0:6);}
 assert.equal(validateExportSettings({format:'tiff',pngCompression:0}).tiffCompression,'none');assert.throws(()=>validateExportSettings({tiffCompression:'lzw'}),/TIFF/);
 assert.equal(batchImageExportControls({format:'tiff'}).compression,false);assert.equal(batchImageExportControls({format:'tiff'}).tiffCompression,true);assert.deepEqual(batchImageExportControls({format:'png'}).pngCompressionLevels,[0,1,2,3,4,5,6,7,8,9]);
});
