import {createWorkerEngine} from '../src/worker-client.js';
import {noisesnifferLargeInput} from '../tests/noisesniffer-large-input.js';
import {noisesnifferParameters,noisesnifferRegionsEqual} from '../tests/noisesniffer-corpus.js';
const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
const sha=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.buffer,a.byteOffset,a.byteLength))),x=>x.toString(16).padStart(2,'0')).join('');
function present(pixels){const t=performance.now(),canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;const rgba=new Uint8ClampedArray(pixels.width*pixels.height*4);for(let i=0,j=0;i<pixels.data.length;i+=3,j+=4){rgba[j]=pixels.data[i];rgba[j+1]=pixels.data[i+1];rgba[j+2]=pixels.data[i+2];rgba[j+3]=255;}canvas.getContext('2d').putImageData(new ImageData(rgba,pixels.width,pixels.height),0,0);document.body.appendChild(canvas);canvas.getBoundingClientRect();canvas.remove();return performance.now()-t;}
export async function noisesnifferBenchmark({samples=3,cpuKernel='single'}={}){
 const reference=await(await fetch('/fixtures/noisesniffer-large-reference.json')).json(),image=noisesnifferLargeInput(reference),report={schema:1,scope:'Sequential synthetic 1024x1024 full resolution, native checksums outside timed sections; includes worker RPC, copies, preparation and raster presentation; no physical-device claim',cpuKernel,results:[]};
 if(await sha(image.data)!==reference.inputSha256)throw Error('Noisesniffer benchmark recipe');
 for(const f of reference.cases){const engine=createWorkerEngine({computeProfile:'maximum',cpuKernel}),rows=[];let cold;
  try{
   for(let i=-1;i<samples;i++){
    let t=performance.now();await engine.load({id:'i',bytes:image.data,pixels:image});const loadMs=performance.now()-t,task={id:'ns',imageId:'i',operation:'noise.noisesniffer',params:noisesnifferParameters(f.parameters)};
    t=performance.now();const result=await engine.run(task),rpcMs=performance.now()-t;const presentationMs=present(result.pixels);
    for(const [key,hash] of Object.entries(f.arrays))if(await sha(key==='overlay'?result.pixels.data:result.data[key])!==hash)throw Error('Native Noisesniffer benchmark '+f.block+' '+key);
    noisesnifferRegionsEqual(result.data.metadata.regions,f.regions);
    t=performance.now();const cached=await engine.run({...task,params:{...task.params,view:'distribution'}}),viewRpcMs=performance.now()-t;if(!cached.metrics.cache.analysis)throw Error('Noisesniffer view cache');
    const row={loadMs,rpcMs,presentationMs,pipelineMs:loadMs+rpcMs+presentationMs,viewRpcMs,metrics:result.metrics};if(i<0)cold=row;else rows.push(row);await engine.unload('i');console.log('Noisesniffer',f.block,i,JSON.stringify({rpcMs,viewRpcMs}));
   }
   report.results.push({block:f.block,cold,samples:rows,medianRpcMs:median(rows.map(r=>r.rpcMs)),medianPipelineMs:median(rows.map(r=>r.pipelineMs))});
  }finally{engine.dispose();}
 }
 return report;
}
