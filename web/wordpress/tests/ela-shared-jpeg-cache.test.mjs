import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../../engine-source/src/cache.js';
import {createRgbSurface} from '../../engine-source/src/rgb-surface.js';
import {segmentedEla} from '../../engine-source/src/segmented-ela.js';
import {segmentedEnergyPlane} from '../../engine-source/src/energy-stream.js';
import {validateParams} from '../../engine-source/src/ela.js';
import {jpegCodec} from '../../engine-source/src/jpeg.js';
import {describeEnergy} from '../../engine-source/src/energy-primitives.js';

// Genuine global JPEG and scientific primitive paths, not a simulated codec.
// The UI keeps this source/engine owner alive across the view transition.
test('Classic and Energy reuse the completed native JPEG at the same quality, with bounded encoded entries and unchanged Energy under tone edits',async()=>{
 const width=131,height=137,data=Uint8Array.from({length:width*height*3},(_,i)=>(i*13+(i>>8)*91)&255),original={width,height,format:'rgb8',data},budget=new Budget(96*1024**2),image={surface:createRgbSurface({byteLength:data.length,readInto:(out,at)=>out.set(data.subarray(at,at+out.length))},{width,height,budget,ownsStore:false})};
 try{
  for(const quality of [83,88]){
   const classic=await segmentedEla(image,validateParams({quality,scale:64,contrast:37}),{budget});assert.equal(classic.metrics.recompressions,1);assert.ok(classic.metrics.cacheEntries<=2);await classic.surface.dispose();
   const expected=await describeEnergy(original,await jpegCodec.recompress(original,quality));const energy=await segmentedEnergyPlane(image,quality,{budget});let before;
   try{before=new Uint8Array(width*height*4);await energy.store.readInto(before);assert.deepEqual(before,new Uint8Array(expected.energy.buffer));assert.equal(energy.metrics.recompressions,0,'the genuine central JPEG produced by Classic is reused by Energy');}finally{await energy.dispose();}
   const display=await segmentedEla(image,validateParams({quality,scale:91,contrast:71,linear:true,grayscale:true}),{budget});assert.equal(display.metrics.recompressions,0);assert.ok(display.metrics.cacheEntries<=2);await display.surface.dispose();const again=await segmentedEnergyPlane(image,quality,{budget});try{const bytes=new Uint8Array(width*height*4);await again.store.readInto(bytes);assert.deepEqual(bytes,before,'Classic tone parameters cannot alter the scientific raw energy');assert.equal(again.metrics.recompressions,0);}finally{await again.dispose();}
  }
 }finally{await image.rgbRecompression?.dispose();await image.surface.dispose();}
 assert.equal(budget.total(),0);
});
