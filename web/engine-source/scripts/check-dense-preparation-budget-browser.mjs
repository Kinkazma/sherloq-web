import {chromium,firefox,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),names=(process.env.BROWSERS??'chromium,firefox,webkit').split(',');
const server=createServer(async(request,response)=>{try{
 response.setHeader('Cross-Origin-Opener-Policy','same-origin');response.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 const name=new URL(request.url,'http://localhost').pathname;if(name==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Exact preparation budgets</title>');return;}
 const file=path.resolve(root,'.'+decodeURIComponent(name));if(!file.startsWith(root))throw Error('outside');response.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');response.end(await readFile(file));
}catch{response.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const proof=[];
try{
 for(const name of names){const type={chromium,firefox,webkit}[name];if(!type)throw Error('Unknown browser');const browser=await type.launch(name==='chromium'?{headless:true,channel:'chrome'}:{headless:true});
  try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);const records=await page.evaluate(async()=>{const {qualifyPreparationBudgets}=await import('/tests/dense-preparation-budget-browser.js');return qualifyPreparationBudgets();});const result={browser:name,version:browser.version(),records};proof.push(result);console.log(JSON.stringify(result));}finally{await browser.close();}
 }
 const hashes=JSON.stringify(proof[0].records.map(record=>record.hashes));if(proof.some(row=>JSON.stringify(row.records.map(record=>record.hashes))!==hashes))throw Error('Cross-browser preparation mismatch');console.log(JSON.stringify({passed:true,browsers:names}));
}finally{await new Promise(resolve=>server.close(resolve));}
