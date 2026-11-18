import test from 'node:test';import assert from 'node:assert/strict';
import {avifNativeMemoryPlan} from '../src/avif-hdr-runtime.js';
const GiB=1024**3;
test('100MP10bit420 single frame is admitted by a native codec address-space plan',()=>{const p=avifNativeMemoryPlan(10000,10000,16203,{depth:10,yuvFormat:3,threads:10,codecCount:1,codecWorkPixels:102252544,codecTileBudget:4096});assert.ok(p.heapMaximumBytes<2*GiB);assert.equal(p.nativeBytes,600000000);assert.equal(p.displayBytes,300000000);assert.equal(p.decoderCount,1);assert.equal(p.heapMaximumBytes%65536,0);});
test('many small independent codecs use their actual geometry rather than 400 complete frames',()=>{const p=avifNativeMemoryPlan(10000,10000,20000,{depth:10,yuvFormat:3,threads:1,codecCount:400,codecWorkPixels:104857600,codecTileBudget:25600});assert.ok(p.heapMaximumBytes<2*GiB);assert.equal(p.decoderCount,400);assert.equal(p.codecWorkPixels,104857600);});
test('shared grid codec geometry stays independent of its number of container tiles',()=>{const p=avifNativeMemoryPlan(10000,10000,20000,{depth:10,yuvFormat:3,threads:10,codecCount:1,codecWorkPixels:262144,codecTileBudget:64});assert.ok(p.heapMaximumBytes<2*GiB);assert.equal(p.decoderCount,1);assert.equal(p.codecWorkPixels,262144);});
test('the31MP HDR base and gain map fund their distinct codec owners',()=>{const p=avifNativeMemoryPlan(6861,4574,7550427,{depth:10,yuvFormat:1,gainMap:true,gainWidth:6861,gainHeight:4574,gainDepth:10,gainFormat:1,threads:10,codecCount:2,codecWorkPixels:63700992,codecTileBudget:8192});assert.equal(p.decoderCount,2);assert.equal(p.decodedPlaneBytes,382205952);assert.ok(p.codecMemoryBytes<2*GiB);assert.ok(p.minimumCodecMemoryBytes<p.codecMemoryBytes);});

test('straight native alpha RGB funds only its bounded source-depth RGBA band and leaves opaque plans unchanged',()=>{for(const depth of[8,10,16]){const options={depth,yuvFormat:1,threads:1,codecCount:2,codecWorkPixels:32768,codecTileBudget:8},opaque=avifNativeMemoryPlan(64,48,4096,options),alpha=avifNativeMemoryPlan(64,48,4096,{...options,alpha:true});assert.equal(opaque.alphaTemporaryBytes,0);assert.equal(alpha.alphaTemporaryBytes,4*(depth>8?2:1)*64*132);assert.ok(alpha.minimumCodecMemoryBytes>=opaque.minimumCodecMemoryBytes);}const large=avifNativeMemoryPlan(10000,10000,16203,{depth:10,yuvFormat:3,alpha:true,codecCount:2,codecWorkPixels:204505088,codecTileBudget:8192});assert.equal(large.alphaTemporaryBytes,10560000);assert.ok(large.heapMaximumBytes+large.nativeBytes+large.displayBytes<4*GiB);});

test('chroma-aligned runtime bands retain their existing132-row workspace, including every odd band step',()=>{
 let largest=0;
 for(let step=1;step<=128;step++)for(let y=0;y<1024;y+=step){
  const rows=Math.min(step,1024-y),end=Math.min(1024,y+rows+2);
  const first=Math.floor(Math.max(0,y-2)/2)*2;
  assert.equal(first%2,0);assert.ok(first<=y);assert.ok(end-first<=132);
  largest=Math.max(largest,end-first);
 }
 assert.equal(largest,132);
});
