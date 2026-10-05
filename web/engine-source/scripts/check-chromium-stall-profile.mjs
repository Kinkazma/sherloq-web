// Development-only reproduction of a starved worker message loop. This script
// is never part of admission or production execution.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {createChromiumMemoryObserver} from './chromium-memory-observer.mjs';

const server=createServer((request,response)=>{
 if(request.url==='/src/worker.js'){
  response.setHeader('Content-Type','text/javascript');
  response.end('postMessage("ready"); function admissionNotificationLoop(){queueMicrotask(admissionNotificationLoop)}; admissionNotificationLoop();');
 }else response.end('<!doctype html><title>Coordinator diagnostic regression</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser,observer;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>new Promise(resolve=>{globalThis.worker=new Worker('/src/worker.js');worker.onmessage=()=>resolve();}));
 observer=await createChromiumMemoryObserver(browser);
 const result=await observer.profileStalledCoordinator();
 assert.ok(result.profile?.samples?.length>0,'The blocked worker has no CPU samples');
 const frames=result.profile.nodes.filter(node=>node.callFrame.functionName==='admissionNotificationLoop').map(node=>node.callFrame);
 assert.ok(frames.some(frame=>frame.url.endsWith('/src/worker.js')),'The profile did not recover the blocked function and source');
 console.log(JSON.stringify({passed:true,browser:browser.version(),samples:result.profile.samples.length,frames,scope:result.scope}));
}finally{await observer?.close();await browser?.close();await new Promise(resolve=>server.close(resolve));}
