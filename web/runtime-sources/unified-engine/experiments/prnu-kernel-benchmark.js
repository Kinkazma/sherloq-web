import {initPrnuTwiddles,cvPrnuResidual} from '../src/opencv.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
export async function prnuKernelBenchmark(){
 const ref=await(await fetch('/fixtures/prnu-reference.json')).json(),f=ref.cases.find(x=>x.name==='megapixel'),image={width:f.width,height:f.height,format:'rgb8',data:await read(f.file)},bytes=await read(f.residual),expected=new Float64Array(bytes.buffer),experiments=[];
 await initPrnuTwiddles();
 for(const fast of [false,true]){
  const samples=[];let coldMs;
  for(let i=-1;i<3;i++){const start=performance.now(),result=await cvPrnuResidual(image,{fast}),ms=performance.now()-start;if(!result.values.every((x,j)=>Object.is(x,expected[j]))||result.noisePower!==f.noisePower)throw new Error('PRNU kernel bit parity');if(i<0)coldMs=ms;else samples.push(ms);}
  experiments.push({fast,coldMs,samples,medianMs:median(samples)});
 }
 return {schema:1,scope:'Sequential 1 MP Wiener residual extraction in one browser realm; pinned seeds preloaded; independent output copy included; every float64 bit compared outside timing.',experiments};
}
