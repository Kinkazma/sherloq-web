import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {writeFile,readFile,stat,mkdtemp,mkdir,rm,open,rename,copyFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {freezeBrowserRuntime} from './freeze-browser-runtime.mjs';

const variant=process.env.M5_COMPLETE_VARIANT??'96mp';if(!['96mp','small-positive','small-positive-cache'].includes(variant))throw Error('Unknown complete recipe variant');const stem='m5-complete-'+variant;
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),directory=path.join(root,'.build/integration');
const shared=process.env.M5_M2_BUILD??path.resolve(root,'../web-engine-m2/.build'),m1=process.env.M5_SHARED_BUILD??path.resolve(root,'../web-engine/.build'),ort=path.join(m1,'ort130/package/dist');
await mkdir(directory,{recursive:true});
const attempt=await mkdtemp(path.join(directory,'complete-'+variant+'-attempt-')),frozen=await freezeBrowserRuntime(root,attempt),extra=[];
for(const name of ['tests/m5-complete-96mp-browser.js','tests/verify-stored-npz.mjs','tests/source-api-browser.js','.build/forgeryscope/prepare.mjs','.build/forgeryscope/prepare.wasm','.build/forgeryscope/sift.mjs','.build/forgeryscope/sift.wasm']){
 const source=path.join(root,name),target=path.join(attempt,'runtime',name);await mkdir(path.dirname(target),{recursive:true});await copyFile(source,target);frozen.files.set('/'+name,target);const bytes=await readFile(target);extra.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const binding={variant,engineCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtimeManifestSha256:createHash('sha256').update(await readFile(path.join(root,'runtime-manifest.json'))).digest('hex'),runtime:frozen.proof,extra};
await writeFile(path.join(attempt,'binding.json'),JSON.stringify(binding,null,2)+'\n');
const part=path.join(attempt,stem+'.npz.part'),fileHandle=await open(part,'w');let delivered=0,browser,profile,interrupted=false;const events=[];
const server=createServer(async(req,res)=>{try{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 const url=new URL(req.url,'http://localhost'),name=url.pathname;
 if(name==='/archive-part'&&req.method==='POST'){
  if(Number(url.searchParams.get('offset'))!==delivered)throw Error('offset');let length=0;const chunks=[];
  for await(const chunk of req){length+=chunk.length;if(length>4*1024**2)throw Error('chunk limit');chunks.push(chunk);}
  await fileHandle.writeFile(Buffer.concat(chunks));delivered+=length;res.statusCode=204;return res.end();
 }
 if(name==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>M5 complete automatic original96MP</title>');}
 if(name==='/english-ocr'){res.setHeader('Content-Type','application/octet-stream');return createReadStream(process.env.TESSDATA_ENG??'/opt/homebrew/share/tessdata/eng.traineddata').pipe(res);}
 const isM1=name.startsWith('/shared-build/'),isShared=name.startsWith('/m2-build/'),isOrt=name.startsWith('/ort/'),base=isM1?m1:isShared?shared:isOrt?ort:root;
 const file=frozen.files.get(name)??path.resolve(base,isM1?name.slice(14):isShared?name.slice(10):isOrt?name.slice(5):'.'+name);
 if(!frozen.files.has(name)&&!file.startsWith(base+path.sep))throw Error('path');
 // Engine modules, WASM binaries and recipe modules must come from the lock.
 if(!isM1&&!isShared&&!isOrt&&!frozen.files.has(name))throw Error('Unfrozen runtime request: '+name);
 res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');
 const total=(await stat(file)).size,range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range??'');
 if(range){const start=Number(range[1]),end=Number(range[2]);if(start<0||end<start||end>=total||end-start+1>4*1024**2)throw Error('range');res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${total}`);res.setHeader('Content-Length',end-start+1);createReadStream(file,{start,end}).pipe(res);}
 else{res.setHeader('Content-Length',total);createReadStream(file).pipe(res);}
 }catch(error){console.error('SERVE',error.message);res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const interrupt=()=>{interrupted=true;void browser?.close();};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
try{
 profile=await mkdtemp(path.join(directory,'browser-complete-'+variant+'-'));browser=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true});
 const page=await browser.newPage();page.on('pageerror',e=>console.error('PAGEERROR',e));page.on('requestfailed',r=>console.error('REQUESTFAILED',r.url(),r.failure()));
 page.on('console',m=>{const line=m.text();console.log(m.type(),line);if(line.startsWith('COMPLETE96 ')){try{events.push(JSON.parse(line.slice(11)));}catch{}}});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 const proof=await page.evaluate(async smallPositive=>{const {testComplete96mp}=await import('/tests/m5-complete-96mp-browser.js');return testComplete96mp({smallPositive});},variant!=='96mp');
 if(delivered!==proof.archive.byteLength)throw Error('Incomplete local archive');await fileHandle.close();await rename(part,path.join(directory,stem+'.npz'));
 Object.assign(proof,binding,{browser:browser.browser().version(),storageContext:'fresh persistent Chrome profile removed after qualification'});
 await writeFile(path.join(root,'docs/'+stem+'-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:proof.passed,totalMs:proof.totalMs,times:proof.times,memory:proof.finalMemory}));
}catch(error){
 await writeFile(path.join(attempt,'incomplete.json'),JSON.stringify({passed:false,interrupted,error:{message:error.message,stack:error.stack},binding,delivered,events},null,2)+'\n');throw error;
}finally{
 process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);await fileHandle.close();await browser?.close();if(profile)await rm(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));
}
