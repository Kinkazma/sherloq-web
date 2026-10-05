// Offline regression: native postprocess on known grids. No user image or AI inference.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(new URL('../../web-engine-clone-panel-api/package.json',import.meta.url))('playwright');
const root=path.resolve('sherloq-browser/assets');
const server=http.createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+'/')){res.writeHead(200,{'Content-Type':'text/html','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end('<html></html>');return;}const bytes=await fs.readFile(p);res.writeHead(200,{'Content-Type':p.endsWith('.wasm')?'application/wasm':p.endsWith('.json')?'application/json':'text/javascript','Cross-Origin-Resource-Policy':'same-origin','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
 const proof=await page.evaluate(async()=>{
  const {Budget}=await import('/unified-engine/src/cache.js'),{createD2prlAnalysis}=await import('/unified-engine/experiments/d2prl/analysis.js'),{createPostprocess}=await import('/unified-engine/experiments/d2prl/postprocess.js'),{composeCloneFrame}=await import('/neural-clone-ui.js');
  const assert=(v,m)=>{if(!v)throw Error(m);},budget=new Budget(1024**3),post=createPostprocess({budget,moduleUrl:new URL('/unified-engine/vendor/d2prl/postprocess.js',location.href).href}),n=448*448,raw=new Float32Array(n*3);let inferenceCalls=0;
  for(const [x,y,size]of [[10,10,5],[40,40,20],[100,100,30]])for(let yy=y;yy<y+size;yy++)for(let xx=x;xx<x+size;xx++){raw[yy*448+xx]=.8;raw[n+yy*448+xx]=.2;}
  const session=createD2prlAnalysis({budget,modelId:'synthetic-regression-only',infer:async()=>{inferenceCalls++;return {raw,release(){}};},project:{async run(input){const out=await post.run({raw:input.zones[0].raw,minimum:input.minimum});return {masks:out.masks,metadata:{zones:input.zones,minimum:input.minimum},release:out.release};}}});
  const rows=[];let previous,analysisId;try{
   for(const minimum of [0,100,500,5000,0]){
    const at=performance.now();const result=analysisId?await session.refilter({analysisId,minimum}):await session.run({pixels:{width:448,height:448,data:new Uint8Array(n*3)},minimum,mode:'whole-image',zones:[{id:'all',kind:'whole-image',bounds:[0,0,448,448]}],backend:'cpu'});
    analysisId=result.metadata.analysisId;const mask=result.masks.subarray(0,n),retained=mask.reduce((n,v)=>n+v,0),base=new Uint8Array(n*3).fill(40),frame=composeCloneFrame({width:448,height:448,base,values:raw.subarray(0,n),mask,view:'overlay',masked:true});
    let changed=0;for(let i=0;i<n;i++)if(frame.data[i*3]!==40||frame.data[i*3+1]!==40||frame.data[i*3+2]!==40)changed++;
    assert(changed===retained,'Overlay must follow filtered native mask');rows.push({minimum,retained,overlayChanged:changed,inferences:result.metadata.inferences,ms:Math.round(performance.now()-at)});result.release();
   }
   assert(JSON.stringify(rows.map(r=>r.retained))==='[1325,1300,900,0,1325]','Native component thresholds and reversible refilter');assert(inferenceCalls===1,'Refilter must never re-run inference');
  }finally{await session.dispose();post.dispose();}
  assert(budget.total()===0,'All resources released');
  const {m2ToolClient}=await import('/tool-models.js');const m2=await m2ToolClient({method:'forgeryscope',memoryBudgetBytes:128*1024**2,computeProfile:'maximum'});assert(m2.ready.windowBytes>0,'Real Forgeryscope worker initialized');
  const forgeryscopeProfiles=[];
  try{for(const profile of ['microscopy','duplicate','overlap','lanes']){
   const out=await m2.analyze('forgeryscope',{width:8,height:8,data:new Uint8Array(192)},{profile,panels:[]},{backend:'cpu'});
   const metadata=await m2.metadata(out),mask=await m2.readArray(out.id,'mask',0,64);
   assert(metadata.metadata.status==='no_panels'&&mask.every(v=>v===0),'Real empty-panel pipeline');forgeryscopeProfiles.push({profile,status:metadata.metadata.status});await m2.release(out.id);
  }}finally{await m2.dispose();}
  return {nativePostprocess:true,rows,inferenceCalls,budgetRemaining:budget.total(),forgeryscopeWorkerInitialized:true,forgeryscopeProfiles,userImagesUsed:false};
 });
 await fs.writeFile('NEURAL-CLONE-0.14.4-proof.json',JSON.stringify({date:new Date().toISOString(),browser:browser.version(),...proof},null,2)+'\n');console.log(JSON.stringify(proof));
}finally{await browser.close();await new Promise(r=>server.close(r));}
