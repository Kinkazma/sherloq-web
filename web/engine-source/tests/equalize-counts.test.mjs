import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {equalizeHistogramLut} from '../src/pixel-utils.js';import {magnifier,magnifierParams} from '../src/magnifier.js';import {separationEqualizeLuts} from '../src/segmented-separation.js';
import {gradientToneLut} from '../src/segmented-gradient.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/equalize-count-reference.json',import.meta.url)));
test('Native equalization above2^24 retains float32 count conversions in separation, magnifier and gradient',async()=>{
 for(const f of reference.cases){const bins=new Float64Array(768);for(const [value,count]of f.bins)for(let c=0;c<3;c++)bins[c*256+value]=count;for(const table of [equalizeHistogramLut(bins.subarray(0,256),f.count),...separationEqualizeLuts(bins,f.count),...[0,1,2].map(c=>gradientToneLut(bins,f.count,{equalize:true}).subarray(c*256,(c+1)*256))])for(const sample of f.samples)assert.equal(table[sample.input],sample.output);}
 const f=reference.cases[0],image={width:f.count,height:1,format:'rgb8',data:new Uint8Array(f.count*3)};let offset=0;for(const [v,n]of f.bins){image.data.fill(v,offset,offset+n*3);offset+=n*3;}
 const result=await magnifier(image,magnifierParams());assert.equal(createHash('sha256').update(result.pixels.data).digest('hex'),f.rgbSha256);assert.equal(result.pixels.data[3],128);
});
