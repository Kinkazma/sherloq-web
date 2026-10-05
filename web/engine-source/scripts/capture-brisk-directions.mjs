// Capture integer inputs to atan2f, not an approximation of the native outputs.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import create from '../.build/cloning-features-brisk-directions.mjs';
const expanded=process.argv.includes('--expanded');
const dir=new URL(expanded?'../.build/brisk-expanded-study/':'../.build/cloning-study/',import.meta.url);
const ref=JSON.parse(await fs.readFile(new URL('reference.json',dir),'utf8')),m=await create(),rows=[];
const copy=async file=>{const bytes=await fs.readFile(new URL(file,dir)),p=m._malloc(bytes.length);m.HEAPU8.set(bytes,p);return p;};
for(const image of ref.images){
 const gray=await copy(image.gray);
 try{for(const expected of image.results.filter(x=>x.algorithm===0&&x.mask==='all')){
  m._brisk_reset();const count=m._features_detect(gray,0,image.width,image.height,0);
  assert.equal(count,expected.count,image.name);assert.equal(m._brisk_direction_count(),count);
  const bytes=await fs.readFile(new URL(expected.points,dir));
  const native=new Float64Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
  const points=m.HEAPF64.slice(m._features_points()/8,m._features_points()/8+count*7);
  const directions=m.HEAPF64.slice(m._brisk_values()/8,m._brisk_values()/8+count*2);
  for(let i=0;i<count;i++){
   for(const field of [0,1,2,4,5,6])assert.equal(points[7*i+field],native[7*i+field],`${image.name}/${i}/${field}`);
   const x=directions[2*i],y=directions[2*i+1];
   rows.push([x,y,points[7*i+3],native[7*i+3],m._brisk_angle(x,y)]);
  }
  m._features_release();
 }}finally{m._features_release();m._free(gray);}
}
await fs.writeFile(new URL('brisk-directions.json',dir),JSON.stringify({schema:1,columns:['x','y','wasmDegrees','nativeDegrees','wasmRawDegrees'],referenceSource:ref.sourceSha256,rows})+'\n');
console.log(rows.length,'orientation vectors captured');
