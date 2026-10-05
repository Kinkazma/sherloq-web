import {createServer} from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {chromium,firefox,webkit} from 'playwright';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),ui=path.resolve(root,'../wordpress-plugin'),engineBase='7e34e5208c83b292d6106c1f7fbfd3f4ded2e64c',uiBase='0fcee0c550925f100f2d42bad47b07d0fabe05e7';
const oldWorker=execFileSync('git',['show',uiBase+':sherloq-browser/assets/engine-worker.js'],{cwd:ui,encoding:'utf8'}),newWorker=await fs.readFile(path.join(ui,'sherloq-browser/assets/engine-worker.js'),'utf8');
function functions(code){return code.slice(code.indexOf('async function windowPixels'),code.indexOf('function resultDisplay'));}
const server=createServer(async(req,res)=>{try{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');const u=new URL(req.url,'http://local'),p=u.pathname;res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.wasm')?'application/wasm':'text/html');
 if(p==='/'){res.end('<!doctype html><title>Synthetic display transport test</title>');return;}
 if(p==='/bench-worker.js'){
 const code=u.searchParams.get('mode')==='before'?functions(oldWorker):functions(newWorker);
 res.end(`import {samplePixels,readDisplayFrame} from '/src/display-sampling.js';import {Budget} from '/src/cache.js';import {createRgbSurface} from '${u.searchParams.get('mode')==='before'?'/baseline-engine':' ' .trim()}/src/rgb-surface.js';
 let lastPixels,displayRevision=1,controller={signal:new AbortController().signal},engine,queue=Promise.resolve();const cancelled=()=>Error('cancelled');
 ${code}
 self.onmessage=({data:m})=>{queue=queue.then(async()=>{if(m.action==='init'){const width=10000,height=10000,data=new Uint8Array(width*height*3),row=new Uint8Array(width*3);for(let x=0;x<width;x++){row[x*3]=x%251;row[x*3+1]=(x*3)%251;row[x*3+2]=127;}for(let y=0;y<height;y++)data.set(row,y*width*3);lastPixels={width,height,format:'rgb8',data};const budget=new Budget(512*1024**2),store={byteLength:data.length,readInto(target,at){target.set(data.subarray(at,at+target.length));return target;}},surface=createRgbSurface(store,{width,height,budget,ownsStore:false});engine={readPixels:async({rect})=>{const part=await surface.readWindow(rect);part.release();return part;},readDisplay:async({tile})=>{const part=await readDisplayFrame(surface,tile,{budget});part.release();return part;}};self.postMessage({id:m.id,result:{}});return;}const pixels=await displayTile(m.payload.display,m.payload.tile);self.postMessage({id:m.id,result:{pixels}},[pixels.data.buffer]);}).catch(e=>self.postMessage({id:m.id,error:e.stack}));};`);return;
 }
 let body;
 if(p.startsWith('/baseline-engine/'))body=execFileSync('git',['show',engineBase+':'+p.slice('/baseline-engine/'.length)],{cwd:root});
 else if(p.startsWith('/baseline-ui/'))body=execFileSync('git',['show',uiBase+':sherloq-browser/assets/'+p.slice('/baseline-ui/'.length)],{cwd:ui});
 else {const relative=p.startsWith('/ui/unified-engine/')?p.slice('/ui/unified-engine/'.length):p.startsWith('/ui/')?'../wordpress-plugin/sherloq-browser/assets/'+p.slice(4):p.slice(1);body=await fs.readFile(path.resolve(root,relative));}
 res.end(body);
 }catch(e){res.writeHead(404).end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const evidence={date:new Date().toISOString(),engineBase,uiBase,scope:'100 MP synthetic RGB already computed; includes worker reads, transfers, RGB-to-RGBA conversion and canvas presentation. Excludes analysis computation and image decoding.',browsers:[]};
try{for(const name of (process.argv.includes('--all')?['chrome','firefox','webkit']:['chrome'])){const browser=await ({chrome:chromium,firefox,webkit}[name]).launch({headless:true,...(name==='chrome'?{channel:'chrome'}:{})});
 try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.goto(`http://127.0.0.1:${server.address().port}/`);const results=await page.evaluate(async()=>{
 const {TileCache,visibleTiles}=await import('/ui/tiled-surface.js'),after=await import('/ui/remote-surface.js'),before=await import('/baseline-ui/remote-surface.js'),results=[];
 for(const kind of ['result','source'])for(const mode of ['before','after'])for(let pass=0;pass<3;pass++){
  const worker=new Worker('/bench-worker.js?mode='+mode,{type:'module'}),jobs=new Map();let serial=0,requests=0,completed=0,outboundBytes=0,firstMs=null,resolve,reject,started,finished=false;
  worker.onmessage=({data})=>{const job=jobs.get(data.id);jobs.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);};worker.onerror=e=>reject?.(Error(e.message));
  const request=(action,payload)=>new Promise((resolve,reject)=>{const id=++serial;jobs.set(id,{resolve,reject});worker.postMessage({id,action,payload});});
  await request('init');const display={width:10000,height:10000,format:'rgb8',id:'surface',revision:1,kind},bounds={left:0,top:0,right:10000,bottom:10000},scale=.125,expected=mode==='before'?visibleTiles(10000,10000,bounds,scale).length:1;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1250;const ctx=canvas.getContext('2d'),cache=new TileCache();document.body.append(canvas);
  const done=new Promise((a,b)=>{resolve=a;reject=b;}),timeout=setTimeout(()=>reject(Error('Display timeout')),60000);
  function paint(){if(finished)return;if(surface.prepare&&!surface.prepare(bounds,scale))return;ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,10000,10000);surface.draw(ctx,bounds,scale);
   if(completed){firstMs??=performance.now()-started;if(completed===expected){finished=true;const rgba=ctx.getImageData(0,0,1250,1250).data;for(let y=0;y<1250;y+=37)for(let x=0;x<1250;x+=41)if(rgba[(y*1250+x)*4+3]!==255)throw Error('Unpainted pixel');resolve({mode,kind,pass,requests,completeMs:performance.now()-started,firstMs,outboundBytes,canvasBytes:cache.bytes});}}
  }
  const surface=(mode==='before'?before:after).createRemoteSurface(display,cache,async(action,payload)=>{requests++;const answer=await request(action,payload);completed++;outboundBytes+=answer.pixels.data.byteLength;return answer;},()=>requestAnimationFrame(paint),reject);
  started=performance.now();paint();try{results.push(await done);}finally{clearTimeout(timeout);surface.close();worker.terminate();canvas.remove();}
 }
 return results;
 });if(errors.length)throw Error(errors.join('\n'));evidence.browsers.push({name,version:browser.version(),results});console.log(JSON.stringify(evidence.browsers.at(-1)));}finally{await browser.close();}}
 await fs.mkdir(path.join(root,'.build/display-browser'),{recursive:true});await fs.writeFile(path.join(root,'.build/display-browser/proof.json'),JSON.stringify(evidence,null,2)+'\n');
}finally{await new Promise(r=>server.close(r));}
