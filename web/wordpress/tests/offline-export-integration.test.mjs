import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {offlineLauncherHTML} from '../sherloq-browser/assets/offline-kit-core.js';
import {persistBridgePreferenceBackup} from '../sherloq-browser/assets/bridge-preference-backup.js';
import {restorePreferenceBackup} from '../sherloq-browser/assets/preferences-recovery.js';
const identity='a'.repeat(64),token='b'.repeat(32),base='http://127.0.0.1:8765/'+token+'/',backup={schema:'sherloq.preference-backup/1',entries:{'sherloq.settings':{raw:'{"unknownLegacy":"untouched","profiles":[]}',overlayRaw:null,originalRaw:null}}};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('bridge preference snapshots bind atomically to the matching active/candidate record and remain usable by the existing restore path',async()=>{
 const plan={identity,appBase:base},previous={identity:'previous',backup:{untouched:true}},otherCandidate={identity:'another',untouched:true};let state={schema:'sherloq.local-update-state/1',active:{identity,appBase:base},previous,candidate:otherCandidate,journal:[]};const store={read:async()=>state,change:async fn=>state=fn(state)};
 await persistBridgePreferenceBackup(store,plan,backup);assert.equal(state.active.backup,backup);assert.equal(state.previous,previous);assert.equal(state.candidate,otherCandidate);assert.equal(state.journal.at(-1).type,'archive-bridge-preference-backup');
 const entries=new Map(),storage={get length(){return entries.size;},key:index=>[...entries.keys()][index],getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};await restorePreferenceBackup((await store.read()).active.backup,{storage});assert.equal(storage.getItem('sherloq.settings'),backup.entries['sherloq.settings'].raw);
 state={...state,active:{identity:'old',appBase:base},bootstrapCandidate:{identity,appBase:base,status:'ready',expectedActive:'old'},journal:[]};await persistBridgePreferenceBackup(store,plan,backup);assert.equal(state.bootstrapCandidate.backup,backup);assert.equal(state.active.identity,'old');const before=structuredClone(state);await assert.rejects(persistBridgePreferenceBackup(store,{identity,appBase:'http://127.0.0.1:8765/different/'},backup),{code:'BRIDGE_STATE_CHANGED'});assert.deepEqual(state,before);
});

test('the actual bridge Open handler awaits durable fresh preferences; a failed transaction retains the original page',async()=>{
 const source=await readFile(new URL('../sherloq-browser/assets/offline-bridge.js',import.meta.url),'utf8'),html=await readFile(new URL('../sherloq-browser/assets/offline-bridge.html',import.meta.url),'utf8');
 for(const rejected of [false,true]){
  const {document,window}=parseHTML(html),gate=deferred(),entered=deferred(),initialURL='http://127.0.0.1:8765/__sherloq_bridge/'+token+'/offline-bridge.html',location={href:initialURL,pathname:'/__sherloq_bridge/'+token+'/offline-bridge.html',origin:'http://127.0.0.1:8765',toString(){return this.href;}},plan={identity,appBase:new URL(base),config:{offlineMode:'archive'},shell:{version:'synthetic',files:{}}};let state={schema:'sherloq.local-update-state/1',active:{identity,appBase:base,backup:{old:true}},journal:[]},downloads=0;
  const store={read:async()=>state,async change(fn){entered.resolve();await gate.promise;if(rejected)throw Error('Durable preference transaction aborted');state=fn(state);return state;}};
  const context=vm.createContext({document,window,location,URL,localStorage:{getItem:()=>null},navigator:{languages:['en'],serviceWorker:{}},offlinePlan:async()=>plan,browserUpdateStore:()=>store,capturePreferenceBackup:async()=>backup,persistBridgePreferenceBackup,downloadPreferenceBackup(){downloads++;throw Error('Internal backups must not start an external download.');},prepareLocalArchiveBridge:async()=>{},updateWorkerMessage:async()=>{},setInterval(){},clearInterval(){}});
  vm.runInContext(source.replace(/^import .*;\n/gm,''),context);await new Promise(resolve=>setImmediate(resolve));context.testRegistration={active:{state:'activated',scriptURL:base+'offline-browser-sw.js?shell='+identity}};vm.runInContext('registration=testRegistration;',context);const open=document.getElementById('offline-bridge-open');open.disabled=false;const pending=open.onclick();await entered.promise;assert.equal(location.href,initialURL);gate.resolve();await pending;assert.equal(downloads,0);
  if(rejected){assert.equal(location.href,initialURL);assert.deepEqual(state.active.backup,{old:true});assert.match(document.getElementById('offline-bridge-status').textContent,/transaction aborted/);}else{assert.equal(location.href,base+'app.html');assert.equal(state.active.backup,backup);}
 }
});

