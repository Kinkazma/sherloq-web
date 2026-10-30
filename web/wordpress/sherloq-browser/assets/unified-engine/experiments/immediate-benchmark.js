import {createWorkerEngine} from '../src/worker-client.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer()),json=async name=>(await fetch('/fixtures/'+name)).json();
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const assert=(v,m)=>{if(!v)throw Error(m);};
export async function immediateBenchmark(){
 const bytes=await read('bench-1024.jpg'),zero=await json('zero-large-reference.json'),ghost=await json('ghost-large-reference.json'),frequency=(await json('frequency-large-reference.json')).cases.at(-1),freq=frequency.expected.find(e=>e.params.split===50&&e.params.smooth===100&&e.params.threshold===37&&e.params.filter===0),frequencyBytes=await read(frequency.file);
 const specifications=[
  {operation:'ela.classic'},
  {operation:'jpeg.quality'},
  {operation:'jpeg.ghosts',params:ghost.expected[0].params,check:async r=>assert(await hash(r.data.raw)===ghost.expected[0].raw&&await hash(r.data.maps)===ghost.expected[0].maps,'Native Ghost first use')},
  {operation:'jpeg.zero',check:async r=>{for(const [k,a] of Object.entries(zero.arrays)){if(k==='grid_log10_nfa'){for(let i=0;i<64;i++)assert(Math.abs(r.data[k][i]-a.values[i])<=1e-8&&(r.data[k][i]<0)===(a.values[i]<0),'ZERO NFA');}else assert(await hash(r.data[k])===a.sha256,'ZERO '+k);}assert(await hash(r.pixels.data)===zero.views[0],'ZERO view');}},
  {operation:'detail.frequency',params:freq.params,input:{id:'i',bytes:frequencyBytes,pixels:{width:frequency.width,height:frequency.height,format:'rgb8',data:frequencyBytes}},check:async r=>{for(const [i,p] of [r.pixels,r.data.high,r.data.magnitude,r.data.phase].entries())assert(await hash(p.data)===freq.sha256[i],'Frequency final view');assert(r.data.zeroPercent===freq.zeroPercent,'Frequency decisions');}}
 ];
 const report={schema:1,scope:'Sequential development measurements, three fresh engines per operation, no warm-up or saved profile. First complete useful RPC includes startup/copies; checks outside timers. Load plus RPC excludes presentation/WordPress. Full 1 MP source, maximum profile.',results:[]};
 for(const spec of specifications){const samples=[];let signature;
  for(let iteration=0;iteration<3;iteration++){
   const engine=createWorkerEngine({computeProfile:'maximum'});try{let t=performance.now();await engine.load(spec.input??{id:'i',bytes});const loadMs=performance.now()-t;t=performance.now();const result=await engine.run({id:'first',imageId:'i',operation:spec.operation,params:spec.params}),firstUsefulRpcMs=performance.now()-t;
    if(spec.check)await spec.check(result);else{const current=await hash(spec.operation==='ela.classic'?result.pixels.data:result.data.raw);if(signature)assert(current===signature,'Repeat first-use exactness');signature=current;}
    const schedules=result.metrics.votePasses?.map(p=>p.scheduling)??(result.metrics.scheduling?[result.metrics.scheduling]:[]);for(const p of schedules)assert(p.preflightExecutions===0&&p.taskExecutions===1&&p.retry===null,'Unexpected preflight/retry');if(result.metrics.gpu)assert(result.metrics.gpu.qualification.preflightExecutions===0,'GPU preflight');
    samples.push({loadMs,firstUsefulRpcMs,loadAndRpcMs:loadMs+firstUsefulRpcMs,metrics:result.metrics});console.log('Immediate',spec.operation,iteration,firstUsefulRpcMs);
   }finally{engine.dispose();}
  }
  // Compare against the retained serial reference only AFTER measured auto calls.
  if(!spec.check){const reference=createWorkerEngine({cpuKernel:'reference'});try{await reference.load({id:'i',bytes});const r=await reference.run({id:'reference',imageId:'i',operation:spec.operation});assert(await hash(spec.operation==='ela.classic'?r.pixels.data:r.data.raw)===signature,'Retained CPU reference');}finally{reference.dispose();}}
  report.results.push({operation:spec.operation,params:spec.params,exact:true,samples,medianFirstUsefulRpcMs:samples.map(x=>x.firstUsefulRpcMs).sort((a,b)=>a-b)[1]});
 }return report;
}
