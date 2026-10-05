import {createWorkerEngine} from '../src/worker-client.js';import {createSHA256} from '../vendor/hash-wasm/hashes.js';import {storageInventory} from './source-api-browser.js';
const assert=(v,m)=>{if(!v)throw Error(m);},hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export async function echoPoolOptimizationBrowser(engineOptions={}){
 const reference=await(await fetch('/.build/echo-4099x3077-reference.json')).json(),expected=reference.cases[2],blob=await(await fetch('/.build/echo-4099x3077.jpg')).blob(),before=await storageInventory(),samples=[];
 const start=performance.now(),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,...engineOptions});let last;
 try{
  const loaded=await engine.loadBlob({id:'source',blob}),loadMs=performance.now()-start;assert(loaded.sha256===reference.originalSha256,'Source identity');
  for(const temperature of ['cold','warm']){
   if(last){await engine.releaseSurface(last);last=null;}
   let at=performance.now();const result=await engine.run({id:temperature,imageId:'source',operation:'detail.echo',params:expected.params}),rpcMs=performance.now()-at;
   const windowRef=expected.windows[3];at=performance.now();const window=await engine.readPixels({surfaceId:result.surface.id,revision:1,rect:windowRef.rect}),transferMs=performance.now()-at;
   assert(await hash(window.pixels.data)===windowRef.sha256,'Native window');
   at=performance.now();const canvas=document.createElement('canvas');canvas.width=window.pixels.width;canvas.height=window.pixels.height;document.body.replaceChildren(canvas);const context=canvas.getContext('2d'),display=context.createImageData(canvas.width,canvas.height),rgb=window.pixels.data;
   for(let i=0;i<rgb.length/3;i++){display.data[i*4]=rgb[i*3];display.data[i*4+1]=rgb[i*3+1];display.data[i*4+2]=rgb[i*3+2];display.data[i*4+3]=255;}context.putImageData(display,0,0);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const canvasFramesMs=performance.now()-at;
   at=performance.now();const exported=await engine.exportResult(result,{format:'json'}),exportMs=performance.now()-at;assert(exported.bytes.length>0,'JSON surface export');
   const chainMs=(temperature==='cold'?loadMs:0)+rpcMs+transferMs+canvasFramesMs+exportMs;
   samples.push({temperature,rpcMs,transferMs,canvasFramesMs,exportMs,chainMs,exportBytes:exported.bytes.length,metrics:result.metrics});
   last=result.surface.id;
  }
  // Functional full-image verification is outside the timing window above.
  const digest=await createSHA256();for(let y=0;y<reference.height;y+=64){const window=await engine.readPixels({surfaceId:last,revision:1,rect:{x:0,y,width:reference.width,height:Math.min(64,reference.height-y)}});digest.update(window.pixels.data);}const sha256=digest.digest('hex');assert(sha256===expected.sha256,'Native complete output');
  await engine.unload('source');const memory=(await engine.capabilities()).memory;assert(memory.activeReservationBytes===0&&memory.retainedBytes===0&&memory.cacheBytes===0,'Reservations released');await engine.dispose();assert(JSON.stringify(await storageInventory())===JSON.stringify(before),'Temporary storage released');
  return{sourceSha256:reference.originalSha256,outputSha256:sha256,params:expected.params,dimensions:[reference.width,reference.height],loadMs,loadMetrics:loaded.metrics,samples,memory};
 }finally{await engine.dispose();}
}
