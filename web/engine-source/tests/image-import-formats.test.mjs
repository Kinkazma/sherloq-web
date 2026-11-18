import test from 'node:test';import assert from 'node:assert/strict';
import {IMAGE_IMPORT_FORMATS,legacyImageFormat,extendedImageFormat,sourceImageFormat} from '../src/media-format.js';import {RECOMPRESSION_FORMATS} from '../src/recompression-plan.js';
test('one image-format identity registry serves every import and recompression consumer',()=>{
 assert.equal(IMAGE_IMPORT_FORMATS.length,20);assert.deepEqual(IMAGE_IMPORT_FORMATS.map(row=>row.id),RECOMPRESSION_FORMATS.map(row=>row.id));assert(IMAGE_IMPORT_FORMATS.every(row=>row.extensions.length>0&&Object.isFrozen(row)));
});
test('canonical source metadata does not change the old generic decoder hints',()=>{
 assert.equal(extendedImageFormat(new TextEncoder().encode('P6\n33 31\n255\n')),'PNM');assert.equal(sourceImageFormat(new TextEncoder().encode('P6\n33 31\n255\n')),'ppm');assert.equal(sourceImageFormat(new TextEncoder().encode('P7\nWIDTH 33\n')),'pam');assert.equal(sourceImageFormat(Uint8Array.of(255,216,255,217),'renamed.dng'),'jpeg');assert.equal(extendedImageFormat(Uint8Array.of(73,73,42,0,8,0,0,0),'source.dng'),'DNG');assert.equal(extendedImageFormat(Uint8Array.of(1,2,3,4,5,6,7,8)),null);
});

test('header-only PCX and TGA detection remains bounded and rejects random data',()=>{const pcx=new Uint8Array(128);pcx.set([10,5,1,8]);pcx[8]=32;pcx[10]=30;pcx[65]=3;pcx[66]=34;assert.equal(sourceImageFormat(pcx),'pcx');const tga=new Uint8Array(21);tga[2]=2;tga[12]=33;tga[14]=31;tga[16]=24;assert.equal(sourceImageFormat(tga),'tga');assert.equal(sourceImageFormat(new Uint8Array(128)),null);});

test('standalone DIB joins BMP identity only through a coherent bounded image header',async()=>{
 const {dibImageHeader}=await import('../src/media-format.js');
 const dib=new Uint8Array(40+4*3*2),v=new DataView(dib.buffer);v.setUint32(0,40,true);v.setInt32(4,4,true);v.setInt32(8,2,true);v.setUint16(12,1,true);v.setUint16(14,24,true);
 assert.deepEqual(dibImageHeader(dib),{width:4,height:2,depth:24,compression:0,headerSize:40});assert.equal(extendedImageFormat(dib,'photo.dib'),'DIB');assert.equal(sourceImageFormat(dib,'renamed.bin'),'bmp');
 for(const [offset,value,type]of[[4,0,'setInt32'],[8,0,'setInt32'],[12,2,'setUint16'],[14,7,'setUint16'],[16,99,'setUint32'],[0,48,'setUint32']]){const b=dib.slice();new DataView(b.buffer)[type](offset,value,true);assert.equal(dibImageHeader(b),null);}
 const jpeg=Uint8Array.of(255,216,255,217),png=Uint8Array.of(137,80,78,71,13,10,26,10);assert.equal(dibImageHeader(jpeg),null);assert.equal(dibImageHeader(png),null);assert.equal(extendedImageFormat(new Uint8Array(128)),null);
 const truncated=dib.slice(0,40);assert.equal(dibImageHeader(truncated),null);const compressed=dib.slice();new DataView(compressed.buffer).setUint32(16,1,true);assert.equal(dibImageHeader(compressed),null,'RLE8 cannot claim a 24-bit input');
});
