import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import * as m from '../vendor/media/magick/index.js';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('the paired complete Q8 SDK preserves the public/native ABI, delegates and coder capabilities',async()=>{
 const root=new URL('../',import.meta.url),expected=JSON.parse(await readFile(new URL('vendor/media/magick/SOURCE-METADATA.json',root))),pins=JSON.parse(await readFile(new URL('vendor/media/PINNED.json',root)));
 for(const file of ['magick/index.js','magick/index.d.ts','magick/x86/magick.wasm','magick/SOURCE-METADATA.json'])assert.equal(createHash('sha256').update(await readFile(new URL('vendor/media/'+file,root))).digest('hex'),pins.files[file],file);
 await m.initializeImageMagick(new Uint8Array(await readFile(new URL('vendor/media/magick/x86/magick.wasm',root))));
 const formats=m.Magick.supportedFormats.map(f=>({format:f.format,module:f.moduleFormat,read:f.supportsReading,write:f.supportsWriting,multipleFrames:f.supportsMultipleFrames})).sort((a,b)=>a.format.localeCompare(b.format)||a.module.localeCompare(b.module));
 const inventory={publicExports:Object.keys(m).sort(),nativeMethods:Object.keys(m.ImageMagick._api).filter(k=>/^_(?:Magick|Pixel|Quantum|Resource|Environment|Drawing|Drawable|Color|Connected|Jpeg|OpenCL|Pdf|Type|Double|Perceptual|Statistics|Moments|Primary|Point|String|Offset)/.test(k)).sort(),delegates:m.Magick.delegates.split(/\s+/).filter(Boolean).sort(),formats};
 assert.equal(m.Quantum.depth,8);assert.ok(!m.Magick.features.includes('HDRI'));
 for(const [key,values]of Object.entries(inventory)){assert.equal(values.length,expected.abi[key].count,key);assert.equal(digest(values),expected.abi[key].sha256,key);}
});
