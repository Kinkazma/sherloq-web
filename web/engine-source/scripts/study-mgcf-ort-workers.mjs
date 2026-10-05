// Development recipe: actual shipped workers, no profiling/calibration in product.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),variant=process.argv[2];
if(!['mgcfdn-16','mgcfdn-effnet'].includes(variant))throw Error('Variant');
let modelRequests=0,modelBytes=0;
const server=createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/')return res.end('<!doctype html><title>MGCF actual CPU and hybrid workers</title>');
  if(name==='/counts'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({requests:modelRequests,bytes:modelBytes}));}
  if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error('Path');
  const bytes=await readFile(file);if(file.endsWith('.onnx')){modelRequests++;modelBytes+=bytes.length;}
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(bytes);
}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const conditions=[];
  // Separate pages/devices/session caches. OS/driver caches are not cleared.
  for(const backend of ['cpu','webgpu']){
    const page=await browser.newPage();page.on('console',m=>{if(m.type()==='log')console.log(m.text());});await page.goto('http://127.0.0.1:'+server.address().port);
    try{conditions.push(await page.evaluate(async({variant,backend})=>{
      const{Budget}=await import('/src/cache.js'),{createSegmentationPrepare}=await import('/experiments/segmentation/prepare.js'),{createSegmentationInference}=await import('/experiments/segmentation/inference.js'),{createSegmentationZones}=await import('/experiments/segmentation/zones.js'),{createSpatial}=await import('/experiments/d2prl/spatial.js'),{SEGMENTATION_MODELS}=await import('/experiments/segmentation/models.js');
      const base='/.build/segmentation-models/'+variant+'/',ref=await(await fetch(base+'reference.json')).json(),model=SEGMENTATION_MODELS[variant],budget=new Budget(2*1024**3),url=p=>new URL(p,location.href).href;
      const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
      const read=async s=>{const response=await fetch(base+s.file);if(!response.ok)throw Error('Fixture read');const b=await response.arrayBuffer();if(b.byteLength!==s.bytes||await hash(b)!==s.sha256)throw Error('Fixture identity');return b;};
      const compare=(a,b)=>{if(a.length!==b.length)throw Error('Shape');let maxAbs=0,sumAbs=0,different=0,finite=true;for(let i=0;i<a.length;i++){const e=Math.abs(a[i]-b[i]);maxAbs=Math.max(maxAbs,e);sumAbs+=e;different+=a[i]!==b[i];finite&&=Number.isFinite(a[i]);}return{maxAbs,meanAbs:sumAbs/a.length,different,finite};};
      const components=(mask,width)=>{const seen=new Uint8Array(mask.length),queue=new Uint32Array(mask.length),sizes=[];for(let start=0;start<mask.length;start++)if(mask[start]&&!seen[start]){let head=0,tail=1;queue[0]=start;seen[start]=1;while(head<tail){const at=queue[head++],x=at%width,y=Math.floor(at/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,index=ny*width+nx;if(nx>=0&&nx<width&&ny>=0&&index<mask.length&&mask[index]&&!seen[index]){seen[index]=1;queue[tail++]=index;}}}sizes.push(tail);}return sizes.sort((a,b)=>b-a);};
      const prepare=createSegmentationPrepare({budget}),inference=createSegmentationInference({budget,variant,backend,modelUrl:url(base+(variant==='mgcfdn-effnet'?'native-mean.onnx':'unfolded.onnx'))}),spatial=createSpatial({budget,moduleUrl:url('/vendor/d2prl/spatial.js')}),project=createSegmentationZones({budget,spatial}),records=[];
      let modelLoads=0,inferences=0;const onProgress=e=>{if(e.phase==='model-load')modelLoads++;if(e.phase==='inference')inferences++;};
      try{
        // The first three runs use identical positive input for cold/warm costs.
        // The other two complete the unchanged native corpus.
        const positive=ref.records.find(r=>r.name==='paired-spots');
        for(const[rowIndex,row]of [positive,positive,positive,...ref.records.filter(r=>r!==positive)].entries()){
          const rgb=new Uint8Array(await read(row.rgb)),[height,width]=row.rgb.shape,expectedRaw=new Float32Array(await read(row.probability)),expectedMap=new Float32Array(await read(row.sourceMap)),expectedMask=new Uint8Array(await read(row.sourceMask));
          const start=performance.now(),prepared=await prepare.run({data:rgb,width,height,side:model.side}),preparationMs=performance.now()-start;let output,result;
          try{
            const preparationExact=await hash(prepared.tensor)===row.input.sha256,before=await(await fetch('/counts')).json(),begin=performance.now();output=await inference.run(prepared.tensor,{onProgress});const inferenceMs=performance.now()-begin,after=await(await fetch('/counts')).json(),projectionStart=performance.now();
            result=await project.run({width,height,side:model.side,kind:model.kind,mode:'whole-image',zones:[{id:'whole',bounds:[0,0,width,height],raw:output.raw}]});const projectionMs=performance.now()-projectionStart,transitions=[];
            for(let i=0;i<result.mask.length;i++)if(result.mask[i]!==expectedMask[i]&&transitions.length<32)transitions.push({x:i%width,y:Math.floor(i/width),native:expectedMask[i],browser:result.mask[i],nativeMap:expectedMap[i],browserMap:result.map[i]});
            const record={name:row.name,run:rowIndex,kind:rowIndex===0?'cold':rowIndex<3?'warm':'corpus',preparationExact,preparationMs,inferenceMs,projectionMs,totalMs:preparationMs+inferenceMs+projectionMs,modelRequests:after.requests-before.requests,modelBytes:after.bytes-before.bytes,probability:compare(output.raw,expectedRaw),map:compare(result.map,expectedMap),mask:compare(result.mask,expectedMask),maskTransitions:transitions,components8:{native:components(expectedMask,width),browser:components(result.mask,width)},foreground:result.mask.reduce((n,v)=>n+v,0),rawSha256:await hash(output.raw),heapBytes:output.heapBytes,gpu:output.gpu,timings:output.timings,memory:budget.snapshot()};
            records.push(record);console.log(JSON.stringify({variant,backend,name:row.name,run:rowIndex,milliseconds:inferenceMs,probability:record.probability,mask:record.mask}));
          }finally{result?.release();output?.release();prepared.release();}
        }
      }finally{inference.dispose();prepare.dispose();spatial.dispose();}
      if(budget.total()!==0)throw Error('Ownership leak');
      const accepted=records.length===5&&modelLoads===1&&inferences===5&&records.slice(1).every(r=>r.modelRequests===0)&&records.every(r=>r.preparationExact&&r.probability.finite&&r.map.finite&&r.probability.maxAbs<=1e-4&&r.map.maxAbs<=1e-4&&r.mask.different<=(variant==='mgcfdn-effnet'&&backend==='webgpu'&&r.name==='paired-spots'?1:0));
      return{backend,status:accepted?'passed-declared-corpus':'rejected',records,modelLoads,inferences,memory:budget.snapshot()};
    },{variant,backend}));}finally{await page.close();}
  }
  const report={schema:1,status:conditions.every(c=>c.status==='passed-declared-corpus')?'passed':'rejected',variant,browser:browser.version(),scope:'Actual production CPU and WebGPU/WASM workers, fixed float32 network input and same 2GiB budget. One positive cold/two warm useful inferences then remaining synthetic corpus; exact preparation, continuous max/mean and projected mask/component differences. No profiler. GPU512MiB and WASM512MiB bounded, parameters loaded once. Fresh page per backend, shared host and OS/driver caches retained. Development fixture/oracle and comparison arrays outside product budget; no RSS claim. Not common API or 96MP qualification.',conditions,sources:{}};
  for(const file of ['scripts/study-mgcf-ort-workers.mjs','experiments/segmentation/models.js','experiments/segmentation/inference.js','experiments/segmentation/inference-worker.js','experiments/segmentation/inference-gpu-worker.js','experiments/segmentation/gpu-budget.js','experiments/segmentation/prepare.js','experiments/segmentation/zones.js','vendor/segmentation/PINNED.json','vendor/d2prl/PINNED.json'])report.sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
  await writeFile(path.join(root,'docs/mgcf-ort-'+variant+'-workers-proof.json'),JSON.stringify(report,null,2)+'\n');if(report.status!=='passed')process.exitCode=1;console.log(report.status);
}finally{await browser?.close();await new Promise(r=>server.close(r));}
