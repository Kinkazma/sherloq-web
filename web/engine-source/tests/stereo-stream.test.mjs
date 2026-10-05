import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createStereoStream} from '../src/stereo-stream-kernel.js';
const file=f=>readFile(new URL('../fixtures/'+f,import.meta.url)),refs=JSON.parse(await file('stereo-reference.json')),hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const bankers=x=>{const a=Math.floor(x);return x-a===.5?a+a%2:Math.round(x);};
test('bounded half-height search and streamed gray-pair Farneback preserve native output',async()=>{
 const math=await createStereoStream();let flows=0,searches=0,peak=0;
 try{for(const f of refs.cases){const rgb=new Uint8Array(await file(f.file)),width=f.width,height=f.height;
  if(height>=2&&Math.floor(width/3)>11){const rows=bankers(height*.5),sums=new Float64Array(Math.floor(width/3)-10);for(let y=0;y<rows;y+=13){const h=Math.min(13,rows-y),srcHeight=Math.min(h*2,height-y*2),partial=math.search(rgb.subarray(y*2*width*3,(y*2+srcHeight)*width*3),width,srcHeight,h);for(let i=0;i<sums.length;i++)sums[i]+=partial[i];}const diff=Float32Array.from(sums,(v,i)=>v*(1/(rows*(width-i-10))));assert.deepEqual(Array.from(diff),f.difference,f.name+' search');let maximum=-Infinity,offset=-1;for(let i=0;i<diff.length-1;i++){const d=Math.fround(diff[i+1]-diff[i]);if(d>maximum){maximum=d;offset=i+10;}}if(maximum<2)offset=-1;assert.equal(offset,f.offset??-1);searches++;}
  if(f.offset!==null){math.create(width-f.offset,height);for(let y=0;y<height;y+=17){const h=Math.min(17,height-y);math.put(rgb.subarray(y*width*3,(y+h)*width*3),width,y,h,f.offset);}const result=math.flow();peak=Math.max(peak,result.heapBytes);const values=math.read(0,(width-f.offset)*height);assert.equal(hash(values),f.flowSha256,f.name+' flow');math.dispose();flows++;}
 }console.log({searches,flows,peak});}finally{math.dispose();}
});
