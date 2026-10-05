import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),languagePath=process.env.TESSDATA_ENG??'/opt/homebrew/share/tessdata/eng.traineddata',language=await readFile(languagePath),sha256=createHash('sha256').update(language).digest('hex');
const server=createServer(async(req,res)=>{
 try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>M3 OCR verification</title>');return;}if(req.url==='/language'){res.end(language);return;}
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw Error('path');
 res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[extname(path)]??'application/octet-stream');res.end(await readFile(path));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('pageerror',e=>console.error(e));await page.goto('http://127.0.0.1:'+server.address().port);
 const report=await page.evaluate(async sha256=>{
  const {TextRegionEngine}=await import('/src/text-ocr.js'),native=await(await fetch('/.build/m3/ocr-native.json')).json(),rgb=new Uint8Array(await(await fetch('/.build/m3/ocr.rgb')).arrayBuffer()),data=new Uint8Array(await(await fetch('/language')).arrayBuffer());
  const budget={limit:512*1024**2,retained:0,active:0,peak:0,reserve(n){if(this.active+n>this.limit){const e=Error('budget');e.code='MEMORY_LIMIT';throw e;}this.active+=n;this.peak=Math.max(this.peak,this.active);let freed=false;return ()=>{if(!freed){freed=true;this.active-=n;}};}};
  const engine=new TextRegionEngine(budget,{maxWorkers:2}),image={width:native.width,height:native.height,format:'rgb8',data:rgb},progress=[];
  const output=await engine.detect(image,{language:{data,sha256},onProgress:x=>progress.push(x.fraction)}),actual=output.boxes.map(b=>b.bounds),expected=native.boxes.map(b=>b.bounds);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Native exclusion bounds differ: '+JSON.stringify(actual));
  const metadata=output.metadata,confidenceDifferences=output.boxes.map((b,i)=>b.confidence-native.boxes[i].confidence);output.release();if(budget.active!==0)throw Error('Reservation leak after OCR');
  if(progress.some((x,i)=>i&&x<progress[i-1])||progress.at(-1)!==1)throw Error('Progress');
  const cancel=new AbortController();let cancelled=false;
  const pending=engine.detect(image,{language:{data,sha256},signal:cancel.signal,onProgress:()=>cancel.abort()});
  try{await pending;}catch(error){if(error.code!=='CANCELLED')throw error;cancelled=true;}
  if(!cancelled||budget.active!==0||engine.workers.size!==0)throw Error('Cancellation lifecycle');
  const early=new AbortController(),timer=setTimeout(()=>early.abort(),5);try{await engine.detect(image,{language:{data,sha256},signal:early.signal});throw Error('Expected early cancellation');}catch(error){if(error.code!=='CANCELLED'&&error.name!=='AbortError')throw error;}finally{clearTimeout(timer);}
  if(budget.active!==0||engine.workers.size!==0)throw Error('Initialization cancellation leak');
  const scalar=await engine.detect(image,{language:{data,sha256},backend:'scalar'});if(JSON.stringify(scalar.boxes.map(b=>b.bounds))!==JSON.stringify(expected))throw Error('Scalar bounds');scalar.release();scalar.release();if(budget.active!==0)throw Error('Scalar reservation leak');engine.dispose();
  return {status:'passed',boxes:actual.length,nativeExclusionBoundsEqual:true,confidenceDifferences,metadata,cancellation:true,initializationCancellation:true,scalar:true,peakReservedBytes:budget.peak};
 },sha256);
 report.browser=browser.version();await writeFile(new URL('../docs/m3-text-ocr-chrome-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
