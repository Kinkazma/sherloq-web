import {createWorkerEngine} from '../src/worker-client.js';
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
export async function ghostBenchmark(){
 const ref=await(await fetch('/fixtures/ghost-large-reference.json')).json(),bytes=new Uint8Array(await(await fetch('/fixtures/'+ref.file)).arrayBuffer()),report={schema:1,scope:'Sequential full-resolution 1 MP synthetic JPEG, nine qualities, three distinct phase rolls. Cold includes worker calibration. No graph/WordPress composite benchmark.',results:[]};
 for(const cpuKernel of ['single','auto']){const engine=createWorkerEngine({cpuKernel,computeProfile:'maximum'}),row={cpuKernel,samples:[]};try{const load=performance.now();await engine.load({id:'i',bytes});row.loadMs=performance.now()-load;
  for(const e of ref.expected){const t=performance.now(),r=await engine.run({id:'g',imageId:'i',operation:'jpeg.ghosts',params:e.params}),rpcMs=performance.now()-t;if(await hash(r.data.raw)!==e.raw||await hash(r.data.maps)!==e.maps)throw new Error('Native Ghost benchmark parity failed');const view=performance.now(),colored=await engine.run({id:'view',imageId:'i',operation:'jpeg.ghosts',params:{...e.params,grayscale:false}}),viewChangeMs=performance.now()-view;row.samples.push({params:e.params,rpcMs,viewChangeMs,viewReusedAnalysis:colored.metrics.cache.analysis,metrics:r.metrics});console.log('Ghost benchmark',cpuKernel,e.params.x,JSON.stringify({rpcMs,viewChangeMs,workers:r.metrics.workers}));}
  report.results.push(row);
 }finally{engine.dispose();}}return report;
}
