import {initCvWasm,cvComparison} from '../src/opencv.js';
const median=a=>a.toSorted((a,b)=>a-b)[Math.floor(a.length/2)];
export async function comparisonKernelBenchmark(){
 await initCvWasm();
 const fixture=(await(await fetch('/fixtures/comparison-reference.json')).json()).cases.find(f=>f.name==='megapixel'),images=[];
 for(const file of [fixture.first,fixture.second]){const bytes=new Uint8Array(await(await fetch('/fixtures/'+file)).arrayBuffer()),data=new Uint8Array(512*512*3);for(let y=0;y<512;y++)data.set(bytes.subarray(y*fixture.width*3,(y*fixture.width+512)*3),y*512*3);images.push({width:512,height:512,format:'rgb8',data});}
 const report={schema:1,scope:'Isolated Sewar WASM calls, synthetic top-left 512x512 crop at original pixel resolution. Separate from full 1 MP worker/RPC benchmark. Sequential experiments; same per-pixel operations. Each score compared bit-for-bit to software FMA.',experiments:[]};let expected;
 for(const [name,experiment] of [['original',1],['contiguous-software-fma',3],['contiguous-guarded-simd',0]]){
  const row={name,samplesMs:[]};
  for(let sample=-1;sample<3;sample++){
   const start=performance.now(),result=await cvComparison(...images,3,{experiment}),ms=performance.now()-start;
   const bits=new Uint8Array(result.values.buffer);expected??=bits.slice();if(!bits.every((x,i)=>x===expected[i]))throw new Error(name+' scalar bits diverge');
   if(sample<0)row.firstMs=ms;else row.samplesMs.push(ms);console.log('Comparison kernel',name,sample,ms);
  }
  row.medianMs=median(row.samplesMs);report.experiments.push(row);
 }
 return report;
}