function standalone(server,{picker}={}){
 const html=offlineLauncherHTML({archivePath:'SHERLOQ-complet.tar',manifest:identity,shellSha256:identity,version:'synthetic',token,server}),{document}=parseHTML(html),urls=new Map(),downloads=[],events={};let created=0,revoked=0;
 document.defaultView.HTMLElement.prototype.click=function(){if(this.tagName==='A')downloads.push({url:this.href,name:this.download});};
 const context=vm.createContext({document,Blob,Uint8Array,URL:{createObjectURL(blob){created++;urls.set('blob:helper',blob);return 'blob:helper';},revokeObjectURL(url){revoked++;urls.delete(url);}},showSaveFilePicker:picker,addEventListener:(type,fn)=>events[type]=fn,setTimeout(){throw Error('No timeout may invalidate the prepared helper.');}});vm.runInContext([...document.querySelectorAll('script')].at(-1).textContent,context);
 return {document,button:document.getElementById('helper'),urls,downloads,events,created:()=>created,revoked:()=>revoked};
}

test('self-contained launcher helper writes exact UTF-8 bytes and confirms only close; cancellation retries the same prepared source',async()=>{
 const source='# échantillon </script> intact\nprint("ok")\n',gate=deferred(),entered=deferred(),parts=[];let picked=0,aborted=0;
 const h=standalone(source,{picker:()=>{picked++;if(picked===1)return Promise.reject(new DOMException('User cancelled','AbortError'));return {createWritable:async()=>({write:async bytes=>parts.push(new Blob([bytes])),async close(){entered.resolve();await gate.promise;},abort:async()=>aborted++})};}});
 const first=h.button.onclick();assert.equal(picked,1);await first;assert.equal(h.button.disabled,false);assert.match(h.document.querySelector('[role="status"]').textContent,/reste disponible/);const second=h.button.onclick();assert.equal(picked,2);await entered.promise;assert.doesNotMatch(h.document.querySelector('[role="status"]').textContent,/enregistré\./);gate.resolve();await second;assert.equal(await new Blob(parts).text(),source);assert.match(h.document.querySelector('[role="status"]').textContent,/enregistré\./);assert.equal(aborted,0);assert.equal(h.created(),0);
});

test('standalone fallback retains one exact helper Blob URL through repeated clicks until pagehide',async()=>{
 const source='# unchanged helper\n',h=standalone(source);await h.button.onclick();await h.button.onclick();assert.equal(h.created(),1);assert.equal(h.downloads.length,2);assert.equal(h.downloads[0].url,h.downloads[1].url);assert.equal(h.downloads[0].name,'sherloq-local.py');assert.equal(await h.urls.get(h.downloads[0].url).text(),source);assert.equal(h.revoked(),0);assert.doesNotMatch(h.document.querySelector('[role="status"]').textContent,/enregistré\./);h.events.pagehide();assert.equal(h.revoked(),1);assert.equal(h.urls.size,0);
});

test('classic worker concatenations compile and their actual shared offline core generates an autonomous helper without UI imports',async()=>{
 const builder=await readFile(new URL('../scripts/build-local-release.py',import.meta.url),'utf8'),offlineNames=builder.match(/OFFLINE_MODULES = \[([\s\S]*?)\]/)[1].match(/'[^']+'/g).map(value=>value.slice(1,-1)),dependencyNames=builder.match(/\('dependency-sw\.js',\[([^\]]+)\]\)/)[1].match(/'[^']+'/g).map(value=>value.slice(1,-1));
 const concatenate=async names=>(await Promise.all(names.map(name=>readFile(new URL('../sherloq-browser/assets/'+name,import.meta.url),'utf8')))).map(source=>source.replace(/^import .*;\n/gm,'').replaceAll('export ','')).join('\n');
 for(const names of [offlineNames,dependencyNames]){assert.ok(names.includes('offline-kit-core.js'));assert.ok(!names.includes('download-manager.js'));assert.ok(!names.includes('download-shelf.js'));const code=await concatenate(names);assert.doesNotThrow(()=>new vm.Script(code));}
 // Execute the exact shared prefix, rather than a substitute implementation.
 // Worker startup/storage/network are deliberately outside this source test.
 const context=vm.createContext({TextEncoder,TextDecoder,Uint8Array,URL,Blob,Response,crypto:webcrypto});vm.runInContext(await concatenate(dependencyNames.slice(0,4)),context);context.options={archivePath:'SHERLOQ-complet.tar',manifest:identity,shellSha256:identity,version:'synthetic',token,server:'# worker-generated helper\n'};
 const html=vm.runInContext('offlineLauncherHTML(options)',context),{document}=parseHTML(html),script=[...document.querySelectorAll('script')].at(-1).textContent;assert.doesNotThrow(()=>new vm.Script(script));assert.doesNotMatch(script,/createDownloadManager|localActivity|downloadOwnershipTransferred|\bimport\b/);assert.match(script,/showSaveFilePicker/);assert.match(script,/writer\.close\(\)/);assert.equal(document.querySelectorAll('#helper').length,1);
});
