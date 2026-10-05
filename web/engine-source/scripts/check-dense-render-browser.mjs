// Automated engine/API regression; does not open or reload the user's interface.
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const imagePath=process.argv[2];
if(!imagePath)throw Error('Usage: node scripts/check-dense-render-browser.mjs IMAGE.png [proof.json]');
const input=await fs.readFile(imagePath),output=process.argv[3]??path.join(root,'docs/dense-render-browser-proof.json');
const server=createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Dense rendering regression</title>');return;}
  if(name==='/fixture.png'){res.setHeader('Content-Type','image/png');res.end(input);return;}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root)){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(await fs.readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('reportPhase',p=>console.log(JSON.stringify(p)));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const proof=await page.evaluate(async()=>{
  const worker=new Worker('/src/worker.js',{type:'module'}),pending=new Map(),phases=[];let sequence=0,lastPhase;
  worker.onmessage=({data})=>{if(data.progress){if(data.progress.phase!==lastPhase){lastPhase=data.progress.phase;phases.push(lastPhase);window.reportPhase({phase:lastPhase});}return;}const task=pending.get(data.sequence);if(task){pending.delete(data.sequence);data.error?task.reject(Object.assign(Error(data.error.message),data.error)):task.resolve(data.result);}};
  worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear();};
  const call=(method,args=[],options)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({sequence:id,method,args,options});});
  try{
   const capabilities=await call('init',[],{memoryBudgetBytes:4*1024**3,computeProfile:'aggressive'}),blob=await(await fetch('/fixture.png')).blob();
   const image=await call('loadBlob',[{id:'spiral',blob,name:'edited.png'}]);
   const params={profile:'PatchMatch Zernike',patch:8,iterations:8,texture:2,flip:false,auto:true,limit:6000,radius:600,minimum:5,threshold:.3,tolerance:50,model:'Similarity',geometricThreshold:3,geometricMinimum:6,compact:true,regions:[],guides:[],compare:false,excluded:[]};
   const view={low:0,high:100000,minimum:4,circles:false,lines:false,points:false,areas:true,textExclusions:false},task={id:'clones',imageId:'spiral',operation:'tampering.copyMove.dense',params,view,backend:'auto'};
   const start=performance.now(),result=await call('run',[task]),calculationMs=performance.now()-start;
   const request=s=>({surfaceId:s.id,revision:s.revision});
   const rendered=await call('readPixels',[request(result.surface)]),original=await call('readPixels',[request(image.surface)]);
   let changedBytes=0;for(let i=0;i<rendered.pixels.data.length;i++)if(rendered.pixels.data[i]!==original.pixels.data[i])changedBytes++;
   const displayStart=performance.now(),redraw=await call('run',[{...task,view:{...view,lines:true,circles:true}}]),redrawMs=performance.now()-displayStart;
   const proof={browser:navigator.userAgent,engine:result.provenance.engine,width:image.width,height:image.height,params,view,status:result.status,surface:result.surface,visible:result.visible,pointType:result.data.points.constructor.name,changedBytes,calculationMs,redrawMs,reused:redraw.metrics.cache.result,phases};
   await call('releaseSurface',[result.surface.id]);await call('releaseSurface',[redraw.surface.id]);await call('dispose');return proof;
  }finally{worker.terminate();}
 });
 assert.equal(proof.status,'ok');assert.equal(proof.reused,true);assert.ok(proof.changedBytes>0);assert.deepEqual(errors,[]);
 proof.inputSha256=createHash('sha256').update(input).digest('hex');proof.inputName=path.basename(imagePath);proof.pageErrors=errors;
 await fs.writeFile(output,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
