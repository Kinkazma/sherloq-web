import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../sherloq-browser/assets/offline-setup.js',import.meta.url),'utf8');
const start=source.indexOf('function installerWorkerReady('),end=source.indexOf("$('interface-font').onchange",start);
assert(start>=0&&end>start);
function setup(registration){let poll,registered=0;const expected=new URL('https://site.test/assets/offline-browser-sw.js?shell=candidate');const context={plan:{appBase:new URL('https://site.test/assets/offline/'),shell:{workerType:'classic'},config:{}},installationWorkerURL:()=>expected,navigator:{serviceWorker:{getRegistration:async()=>registration,register:async()=>{registered++;return registration;}}},setTimeout:()=>1,clearTimeout(){},setInterval:fn=>{poll=fn;return 2;},clearInterval(){}};vm.createContext(context);vm.runInContext(source.slice(start,end),context);return {run:()=>context.registerInstallerWorker(),makeLocal(){context.plan.local=true;},poll:()=>poll?.(),get registered(){return registered;}};}
test('first offline preparation waits for the worker activation transaction before adopting its candidate',async()=>{
 const registration={active:{scriptURL:'https://site.test/assets/offline-browser-sw.js?shell=candidate',state:'activating'}};const f=setup(registration);let resolved=false;const pending=f.run().then(()=>{resolved=true;});await new Promise(setImmediate);assert.equal(resolved,false);assert.equal(f.registered,1);registration.active.state='activated';f.poll();await pending;assert.equal(resolved,true);
});
test('an already activated matching worker is reused, while an installed update can wait for older windows',async()=>{
 const active={scriptURL:'https://site.test/assets/offline-browser-sw.js?shell=candidate',state:'activated'},ready=setup({active});await ready.run();assert.equal(ready.registered,0);
 const old=setup({active:{scriptURL:'https://site.test/assets/offline-browser-sw.js?shell=previous',state:'activated'},waiting:{state:'installed'}});await old.run();assert.equal(old.registered,1);
});

test('an offline local app exports through its activated bridge without downloading or registering another script',async()=>{
 const f=setup({scope:'https://site.test/assets/offline/',active:{scriptURL:'https://site.test/assets/offline-browser-sw.js?shell=original-bridge',state:'activated'}});f.makeLocal();await f.run();assert.equal(f.registered,0);
});
