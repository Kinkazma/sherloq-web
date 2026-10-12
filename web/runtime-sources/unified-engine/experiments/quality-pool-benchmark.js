import {Budget} from '../src/cache.js';import {QualityPool} from '../src/quality-pool.js';import {resolveComputeProfile} from '../src/profiles.js';import {jpegCodec} from '../src/jpeg.js';import {gray} from '../src/pixel-utils.js';
export async function qualityPoolBenchmark(){
 const bytes=new Uint8Array(await(await fetch(new URL('../fixtures/bench-1024.jpg',import.meta.url))).arrayBuffer()),image=await jpegCodec.decode(bytes),source=Uint8Array.from({length:image.width*image.height},(_,i)=>gray(...image.data.subarray(i*3,i*3+3))),input={width:image.width,height:image.height,data:source},profile=resolveComputeProfile('maximum'),budget=new Budget(profile.memoryBudgetBytes),pool=new QualityPool(budget,profile);budget.retain(source.length);
 try{
  let start=performance.now();const baseline=await pool.serial(input,Array.from({length:100},(_,i)=>i+1));const serialMs=performance.now()-start;
  start=performance.now();const calibrated=await pool.run(input);const coldMs=performance.now()-start;start=performance.now();const warm=await pool.run(input);const warmMs=performance.now()-start;
  for(let i=0;i<100;i++)if(baseline[i][1]!==calibrated.raw[i]||baseline[i][1]!==warm.raw[i])throw new Error('JPEG quality pool parity mismatch');
  if(budget.retained!==source.length)throw new Error('Worker reservation leak');
  return {schema:1,fixture:'bench-1024.jpg',dimensions:[image.width,image.height],exact:true,serialMs,coldMs,warmMs,selectedWorkers:warm.workers,calibration:calibrated.calibration,budget:budget.snapshot(),limits:['One 1 MP generated image, one full-curve run per state','Candidate medians include input copies and worker messages','Calibration cost included in coldMs; workers destroyed after every job','No display time; shared host load may affect candidate choice']};
 }finally{pool.dispose();}
}
