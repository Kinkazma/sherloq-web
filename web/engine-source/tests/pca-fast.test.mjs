import test from 'node:test';
import assert from 'node:assert/strict';
import {pcaStreamMath} from '../src/pca-stream-math.js';
import {cvPcaModel} from '../src/opencv.js';
const bytesEqual=(a,b)=>assert.deepEqual(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),new Uint8Array(b.buffer,b.byteOffset,b.byteLength));

test('partitioned covariance retains each fused accumulation bit across arbitrary bands',async()=>{
 const math=await pcaStreamMath(),bytes=Uint8Array.from({length:997*3},(_,i)=>(i*73+Math.floor(i/7)*19)%256),mean=Float64Array.of(124.23,73.54,99.33),pairs=[0,1,2,4,5,8];let original=new Float64Array(9),joined=new Float64Array(9);
 for(let at=0;at<997;at+=37){const part=bytes.subarray(at*3,Math.min(997,at+37)*3);original=math.covariance(part,mean,original);for(let first=0;first<6;first+=2){const result=math.covarianceRange(part,mean,joined,first,first+2);for(let q=first;q<first+2;q++)joined[pairs[q]]=result[pairs[q]];}}
 bytesEqual(original,joined);
});

test('bounded RGB projection cache returns exact native doubles, including collisions and repeated bands',async()=>{
 const math=await pcaStreamMath(),image={width:17,height:13,format:'rgb8',data:Uint8Array.from({length:17*13*3},(_,i)=>i*37%256)},basis=await cvPcaModel(image),occupied=new Int32Array(131072).fill(-1);let collision;
 for(let key=0;!collision;key++){const slot=Math.imul(key,2654435761)>>>15;if(occupied[slot]>=0)collision=[occupied[slot],key];else occupied[slot]=key;}
 const keys=[0,16777215,...collision,...collision.reverse(),0],rgb=Uint8Array.from(keys.flatMap(key=>[key>>>16,(key>>>8)&255,key&255]));
 for(let component=0;component<3;component++){
  const cached=math.projector(basis,component);
  try{for(let round=0;round<4;round++){bytesEqual(cached.project(rgb),math.project(rgb,basis,component,1));bytesEqual(cached.project(image.data),math.project(image.data,basis,component,1));}assert(cached.metrics.hits>0);assert.equal(cached.metrics.entries,131072);}
  finally{cached.dispose();cached.dispose();}assert.throws(()=>cached.project(rgb));
 }
});
