import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex'),files=['experiments/d2prl/unet-graph.js','experiments/d2prl/convolution-general-gpu.js','experiments/d2prl/neural-math.js'],sources={};for(const file of files)sources[file]=hash(await readFile(path.join(root,file)));
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://local').pathname;if(name==='/')return res.end('<!doctype html><title>UNet composition resource lifecycle</title>');if(name==='/favicon.ico'){res.statusCode=204;return res.end();}const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error('Path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async()=>{
  const {Budget}=await import('/src/cache.js'),{createConvolutionGeneralGpu}=await import('/experiments/d2prl/convolution-general-gpu.js'),{createNeuralMath}=await import('/experiments/d2prl/neural-math.js'),{createUnetGraph}=await import('/experiments/d2prl/unet-graph.js'),{default:factory}=await import('/.build/d2prl-neural-math/neural-math.js');
  const budget=new Budget(128*1024**2),gpu=await createConvolutionGeneralGpu({budget}),math=await createNeuralMath(factory,{budget});
  // A generated one-layer channel-selector graph exercises the same graph
  // lifecycle. It is not a numerical qualification of the trained UNet.
  const graph={schema:1,status:'unqualified-experimental-graph',input:'rgb',inputShape:[1,3,448,448],output:'out',parameters:{weight:{shape:[1,3,1,1],dtype:'float32',bytes:12},bias:{shape:[1],dtype:'float32',bytes:4}},nodes:[{name:'selector',op:'Conv',inputs:['rgb','weight','bias'],outputs:['out'],attributes:{dilations:[1,1],pads:[0,0,0,0],strides:[1,1],group:1}}]};
  const rgb=new Float32Array(3*448*448);for(let i=0;i<rgb.length;i++)rgb[i]=(i%1024)/1024;
  const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),x=>x.toString(16).padStart(2,'0')).join(''),beforeHash=await digest(rgb.buffer);
  let abortOnSubmission=true,loads=0,failBias=false,busyPromise,controller=new AbortController(),engine;
  const convolution={run:(spec,options)=>gpu.run(spec,{...options,onSubmitted:()=>{if(abortOnSubmission){busyPromise=engine.run(rgb).then(r=>{r.release();return false;},e=>e.code==='BUSY');controller.abort();}}})};
  engine=createUnetGraph({graph,convolution,math,budget,layouts:{records:[]},loadParameter:async name=>{loads++;if(name==='bias'&&failBias)throw Error('Intentional parameter load failure');return name==='weight'?new Float32Array([1,0,0]):new Float32Array([0]);}});
  let result;
  try{
   let cancelled=false;try{result=await engine.run(rgb,{signal:controller.signal});}catch(e){cancelled=e.code==='CANCELLED';}result?.release();result=null;
   const busy=await busyPromise,baseline=budget.total();abortOnSubmission=false;
   result=await engine.run(rgb);const actual=result.data;let different=0;for(let i=0;i<actual.length;i++)different+=actual[i]!==rgb[i];result.release();result=null;const retryExact=different===0,retryReleased=budget.total()===baseline;
   failBias=true;let loadFailure=false;try{result=await engine.run(rgb);}catch(e){loadFailure=e.message==='Intentional parameter load failure';}result?.release();result=null;failBias=false;const failureReleased=budget.total()===baseline;
   const oldLimit=budget.limit,loadsBefore=loads;budget.limit=baseline+rgb.byteLength-1;let refused=false;try{result=await engine.run(rgb);}catch(e){refused=e.code==='MEMORY_LIMIT';}finally{result?.release();result=null;budget.limit=oldLimit;}
   const noLoadBeforeAdmission=loads===loadsBefore,refusalReleased=budget.total()===baseline,inputPreserved=await digest(rgb.buffer)===beforeHash;
   gpu.dispose();math.dispose();const released=budget.total()===0,lifecycle={cancelledAfterGpuSubmission:cancelled,busy,retryExact,retryReleased,loadFailure,failureReleased,refused,noLoadBeforeAdmission,refusalReleased,inputPreserved,released};
   return{schema:1,status:Object.values(lifecycle).every(Boolean)?'passed':'rejected',scope:'Resource lifecycle of the same graph executor on a generated fixed448 channel-selector graph; not trained-model arithmetic parity',lifecycle,peakAccountedBytes:budget.peak,budgetBytes:budget.limit};
  }finally{result?.release();gpu.dispose();math.dispose();}
 });
 report.browser=browser.version();report.sources=sources;report.mathBuild=JSON.parse(await readFile(path.join(root,'.build/d2prl-neural-math/build.json')));await writeFile(path.join(root,'docs/d2prl-unet-graph-lifecycle-chrome-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
