import {createServer} from 'node:http';import {createReadStream} from 'node:fs';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {chromium,firefox,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.build/lossless-exports'),browserKind=process.env.BROWSER??'chrome';await fs.mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' data: blob:");const p=new URL(req.url,'http://localhost').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');res.end('<title>Synthetic lossless export contracts</title>');return;}const file=path.resolve(root,'.'+p);if(!file.startsWith(root))throw Error('path');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');createReadStream(file).on('error',()=>res.writeHead(404).end()).pipe(res);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await ({chrome:chromium,firefox,webkit}[browserKind]).launch({headless:true,...(browserKind==='chrome'?{channel:'chrome'}:{})});const page=await browser.newPage();page.on('pageerror',e=>console.error(e));await page.exposeFunction('record',r=>console.log(JSON.stringify(r)));await page.exposeFunction('save',(name,bytes)=>fs.writeFile(path.join(out,name),Buffer.from(bytes)));await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const results=await page.evaluate(async({browserKind})=>{
  const {createWorkerEngine}=await import('/src/worker-client.js'),{mediaCodecJob}=await import('/src/media-codec-client.js');const assert=(v,m)=>{if(!v)throw Error(m);};const proof=[];
  const fixtures=browserKind==='chrome'?['photograph','gradient','graphics','noise','grid']:['noise'];
  for(const name of fixtures){
   const engine=createWorkerEngine({memoryBudgetBytes:1024**3,cpuKernel:'single'});try{
    let pixels;
    if(name==='photograph'){
     const blob=await fetch('/tests/data/recompression-segmented-parallel.jpg').then(r=>r.blob()),loaded=await engine.loadBlob({id:'photo',blob});pixels=(await engine.readPixels({surfaceId:loaded.surface.id,revision:1,rect:{x:0,y:0,width:loaded.width,height:loaded.height}})).pixels;await engine.unload('photo');
    }else{const width=name==='grid'?2051:name==='noise'?257:1024,height=name==='grid'?67:name==='noise'?193:768,data=new Uint8Array(width*height*3);let seed=42;
     for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[(y*width+x)*3+c]=name==='noise'?seed&255:name==='graphics'?((x>>5)+(y>>4)+c)%4*85:Math.round(c===0?x/(width-1)*255:c===1?y/(height-1)*255:((x>>4)^(y>>4))&255);}
     pixels={width,height,format:'rgb8',data};}
    const input=await engine.load({id:'fixture',bytes:Uint8Array.of(1),pixels});
    for(const format of ['webp','png','avif','tiff','heic']){
     await window.record({start:name,format});const started=performance.now(),descriptor=await engine.exportSurface({surfaceId:input.surface.id,revision:input.surface.revision,format,lossless:true,quality:17,chroma:'422',compression:6}),parts=[];
     for(let at=0;at<descriptor.byteLength;){const p=await engine.readExport({exportId:descriptor.id,revision:1,offset:at,length:Math.min(1024**2,descriptor.byteLength-at)});parts.push(p.bytes);at=p.nextOffset;}
     await engine.releaseExport(descriptor.id);const blob=new Blob(parts,{type:descriptor.mime}),encodedMs=performance.now()-started,decoded=new Uint8Array(pixels.data.length);
     const imported=await engine.loadBlob({id:'roundtrip',blob,name:'test.'+format});assert(imported.width===pixels.width&&imported.height===pixels.height,'Roundtrip dimensions '+format);decoded.set((await engine.readPixels({surfaceId:imported.surface.id,revision:imported.surface.revision,rect:{x:0,y:0,width:pixels.width,height:pixels.height}})).pixels.data);await engine.unload('roundtrip');
     let maximum=0,different=0;for(let i=0;i<decoded.length;i++){const error=Math.abs(decoded[i]-pixels.data[i]);maximum=Math.max(maximum,error);if(error)different++;}
     const r={fixture:name,format,width:pixels.width,height:pixels.height,bytes:blob.size,encodeMs:Math.round(encodedMs),differentSamples:different,maximumError:maximum,encoding:descriptor.provenance};await window.record(r);assert(!different,'Lossless pixels changed: '+name+' '+format+' '+different+' max '+maximum);proof.push(r);
     if(name==='noise')await window.save('lossless-'+browserKind+'.'+format,Array.from(new Uint8Array(await blob.arrayBuffer())));
    }
    if(name==='noise')for(const format of ['webp','png','avif','tiff','heic']){
     const descriptor=await engine.exportSurface({surfaceId:input.surface.id,revision:input.surface.revision,format,lossless:true,resize:{width:129,algorithm:'auto'}});assert(descriptor.width===129&&descriptor.height===97,'Pixel resize '+format);assert(descriptor.provenance.reduction==='lanczos3 in linear sRGB','Resampling selection '+format);await engine.releaseExport(descriptor.id);proof.push({format,resize:[descriptor.width,descriptor.height],algorithm:descriptor.provenance.reduction});
    }
   }finally{await engine.dispose();}
  }return proof;
 },{browserKind});await fs.writeFile(path.join(out,browserKind+'.json'),JSON.stringify({date:new Date().toISOString(),browser:browser.version(),results},null,2)+'\n');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
