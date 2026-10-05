// Development-only useful-work comparison: new browser context, no warm-up,
// and time includes module loading, compilation, preparation and final fields.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium,firefox,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),records=[],browserName=process.env.DENSE_SIMD_BROWSER??'chromium';
const browserType={chromium,firefox,webkit}[browserName];if(!browserType)throw Error('Unknown DENSE_SIMD_BROWSER.');
const server=createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://localhost').pathname;
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Dense SIMD regression</title>');return;}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root))throw Error('Invalid path');
  res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':/\.(m?js)$/.test(file)?'text/javascript':'application/octet-stream');
  res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await browserType.launch({...(browserName==='chromium'?{channel:'chrome'}:{}),headless:true});
 for(const configuration of [{width:192,height:144,patch:8,method:0,reflection:true},{width:131,height:113,patch:8,method:1,reflection:true}])for(const variant of ['scalar','simd']){
  const context=await browser.newContext();
  try{
   const page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
   records.push(await page.evaluate(async({configuration,variant})=>{
    const begin=performance.now(),{createDenseMath}=await import('/src/dense-math.js'),math=await createDenseMath({wasmVariant:variant,print:()=>{}}),setupMs=performance.now()-begin;
    const {width,height,...options}=configuration,gray=Float32Array.from({length:width*height},(_,i)=>(i*37+i%17*23)%256),featureStart=performance.now();
    const descriptors=math.features(gray,width,height,options),descriptorsMs=performance.now()-featureStart,mask=Uint8Array.from({length:descriptors.width*descriptors.height},(_,i)=>i%13?1:0),fieldStart=performance.now();
    const field=math.field(descriptors.first,descriptors.second,mask,descriptors.width,descriptors.height,{dimensions:descriptors.dimensions,minimum:5,radius:30,iterations:2}),fieldMs=performance.now()-fieldStart,totalMs=performance.now()-begin;
    const digest=async values=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',values))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    const hashes={};for(const [name,values]of Object.entries({first:descriptors.first,second:descriptors.second,targets:field.targets,distancesSquared:field.distancesSquared}))hashes[name]=await digest(values);
    return {...configuration,variant,setupMs,descriptorsMs,fieldMs,totalMs,comparisons:String(field.comparisons),hashes};
   },{configuration,variant}));
  }finally{await context.close();}
 }
 for(let i=0;i<records.length;i+=2){assert.deepEqual(records[i].hashes,records[i+1].hashes);assert.equal(records[i].comparisons,records[i+1].comparisons);}
 const report={browser:browser.version(),browserName,preflightExecutions:0,warmupExecutions:0,timingScope:'Module load + compile + instance + input preparation + descriptors + final global field; comparison hashes afterwards',records,passed:true};
 if(process.env.DENSE_SIMD_REPORT)await writeFile(process.env.DENSE_SIMD_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
