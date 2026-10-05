import {createWorkerEngine} from '../src/worker-client.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join('');
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)];
function display(p){const start=performance.now(),canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;const rgba=new Uint8ClampedArray(p.width*p.height*4);for(let i=0,j=0;i<p.data.length;i+=3,j+=4){rgba.set(p.data.subarray(i,i+3),j);rgba[j+3]=255;}canvas.getContext('2d').putImageData(new ImageData(rgba,p.width,p.height),0,0);return performance.now()-start;}
export async function comparisonBenchmark({samples=3}={}){
 const f=(await(await fetch('/fixtures/comparison-reference.json')).json()).cases.find(f=>f.name==='megapixel'),a=await read(f.first),b=await read(f.second),engine=createWorkerEngine({computeProfile:'maximum',cpuKernel:'single'}),report={schema:1,scope:'Sequential full-resolution 1024x1024 synthetic pair; all 20 metrics. Original bytes and explicit RGB8 inputs. RPC includes copies/transfers; raster presentation separate. No WordPress, physical-device or speedup claim.',samples:[]};
 try{
  for(let i=-1;i<samples;i++){
   const start=performance.now();await engine.load({id:'i',bytes:a,pixels:{width:f.width,height:f.height,format:'rgb8',data:a}});await engine.load({id:'r',bytes:b,pixels:{width:f.width,height:f.height,format:'rgb8',data:b}});const loadMs=performance.now()-start,t=performance.now(),r=await engine.run({id:'all',imageId:'i',operation:'comparison.image',params:{referenceImageId:'r',metrics:true}}),rpcMs=performance.now()-t;
   for(const [name,value] of Object.entries(f.values)){const actual=r.data.values[name];if(['ssimul','butter'].includes(name)?actual!==value:Math.abs(actual-value)>1e-12*Math.max(1,Math.abs(value)))throw new Error('Benchmark native metric '+name);}
   if(await hash(r.pixels.data)!==f.views.find(v=>v.mode==='normal'&&!v.equalized&&!v.grayscale).sha256)throw new Error('Benchmark native view');
   const displayMs=display(r.pixels),views=[];
   for(const view of ['difference','ssim','butter']){const at=performance.now(),result=await engine.run({id:'view',imageId:'i',operation:'comparison.image',params:{referenceImageId:'r',metrics:true,view}});views.push({view,rpcMs:performance.now()-at,stages:result.metrics.cache.stages});if(await hash(result.pixels.data)!==f.views.find(v=>v.mode===view&&!v.equalized&&!v.grayscale).sha256)throw new Error('Benchmark native '+view);}
   const row={loadMs,rpcMs,displayMs,pipelineMs:loadMs+rpcMs+displayMs,views,metrics:r.metrics};if(i<0)report.cold=row;else report.samples.push(row);await engine.unload('i');await engine.unload('r');console.log('Comparison measured',i,JSON.stringify({loadMs,rpcMs,displayMs,stages:r.metrics.stages}));
  }
  report.medianRpcMs=median(report.samples.map(x=>x.rpcMs));report.medianPipelineMs=median(report.samples.map(x=>x.pipelineMs));report.capabilities=await engine.capabilities();return report;
 }finally{engine.dispose();}
}
