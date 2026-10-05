import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {textTiles,parseTextBoxes,supportedTextBoxes,deduplicateTextBoxes,textPolygons} from '../src/text-regions.js';
const native=JSON.parse(await readFile(new URL('./m3-data/text-regions-reference.json',import.meta.url)));
const image={width:native.width,height:native.height,format:'rgb8',data:Uint8Array.from(native.rgb)};
test('Tesseract TSV rules, flat support and trimming equal native',async()=>{
  const boxes=parseTextBoxes(native.tsv,[0,0],image.width,image.height);
  assert.deepEqual(boxes,native.parsed);let bytes=0;
  const supported=await supportedTextBoxes(image,boxes,{reserveMemory:n=>bytes+=n});
  assert.deepEqual(supported,native.supported);assert.deepEqual(textPolygons(supported),native.polygons);
  assert.ok(bytes>0);assert.ok(supported.every(b=>Object.keys(b).sort().join(',')==='bounds,confidence'));
});
test('OCR tiled coverage retains full resolution and exact right/bottom edge',()=>{
  assert.deepEqual(textTiles(20,30),[[0,0,20,30]]);
  assert.deepEqual(textTiles(1536,1536),[[0,0,1536,1536]]);
  assert.deepEqual(textTiles(3000,100),[[0,0,1536,100],[1408,0,2944,100],[1464,0,3000,100]]);
});
test('OCR duplicates use inclusive smaller-area overlap, confidence then coordinate order',()=>{
  const boxes=[{bounds:[0,0,9,9],confidence:91},{bounds:[0,0,8,8],confidence:99},{bounds:[30,30,40,40],confidence:70},{bounds:[2,0,11,9],confidence:90}];
  assert.deepEqual(deduplicateTextBoxes(boxes),[boxes[1],boxes[3],boxes[2]]);
  const exact80=[{bounds:[0,0,9,9],confidence:99},{bounds:[2,0,11,9],confidence:90}];
  assert.equal(deduplicateTextBoxes(exact80).length,2);
});
test('OCR filters honor shared admission and cancellation',async()=>{
  await assert.rejects(supportedTextBoxes(image,native.parsed),{code:'INVALID_INPUT'});
  await assert.rejects(supportedTextBoxes(image,native.parsed,{reserveMemory:()=>{throw Error('budget');}}),/budget/);
  const cancel=new AbortController();cancel.abort();
  await assert.rejects(supportedTextBoxes(image,native.parsed,{reserveMemory:()=>{},signal:cancel.signal}),{code:'CANCELLED'});
});
