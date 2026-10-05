import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {executeExiftool} from '../src/exiftool-runtime.js';import {exiftoolReport} from '../src/exiftool-report.js';import {exiftoolParams} from '../src/exiftool.js';
const root=new URL('./data/exiftool/',import.meta.url),reference=JSON.parse(await readFile(new URL('reference.json',root))),assets={pack:new Uint8Array(await readFile(new URL('../vendor/exiftool/libraries.pack',import.meta.url))),wasm:new Uint8Array(await readFile(new URL('../vendor/exiftool/zeroperl.wasm',import.meta.url)))},sha=b=>createHash('sha256').update(b).digest('hex');
test('ExifTool 13.55 native complete grouped metadata, HTML and exact thumbnail bytes',async()=>{
 for(const expected of reference.cases){
  const blob=new Blob([await readFile(new URL(expected.file,root))]);
  for(const mode of ['dump','location','headers','thumbnail']){
   const r=await executeExiftool(blob,mode,assets);assert.ok(r.metrics.wasmHeapBytes<=128*1024**2);
   if(mode==='dump'){const data=exiftoolReport(r.bytes);assert.deepEqual(data.metadata,expected.metadata,expected.file);assert.deepEqual(data.rows.map(r=>[r.groupHeading,r.tag]),expected.nativeDisplayRows.map(r=>r.slice(0,2)));assert.equal(data.version,'13.55');}
   else if(mode==='location')assert.deepEqual(exiftoolReport(r.bytes).metadata,expected.locationMetadata);
   else assert.equal(sha(r.bytes),mode==='headers'?expected.htmlSha256:expected.thumbnailSha256,expected.file+' '+mode);
  }
 }
});
test('Fixed modes only and composite GPS validity / zero value',()=>{
 assert.throws(()=>exiftoolParams({args:['-config','bad']}));assert.throws(()=>exiftoolParams({mode:'write'}));
 const report=exiftoolReport(new TextEncoder().encode(JSON.stringify([{'Composite:GPSLatitude':0,'Composite:GPSLongitude':-12.25,'EXIF:Zero':0,'EXIF:False':false,'EXIF:Empty':'','SourceFile':'virtual'}])));
 assert.deepEqual(report.coordinates,{latitude:0,longitude:-12.25});assert.equal(report.rows.length,4);assert.equal(report.virtualFile.SourceFile,'virtual');assert.ok(!Object.hasOwn(report.metadata,'SourceFile'));
 for(const coordinates of [[true,5],[91,5],[0,-181],[null,5]])assert.throws(()=>exiftoolReport(new TextEncoder().encode(JSON.stringify([{'Composite:GPSLatitude':coordinates[0],'Composite:GPSLongitude':coordinates[1]}]))));
});
