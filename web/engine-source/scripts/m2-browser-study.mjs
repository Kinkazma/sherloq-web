// Development-only harness. No benchmark, calibration or reference tensor is
// loaded by the public runtime. All writes remain in this worktree.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export async function study(name, evaluate, options) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const ortRoot=process.env.FORGERYSCOPE_ORT_DIST;
  if(!ortRoot)throw Error('Set FORGERYSCOPE_ORT_DIST.');
  const provider=process.argv.includes('--gpu')?'webgpu':'wasm';
  const server=createServer(async(req,res)=>{
    try {
      const name=new URL(req.url,'http://localhost').pathname;
      if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>M2 network study</title>');return;}
      const base=path.resolve(name.startsWith('/ort/')?ortRoot:root);
      const file=path.resolve(base,'.'+(name.startsWith('/ort/')?name.slice(4):name));
      if(!file.startsWith(base+path.sep))throw Error('path');
      res.setHeader('Content-Type',/\.(m?js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');
      res.end(await readFile(file));
    }catch(error){if(req.url!=='/favicon.ico')console.error('Study resource unavailable',req.url,String(error));res.statusCode=404;res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser,ownedProfile,browserVersion;const persistent=process.argv.includes('--persistent');
  try {
    if(persistent){ownedProfile=await mkdtemp(path.join(root,'.build/m2-browser-profile-'));browser=await chromium.launchPersistentContext(ownedProfile,{channel:'chrome',headless:true});browserVersion=browser.browser().version();}
    else{browser=await chromium.launch({channel:'chrome',headless:true});browserVersion=browser.version();}
    const page=await browser.newPage();
    page.on('pageerror',e=>console.error('Study page error',String(e)));
    page.on('console',x=>{if(x.type()==='error')console.log(x.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const report=await page.evaluate(evaluate,options?{...options,provider}:provider);
    report.browser=browserVersion;report.browserContext=persistent?'temporary on-disk profile owned by this worktree':'off-the-record Playwright context';
    report.executionNote=provider==='webgpu'?'WebGPU requested; ORT may assign nodes to CPU. No GPU-only claim.':'CPU/WASM';
    await writeFile(path.join(root,`docs/${name}-${provider}-proof.json`),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
    if(!report.passed)process.exitCode=1;
  }finally{await browser?.close();if(ownedProfile)await rm(ownedProfile,{recursive:true,force:true});await new Promise(r=>server.close(r));}
}
