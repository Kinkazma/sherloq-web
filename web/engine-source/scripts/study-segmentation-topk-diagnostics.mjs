// Isolate VIG neighbourhood selection from upstream numerical drift.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),fixture=process.argv[2]??'paired-spots';
if(!['structured-copy','paired-spots'].includes(fixture))throw Error('Case');
const server=createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://local').pathname;
  if(name==='/')return res.end('<!doctype html><title>VIG neighbour diagnostic</title>');
  if(name==='/favicon.ico'){res.statusCode=204;return res.end();}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep))throw Error('Path');
  res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(await readFile(file));
}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const report=await page.evaluate(async fixture=>{
    const ort=await import('/vendor/d2prl/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths={mjs:new URL('/.build/segmentation-ort-1024/factory.mjs',location.href).href,wasm:new URL('/vendor/d2prl/ort-wasm-simd-threaded.wasm',location.href).href};
    const base='/.build/segmentation-models/mgcfdn-vig/',unitBase=base+'topk-'+fixture+'/',reference=await(await fetch(unitBase+'reference.json')).json();
    const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    const read=async(spec,prefix=unitBase)=>{const res=await fetch(prefix+spec.file);if(!res.ok)throw Error('Fixture missing');const bytes=await res.arrayBuffer();if(bytes.byteLength!==spec.bytes||await hash(bytes)!==spec.sha256)throw Error('Fixture identity');return bytes;};
    const floatStats=(a,b)=>{let different=0,maxAbs=0;for(let i=0;i<a.length;i++){different+=a[i]!==b[i];maxAbs=Math.max(maxAbs,Math.abs(a[i]-b[i]));}return{different,maxAbs,finite:a.every(Number.isFinite)};};
    const indexStats=(a,b,row,dilation=1)=>{
      const stride=row.indices.shape.slice(row.axis+1).reduce((a,b)=>a*b,1),outer=a.length/(row.k*stride);let different=0,setRows=0,missing=0;
      for(let i=0;i<a.length;i++)different+=a[i]!==b[i];
      for(let o=0;o<outer;o++)for(let p=0;p<stride;p++){
        const aa=new Set(),bb=new Set();for(let k=0;k<row.k;k+=dilation){aa.add(a[o*row.k*stride+k*stride+p]);bb.add(b[o*row.k*stride+k*stride+p]);}
        let absent=0;for(const v of bb)absent+=!aa.has(v);missing+=absent;setRows+=absent>0;
      }
      return{different,rows:outer*stride,setRows,missing,dilation};
    };
    const session=await ort.InferenceSession.create(await read(reference.model),{executionProviders:['wasm'],graphOptimizationLevel:'disabled',enableCpuMemArena:false,enableMemPattern:false});let input,output;const actual=[];
    try{
      input=new ort.Tensor('float32',new Float32Array(await read(reference.input,base)),reference.input.shape);output=await session.run({rgb:input});
      for(const row of reference.records)actual.push({input:output[row.names.input].data.slice(),indices:output[row.names.indices].data.slice()});
    }finally{input?.dispose();for(const value of Object.values(output??{}))value.dispose();await session.release();}
    const records=[];
    for(let i=0;i<reference.records.length;i++){
      const row=reference.records[i],nativeInput=new Float32Array(await read(row.input)),nativeIndices=new BigInt64Array(await read(row.indices)),dilation=i<16?Math.floor(i/4)+1:1;
      const isolated=await ort.InferenceSession.create(await read(row.unit),{executionProviders:['wasm'],graphOptimizationLevel:'disabled'});let input,output;
      try{
        input=new ort.Tensor('float32',nativeInput,row.input.shape);output=await isolated.run({input});
        records.push({index:i,node:row.node,k:row.k,actualInput:floatStats(actual[i].input,nativeInput),actualIndices:indexStats(actual[i].indices,nativeIndices,row),actualDilatedNeighbours:indexStats(actual[i].indices,nativeIndices,row,dilation),oracleInputValues:floatStats(output.values.data,new Float32Array(await read(row.values))),oracleInputIndices:indexStats(output.indices.data,nativeIndices,row),oracleDilatedNeighbours:indexStats(output.indices.data,nativeIndices,row,dilation)});
      }finally{input?.dispose();for(const value of Object.values(output??{}))value.dispose();await isolated.release();}
    }
    return{schema:1,status:'diagnostic-only',scope:'Unmodified VIG network intermediate distances/indices versus native; isolated ONNX TopK on exact native inputs distinguishes ordering from upstream drift. No oracle tensors enter the product.',case:fixture,sourceModelSha256:reference.sourceModelSha256,records};
  },fixture);
  report.browser=browser.version();report.sources={};for(const name of ['scripts/export-segmentation-topk-diagnostics.py','scripts/study-segmentation-topk-diagnostics.mjs'])report.sources[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
  await writeFile(path.join(root,'docs/segmentation-vig-'+fixture+'-topk-diagnostic.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
