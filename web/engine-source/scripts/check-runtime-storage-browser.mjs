import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,firefox,webkit} from 'playwright';
const browserName=process.argv.find(x=>x.startsWith('--browser='))?.split('=')[1]??'chrome',isolated=!process.argv.includes('--no-isolation');
const root=fileURLToPath(new URL('../',import.meta.url)),language=await readFile(process.env.TESSDATA_ENG??'/opt/homebrew/share/tessdata/eng.traineddata'),sha256=createHash('sha256').update(language).digest('hex');
const server=createServer(async(req,res)=>{
 if(isolated){res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');}
 try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Runtime storage regression</title>');return;}if(req.url==='/language'){res.end(language);return;}const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw Error('path');res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 const launcher={chrome:chromium,firefox,webkit}[browserName];if(!launcher)throw Error('Unknown browser');browser=await launcher.launch(browserName==='chrome'?{channel:'chrome',headless:true}:{headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const storage=await page.evaluate(async()=>{
  const reports=[];for(const backend of ['auto','indexeddb']){const worker=new Worker('/tests/runtime-storage-worker.js',{type:'module'});try{const report=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>resolve(data);worker.onerror=e=>reject(Error(e.message));worker.postMessage({backend});});if(!report.ok)throw Error(JSON.stringify(report));reports.push(report);}finally{worker.terminate();}}return reports;
 });
 const ocr=await page.evaluate(async sha256=>{
  const {Budget}=await import('/src/cache.js'),{TextRegionEngine}=await import('/src/text-ocr.js');
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,768,192);context.font='bold 44px sans-serif';context.fillStyle='black';context.fillText('SHERLOQ TEXT ANALYSIS',28,74);context.font='32px sans-serif';context.fillText('Original pixels remain identical',28,136);
  const rgba=context.getImageData(0,0,768,192).data,rgb=new Uint8Array(768*192*3);for(let i=0;i<768*192;i++)rgb.set(rgba.subarray(i*4,i*4+3),i*3);
  const budget=new Budget(768*1024**2),engine=new TextRegionEngine(budget,{maxWorkers:1}),image={width:768,height:192,format:'rgb8',data:rgb},language={data:new Uint8Array(await(await fetch('/language')).arrayBuffer()),sha256};
  let direct,rows,reads=0,maxRows=0;
  try{
   direct=await engine.detect(image,{language});if(!direct.boxes.length)throw Error('Actual Tesseract must recognize text');
   const windowed={format:'rgb8',width:768,height:192,async readWindow(rect){reads++;maxRows=Math.max(maxRows,rect.height);if(rect.height===192)throw Error('Full RGB materialization');const free=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)data.set(rgb.subarray(((rect.y+y)*768+rect.x)*3,((rect.y+y)*768+rect.x+rect.width)*3),y*rect.width*3);return {pixels:{format:'rgb8',width:rect.width,height:rect.height,data},release:free};}};
   rows=await engine.detect(windowed,{language});if(JSON.stringify(rows.boxes)!==JSON.stringify(direct.boxes)||JSON.stringify(rows.polygons)!==JSON.stringify(direct.polygons))throw Error('Row source changed actual OCR results');
   const boxes=direct.boxes.length;direct.release();direct=null;rows.release();rows=null;if(budget.total())throw Error('OCR budget leak');return {boxes,exactRowsParity:true,reads,maxRows,preflightExecutions:0};
  }finally{direct?.release();rows?.release();engine.dispose();}
 },sha256);
 console.log(JSON.stringify({browserName,browser:browser.version(),isolated,storage,ocr}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
