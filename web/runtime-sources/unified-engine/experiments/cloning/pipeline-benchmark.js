// Offline measurement of requested work; never a product preflight.
import {createWorkerEngine} from '../../src/worker-client.js';
const ensure=(v,m)=>{if(!v)throw Error(m);},median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)],hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
function display(pixels){const t=performance.now(),canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;const rgba=new Uint8ClampedArray(pixels.width*pixels.height*4);for(let i=0;i<rgba.length/4;i++){rgba[i*4]=pixels.data[i*3];rgba[i*4+1]=pixels.data[i*3+1];rgba[i*4+2]=pixels.data[i*3+2];rgba[i*4+3]=255;}canvas.getContext('2d').putImageData(new ImageData(rgba,pixels.width,pixels.height),0,0);document.body.appendChild(canvas);canvas.getBoundingClientRect();canvas.remove();return performance.now()-t;}
export async function cloningPipelineBenchmark(algorithm='ORB'){
  ensure(algorithm==='ORB'||algorithm==='AKAZE','Explicit detector');
  const base=algorithm==='ORB'?'/.build/cloning-study/':'/.build/akaze-pipeline-study/',reference=await(await fetch(base+'api-reference.json')).json(),report={schema:1,algorithm,scope:'Three alternating single/auto cold useful runs, one warm image reload and cache-only style/minimum change for each mode. Worker startup included. Canvas submission is illustrative display time, not physical paint or WordPress. Accounted memory is not RSS. No preflight or discarded warm-up.',cases:[]};
  for(const [name,matching]of algorithm==='ORB'?[['shapes',35],['large-checker',20]]:[['clone-512-384',20],['large-clone',20]]){
    const native=reference.find(x=>x.image===name&&x.mask==='all'&&x.params.response===90&&x.params.matching===matching&&x.params.minimum===5&&!x.params.showPoints&&!x.params.hideLines&&x.params.distance===15),image=await(await fetch(base+name+'.png')).blob(),expected=await hash(await(await fetch(base+native.prefix+'.rgb')).arrayBuffer()),task={id:algorithm.toLowerCase(),imageId:'image',operation:'tampering.copyMove.'+algorithm.toLowerCase(),params:native.params},samples=[];
    for(let sample=0;sample<3;sample++)for(const cpuKernel of sample%2?['auto','single']:['single','auto']){
      const engine=createWorkerEngine({memoryBudgetBytes:1024**3,computeProfile:'maximum',cpuKernel});
      try{
        let t=performance.now();await engine.loadBlob({id:'image',blob:image});const imageLoadMs=performance.now()-t;t=performance.now();const result=await engine.run(task),rpcMs=performance.now()-t,presentationMs=display(result.pixels);ensure(await hash(result.pixels.data)===expected,'Native RGB identity');const record={sample,cpuKernel,imageLoadMs,rpcMs,presentationMs,pipelineMs:imageLoadMs+rpcMs+presentationMs,transportSchedulingMs:rpcMs-result.metrics.totalMs,metrics:result.metrics};
        if(sample===0){
          t=performance.now();const style=await engine.run({...task,params:{...task.params,hideLines:true}});record.styleReuseRpcMs=performance.now()-t;record.styleMetrics=style.metrics;ensure(style.metrics.cache.result,'Style reused analysis');
          t=performance.now();const minimum=await engine.run({...task,params:{...task.params,minimum:6}});record.minimumReuseRpcMs=performance.now()-t;record.minimumMetrics=minimum.metrics;ensure(minimum.metrics.cloningClusteringMs===0&&minimum.metrics.cloningMatchingMs===0,'Minimum reuses geometry');
          await engine.unload('image');t=performance.now();await engine.loadBlob({id:'image',blob:image});record.warmLoadMs=performance.now()-t;t=performance.now();const warm=await engine.run(task);record.warmRpcMs=performance.now()-t;record.warmMetrics=warm.metrics;ensure(!warm.metrics.cache.result&&await hash(warm.pixels.data)===expected,'Useful warm exact run');
        }
        await engine.unload('image');record.cleanup=(await engine.capabilities()).memory;ensure(!record.cleanup.retainedBytes&&!record.cleanup.cacheBytes&&!record.cleanup.activeReservationBytes,'Cleanup');samples.push(record);
      }finally{await engine.dispose();}
    }
    const summary=['single','auto'].map(cpuKernel=>{const rows=samples.filter(x=>x.cpuKernel===cpuKernel);return {cpuKernel,...Object.fromEntries(['imageLoadMs','rpcMs','pipelineMs','presentationMs','transportSchedulingMs'].map(k=>['median'+k[0].toUpperCase()+k.slice(1),median(rows.map(x=>x[k]))])),clusteringMedianMs:median(rows.map(x=>x.metrics.cloningClusteringMs)),workers:rows.map(x=>x.metrics.cloningGroupWorkers??1),peakAccountedBytes:Math.max(...rows.map(x=>x.cleanup.peakAccountedBytes))};});report.cases.push({name,params:native.params,nativeRgbSha256:expected,samples,summary});
  }
  report.runtimeFiles={};for(const file of ['src/cloning.js','src/cloning-post.js','src/cloning-math.js','src/cloning-group-pool.js','src/cloning-group-worker.js','vendor/cloning/cloning.js','vendor/cloning/cloning.wasm'])report.runtimeFiles[file]=await hash(await(await fetch('/'+file)).arrayBuffer());
  return report;
}
