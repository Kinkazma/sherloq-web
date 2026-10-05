import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),withPatchMatch=process.argv.includes('--patchmatch'),fromRgb=process.argv.includes('--prepare');
const sourceFiles=['experiments/d2prl/descriptors.js','experiments/d2prl/feature-math.js','experiments/d2prl/convolution-gpu.js','fixtures/d2prl/gemm-layout-all.json'];
if(withPatchMatch)sourceFiles.push(...['patchmatch.js','candidates.js','random.js','evaluator-pool.js','evaluator-worker.js'].map(f=>'experiments/d2prl/'+f));
if(fromRgb)sourceFiles.push('experiments/d2prl/prepare.js');
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceHashes={};for(const file of sourceFiles)sourceHashes[file]=hash(await readFile(path.join(root,file)));
const server=createServer(async(req,res)=>{try{
 const name=new URL(req.url,'http://local').pathname;
 if(name==='/')return res.end('<!doctype html><title>D2PRL composed descriptors</title>');
 if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
 const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error('Path');
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('console',m=>console.log(m.text()));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async({withPatchMatch,fromRgb})=>{
  const {Budget}=await import('/src/cache.js'),{createConvolutionGpu}=await import('/experiments/d2prl/convolution-gpu.js'),{createFeatureMath}=await import('/experiments/d2prl/feature-math.js'),{createDescriptors}=await import('/experiments/d2prl/descriptors.js'),{default:factory}=await import('/.build/d2prl-feature-math/feature-math.js');
  const hash=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(a.buffer,a.byteOffset,a.byteLength))),x=>x.toString(16).padStart(2,'0')).join('');
  const json=async url=>(await fetch(url)).json();
  const conv=await json('/.build/d2prl-convolution/all-reference.json'),bn=await json('/.build/d2prl-batchnorm/reference.json'),model=await json('/.build/d2prl-model/reference.json'),layout=await json('/fixtures/d2prl/gemm-layout-all.json');
  const read=async(base,e,Type=Float32Array)=>{const res=await fetch(base+e.file);if(!res.ok)throw Error('Missing fixture');const bytes=new Uint8Array(await res.arrayBuffer());if(await hash(bytes)!==e.sha256)throw Error('Fixture identity');return new Type(bytes.buffer);};
  const budget=new Budget(2048*1024**2),gpu=await createConvolutionGpu({budget}),math=await createFeatureMath(factory,{budget}),records=[];
  const loadConvolution=async name=>{const r=conv.records.find(r=>r.name===name);if(!r)throw Error('Missing convolution');return {weights:await read('/.build/d2prl-convolution/',r.weights),bias:await read('/.build/d2prl-convolution/',r.bias),channels:r.input.shape[1],height:r.input.shape[2],width:r.input.shape[3],outChannels:r.weights.shape[0],kernel:r.weights.shape[2],padding:r.padding,referenceLayout:layout.records.find(r=>r.name===name)};};
  const loadBatchNorm=async name=>{const r=bn.records.find(r=>r.name===name);return {params:await read('/.build/d2prl-batchnorm/',r.params),epsilon:r.epsilon};};
  const compare=async(name,actual,expected)=>{
   if(actual.length!==expected.length)throw Error('Shape '+name);
   const ab=new (actual instanceof Uint16Array?Uint16Array:Uint32Array)(actual.buffer,actual.byteOffset,actual.length),eb=new (actual instanceof Uint16Array?Uint16Array:Uint32Array)(expected.buffer,expected.byteOffset,expected.length);
   let different=0,maxAbs=0,nonfinite=0;const first=[];
   for(let i=0;i<actual.length;i++){if(ab[i]!==eb[i]){different++;if(first.length<8)first.push({index:i,actual:actual[i],expected:expected[i]});}maxAbs=Math.max(maxAbs,Math.abs(actual[i]-expected[i]));nonfinite+=!Number.isFinite(actual[i]);}
   const row={name,elements:actual.length,different,maxAbs,nonfinite,first};records.push(row);console.log(JSON.stringify(row));
  };
  const onStage=async(name,data)=>{
   const [side,kind,part]=name.split('-');let expected;
   if(part==='float'){
    const idx=kind==='zm'?0:1,full=await read('/.build/d2prl-model/',model.descriptors[idx]),n=(kind==='zm'?12:32)*448*448,start=[597,448,298].indexOf(Number(side))*n;expected=full.subarray(start,start+n);
   }else if(kind==='relu')expected=await read('/.build/d2prl-batchnorm/',bn.records.find(r=>r.name===side+'-cnn-'+part).relu);
   else if(kind==='input')expected=await read('/.build/d2prl-convolution/',conv.records.find(r=>r.name===side+'-zm-real').input);
   else if(kind==='cnn'&&part==='input')expected=await read('/.build/d2prl-convolution/',conv.records.find(r=>r.name===side+'-cnn-0').input);
   else expected=await read('/.build/d2prl-convolution/',conv.records.find(r=>r.name===name).output);
   await compare(name,data,expected);
  };
  const pipeline=createDescriptors({convolution:gpu,math,budget,loadConvolution,loadBatchNorm});let result,pmEngine,pmResult,pool,prepared,preparation;
  try{
   let input=await read('/.build/d2prl-model/',model.input);if(fromRgb){const {createPreparation}=await import('/experiments/d2prl/prepare.js'),{default:prepareFactory}=await import('/.build/d2prl-prepare/prepare.js');preparation=await createPreparation(prepareFactory,{budget});const rgb=await read('/.build/d2prl-model/',model.source,Uint8Array);prepared=await preparation.run({rgb,height:model.source.shape[0],width:model.source.shape[1]});await compare('prepared-rgb448',prepared.data,input);input=prepared.data;preparation.dispose();}const start=performance.now();result=await pipeline.run(input,{onStage});const functionalMs=performance.now()-start;
   await compare('combined-zm-half',result.zm,await read('/.build/d2prl-model/',model.features[0],Uint16Array));
   await compare('combined-cnn-half',result.cnn,await read('/.build/d2prl-model/',model.features[1],Uint16Array));
   gpu.dispose();math.dispose();let patchmatch=null;
   if(withPatchMatch){
    const {createPatchMatch}=await import('/experiments/d2prl/patchmatch.js'),{createEvaluatorPool}=await import('/experiments/d2prl/evaluator-pool.js'),random=await json('/fixtures/d2prl/random.json');
    pmEngine=await createPatchMatch(null,{budget,evaluatorFactory:async(_,{budget})=>pool=await createEvaluatorPool(new URL('/.build/d2prl-evaluator-tiled/evaluator-tiled.js',location.href).href,{budget,maxWorkers:Math.min(32,navigator.hardwareConcurrency??1)})});
    const begin=performance.now();pmResult=await pmEngine.run({zmFeatures:result.zm,cnnFeatures:result.cnn,side:448,iterations:40,randomState:random.model.initial,referenceThreads:8},{onProgress:p=>{if(p.completed%20===0)console.log(JSON.stringify({phase:'composed-patchmatch',completed:p.completed,total:p.total}));}});
    const arrays=[pmResult.offsets.zm.x,pmResult.offsets.zm.y,pmResult.offsets.cnn.x,pmResult.offsets.cnn.y,pmResult.coordinates.zm.x,pmResult.coordinates.zm.y,pmResult.coordinates.cnn.x,pmResult.coordinates.cnn.y];
    for(let i=0;i<arrays.length;i++)await compare('composed-patchmatch-'+i,arrays[i],await read('/.build/d2prl-model/',model.patchmatch[i]));
    patchmatch={functionalMs:performance.now()-begin,evaluations:pmResult.evaluations,pool:pool.stats};pmResult.release();pmResult=null;pmEngine.dispose();
   }
   result.release();result=null;prepared?.release();prepared=null;if(budget.total()!==0)throw Error('Retained reservations');
   return{schema:1,status:records.every(r=>!r.different&&!r.nonfinite)?'passed':'rejected',scope:'Actual verified D2PRL weights, '+(fromRgb?'generated RGB bytes through qualified preparation then ':'generated RGB448 tensor through ')+ 'three scales, ordered WebGPU convolution and WASM helpers'+(withPatchMatch?' and complete 40-iteration worker PatchMatch':'')+'; no original-file decoder or final-mask claim',records,functionalMs,patchmatch,peakAccountedBytes:budget.peak,allReservationsReleased:true};
  }finally{prepared?.release();preparation?.dispose();pmResult?.release();pmEngine?.dispose();result?.release();gpu.dispose();math.dispose();}
 },{withPatchMatch,fromRgb});
 report.browser=browser.version();report.sources=sourceHashes;
 report.mathBuild=JSON.parse(await readFile(path.join(root,'.build/d2prl-feature-math/build.json')));if(fromRgb)report.preparationBuild=JSON.parse(await readFile(path.join(root,'.build/d2prl-prepare/build.json')));report.referenceSha256=hash(await readFile(path.join(root,'.build/d2prl-model/reference.json')));
 if(withPatchMatch)report.evaluatorBuild=JSON.parse(await readFile(path.join(root,'.build/d2prl-evaluator-tiled/build.json')));
 await writeFile(path.join(root,'docs/d2prl-'+(withPatchMatch?'feature-patchmatch':'descriptors')+(fromRgb?'-prepared':'')+'-composed-chrome-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.records.length}));if(report.status!=='passed')process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
