import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {createDenseRegions,denseCompactAxes} from '../src/dense-regions.js';
const dir=new URL('../.build/dense-regions-reference/',import.meta.url),meta=JSON.parse(await fs.readFile(new URL('manifest.json',dir),'utf8'));
const read=async(name,Type=Uint8Array)=>{const b=await fs.readFile(new URL(name,dir));return new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const engine=await createDenseRegions(),image={width:meta.width,height:meta.height,data:await read('rgb.u8')};
for(const r of meta.records)assert.deepEqual(engine.allowed(image,r).mask,await read(r.file),JSON.stringify(r));
const axes=denseCompactAxes(meta.width,meta.height,meta.polys);for(let i=0;i<2;i++)assert.deepEqual(axes[i],await read(`axis${i}.f32`,Float32Array));
await fs.writeFile(new URL('../docs/dense-regions-native-proof.json',import.meta.url),JSON.stringify({masks:meta.records.length,exact:true,compactAxesExact:true},null,2)+'\n');console.log('45 native eligibility masks and compact axes exact');
