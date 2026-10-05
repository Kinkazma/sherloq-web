// Real RGB -> native letterbox WASM -> YOLO -> NMS/coordinates in a browser.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),ortRoot=process.env.FORGERYSCOPE_ORT_DIST;
if(!ortRoot)throw Error('Set FORGERYSCOPE_ORT_DIST (read-only ORT dist).');
const provider=process.argv.includes('--gpu')?'webgpu':'wasm';
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Forgeryscope YOLO study</title>');return;}const base=path.resolve(name.startsWith('/ort/')?ortRoot:root),file=path.resolve(base,'.'+(name.startsWith('/ort/')?name.slice(4):name));if(!file.startsWith(base+path.sep))throw Error('path');res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',x=>{if(x.type()==='error')console.log(x.text());});await page.goto(`http://127.0.0.1:${server.address().port}`);
 const report=await page.evaluate(async provider=>{
  const ort=await import('/ort/'+(provider==='wasm'?'ort.wasm.min.mjs':'ort.webgpu.min.mjs'));ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths='/ort/';
  const {default:create}=await import('/.build/forgeryscope/prepare.mjs'),m=await create();
  const {decodeForgeryscopeYolo}=await import('/src/forgeryscope-yolo.js'),base='/.build/forgeryscope/',ref=await(await fetch(base+'yolo-reference.json')).json(),records=[];
  const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
  for(const model of ref.models){
   const bytes=new Uint8Array(await(await fetch(base+model.file)).arrayBuffer());if(await hash(bytes)!==model.sha256)throw Error('Model identity');
   const session=await ort.InferenceSession.create(bytes,{executionProviders:[provider],graphOptimizationLevel:'all'});
   try{for(const c of model.cases){
    const rgb=new Uint8Array(await(await fetch(base+c.rgbFile)).arrayBuffer()),expected=new Float32Array(await(await fetch(base+c.inputFile)).arrayBuffer()),prediction=new Float32Array(await(await fetch(base+c.outputFile)).arrayBuffer());
    const src=m._malloc(rgb.length),out=m._malloc(3*640*640*4),dims=m._malloc(8);let data;
    try{m.HEAPU8.set(rgb,src);if(!m._fg_yolo_prepare(src,c.width,c.height,640,model.stride,out,dims))throw Error('Preparation');if(m.HEAP32[dims/4]!==c.inputShape[3]||m.HEAP32[dims/4+1]!==c.inputShape[2])throw Error('Shape');data=m.HEAPF32.slice(out/4,out/4+expected.length);}finally{m._free(dims);m._free(out);m._free(src);}
    let prepDifferences=0;for(let i=0;i<data.length;i++)prepDifferences+=data[i]!==expected[i];
    const params={anchors:c.outputShape[2],classes:c.outputShape[1]-4,width:c.width,height:c.height,inputWidth:c.inputShape[3],inputHeight:c.inputShape[2],kind:model.id.includes('panel')?'panels':'lanes'};
    const nativePost=await decodeForgeryscopeYolo(prediction,params);
    const start=performance.now(),input=new ort.Tensor('float32',data,c.inputShape),output=await session.run({rgb:input}),actual=output.predictions.data;
    let maxRawBoxError=0,maxRawScoreError=0;for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-prediction[i]);if(i<4*params.anchors)maxRawBoxError=Math.max(maxRawBoxError,error);else maxRawScoreError=Math.max(maxRawScoreError,error);}
    const boxes=await decodeForgeryscopeYolo(actual,params);
    const error=(a,b)=>a.length!==b.length?null:Math.max(0,...a.flatMap((row,i)=>row.map((v,k)=>Math.abs(v-b[i][k]))));
    records.push({model:model.id,case:c.id,prepDifferences,maxRawBoxError,maxRawScoreError,nativePostError:error(nativePost,c.boxes),finalBoxError:error(boxes,c.boxes),nativeBoxes:c.boxes,boxes,sameRetainedClasses:boxes.length===c.boxes.length&&boxes.every((b,i)=>b[5]===c.boxes[i][5]),cropCoordinateDifferences:boxes.length===c.boxes.length?boxes.reduce((n,b,i)=>n+b.slice(0,4).filter((v,k)=>Math.trunc(v)!==Math.trunc(c.boxes[i][k])).length,0):null,ms:performance.now()-start});input.dispose();output.predictions.dispose();
   }}finally{await session.release();}
  }
  return{provider,scope:'synthetic and public-example RGB to YOLO boxes; public panel filter and complete Forgeryscope not enabled',runtime:ort.env.versions,native:{torch:ref.torch,ultralytics:ref.ultralytics,opencv:ref.opencv},models:ref.models.map(({id,sha256,checkpointSha256,bytes})=>({id,sha256,checkpointSha256,bytes})),records};
 },provider);
 report.browser=browser.version();report.executionNote=provider==='webgpu'?'WebGPU requested; ORT may assign unsupported nodes to CPU. Inspect provider logs; no GPU-only claim.':'CPU/WASM';report.passed=report.records.every(r=>r.prepDifferences===0&&r.nativePostError===0&&r.finalBoxError!==null&&r.finalBoxError<=1e-4);
 await writeFile(path.join(root,`docs/forgeryscope-yolo-${provider}-proof.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
