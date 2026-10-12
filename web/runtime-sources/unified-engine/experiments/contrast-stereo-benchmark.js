import {createWorkerEngine} from '../src/worker-client.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
function display(pixels){const start=performance.now(),canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;const rgba=new Uint8ClampedArray(pixels.width*pixels.height*4);for(let i=0,j=0;i<pixels.data.length;i+=3,j+=4){rgba[j]=pixels.data[i];rgba[j+1]=pixels.data[i+1];rgba[j+2]=pixels.data[i+2];rgba[j+3]=255;}canvas.getContext('2d').putImageData(new ImageData(rgba,pixels.width,pixels.height),0,0);return performance.now()-start;}
export async function contrastStereoBenchmark({samples=3,kernels=['reference','single']}={}){
 const contrast=(await(await fetch('/fixtures/contrast-reference.json')).json()).cases.find(f=>f.name==='large'),stereo=(await(await fetch('/fixtures/stereo-reference.json')).json()).cases.at(-1),report={schema:1,scope:'Sequential synthetic 1 MP RGB8 inputs, no resize. RPC includes copies/transfers; raster presentation measured separately. One main worker; no WordPress or physical-device claim.',results:[]};
 for(const [operation,fixture] of [['tampering.contrast',contrast],['various.stereogram',stereo]])for(const cpuKernel of kernels){
  if(operation==='tampering.contrast'&&cpuKernel==='reference')continue;
  const bytes=await read(fixture.file),engine=createWorkerEngine({computeProfile:'maximum',cpuKernel}),row={operation,cpuKernel,samples:[]};
  try{for(let i=0;i<samples;i++){
   const start=performance.now();await engine.load({id:'i',bytes,pixels:{width:fixture.width,height:fixture.height,format:'rgb8',data:bytes}});const loadMs=performance.now()-start,t=performance.now(),r=await engine.run({id:'analysis',imageId:'i',operation,params:{mode:operation==='tampering.contrast'?2:2}}),rpcMs=performance.now()-t;
   const expected=operation==='tampering.contrast'?fixture.expected.find(e=>e.block===64).views[2]:fixture.views[2];if(await hash(r.pixels.data)!==expected)throw new Error('Benchmark pixel parity');if(operation==='various.stereogram'&&await hash(r.data.flow)!==fixture.flowSha256)throw new Error('Benchmark flow parity');
   const displayMs=display(r.pixels),v=performance.now(),view=await engine.run({id:'view',imageId:'i',operation,params:{mode:operation==='tampering.contrast'?1:3}}),viewMs=performance.now()-v;
   if(!view.metrics.cache.analysis)throw new Error('Cached view unexpectedly recomputed');row.samples.push({loadMs,rpcMs,displayMs,pipelineMs:loadMs+rpcMs+displayMs,viewMs,metrics:r.metrics});await engine.unload('i');console.log('Measured',operation,cpuKernel,i,JSON.stringify({loadMs,rpcMs,displayMs,viewMs}));
  }row.medianRpcMs=median(row.samples.map(s=>s.rpcMs));row.medianPipelineMs=median(row.samples.map(s=>s.pipelineMs));report.results.push(row);}finally{engine.dispose();}
 }return report;
}
