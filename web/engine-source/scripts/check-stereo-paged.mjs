import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {Budget} from '../src/cache.js';import {stereoPagedFlow} from '../src/stereo-paged-flow.js';import {createFloatPlane} from '../src/segmented-float-plane.js';import {createStereoStream} from '../src/stereo-stream-kernel.js';
const reference=JSON.parse(await readFile(new URL('../fixtures/stereo-reference.json',import.meta.url))),proof=[];
for(const f of reference.cases.filter(f=>f.offset>=1&&(!process.argv[2]||f.name===process.argv[2]))){
 const rgb=new Uint8Array(await readFile(new URL('../fixtures/'+f.file,import.meta.url))),budget=new Budget(128*1024**2),image={surface:{descriptor:{width:f.width,height:f.height},async readWindow({y,height}){return {pixels:{data:rgb.subarray(y*f.width*3,(y+height)*f.width*3)},release(){}};}}};
 const plane=await createFloatPlane(f.width-f.offset,f.height,{budget,ArrayType:Float32Array,storage:'memory'}),start=performance.now(),metrics=await stereoPagedFlow(image,f.offset,plane,{budget,storage:'memory'}),flow=await plane.read(0,0,plane.width,plane.height),sha256=createHash('sha256').update(new Uint8Array(flow.buffer)).digest('hex');
 const native=createStereoStream?await createStereoStream():null;native.create(plane.width,plane.height);native.put(rgb,f.width,0,f.height,f.offset);native.flow();const expected=native.read(0,flow.length);native.dispose();let maximum=0,mean=0;for(let i=0;i<flow.length;i++){const e=Math.abs(flow[i]-expected[i]);maximum=Math.max(maximum,e);mean+=e/flow.length;}
 const row={name:f.name,width:f.width,height:f.height,offset:f.offset,sha256,nativeSha256:f.flowSha256,nativeExact:sha256===f.flowSha256,maximum,mean,...metrics,milliseconds:performance.now()-start};proof.push(row);console.log(row);await plane.dispose();assert.equal(budget.total(),0);if(maximum>0)throw Error('Paged flow differs from resident reference');assert.equal(sha256,f.flowSha256);
}
if(!process.argv[2])await writeFile(new URL('../docs/stereo-paged-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');

if(process.argv[2])await writeFile(new URL('../docs/stereo-paged-simd-'+process.argv[2]+'-proof.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');
