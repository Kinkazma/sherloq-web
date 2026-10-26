import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML, DOMParser} from 'linkedom';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../sherloq-browser/assets/original-source-regions.js';
import {createOriginalSourceRegionsController} from '../sherloq-browser/assets/original-source-regions-controller.js';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';

const html = await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/app.html')), 'utf8');
const panel = await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/panel.html')), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
const image = name => new File(['image transport only'], name, {type: 'image/png'});
const pdf = name => new File(['%PDF-1.7\ntransport only'], name, {type: 'application/pdf'});

function setup({pdfGate, selectedFile, batchSourceAware=false,originalRegionHook} = {}) {
  const {document, window} = parseHTML(html), panels = new Map(), readers = new Map(), frames = [], calls = {loads: [], disposed: [], pdfFiles: [], batchImports: [], batchSources: [], settings: [], stale: [], regionDisposals: []};
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true, get() {return [...this.options].find(option => option.hasAttribute('selected'))?.value || this.options[0]?.value || '';}, set(value) {for (const option of this.options) option.toggleAttribute('selected', option.value === String(value));}});
  for (const [key, value] of Object.entries({document, window, DOMParser, location: {hash: '#lang=fr', href: 'http://localhost/app.html', origin: 'http://localhost'}, localStorage: {getItem: () => null, setItem() {}}, requestAnimationFrame: callback => (frames.push(callback), frames.length), cancelAnimationFrame() {}, confirm: () => true})) Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  const workspace = mountWorkspace(document, {
    originalRegionsFactory(options){const owner=createOriginalSourceRegionsController(options);originalRegionHook?.(owner,options);return owner;},
    fetcher: async () => ({ok: true, text: async () => panel}),
    panelFactory(_document, options) {
      const id = options.sourceOnly ? 'original' : options.toolId;
      let sourceFile, adopted;
      calls.panelOptions??=new Map();calls.panelOptions.set(id,options);
      const controller = {
        busy: false, async load(value) {sourceFile = value; calls.loads.push(value);},
        adopt(value) {adopted = value;controller.adoptedSourceRegions=value.sourceRegions;},
        input() {return adopted ?? {file: sourceFile, imageId: 'shared-original', hash: sourceFile?.name==='different.png'?'a'.repeat(64):'f'.repeat(64), source: {width: 40, height: 30, draw() {}, close() {}}, description: sourceFile?.name};},
        refreshOriginalRegions() {controller.regionDraws=(controller.regionDraws??0)+1;},markSourceRegionsStale(value) {calls.stale.push({id,value});controller.regionsStale=false;},snapshot() {return {busy: controller.busy, hasResult: id !== 'original', hasReport: false, status: 'ready', progress: 0, zoom: 100};},
        settings() {calls.settings.push(id); return {};}, applySettings() {}, activate() {}, fit() {}, zoomBy() {}, setLanguage() {}, setTheme() {}, setNavigation() {}, setComputeProfile() {}, setLoupe() {}, setHighlight() {},
        exportImage(value) {controller.exported = value ?? 'dialog';}, saveSession() {controller.sessions = (controller.sessions ?? 0) + 1;},
        async restoreSession(file) {calls.restoredSessions??=[];calls.restoredSessions.push({controller,id,value:JSON.parse(await file.text())});},
        dispose() {calls.disposed.push(controller);}
      };
      panels.set(id, controller); return controller;
    },
    async pdfFactory(options) {
      calls.pdfFiles.push(options.file);
      const controller = {
        kind: 'pdf', capabilities: {imageExport: true, session: false, report: false}, busy: false, importing: false,
        snapshot() {return {busy: false, hasResult: true, hasReport: false, status: 'pdf ready', progress: 1, zoom: 95};},
        selectedFile: () => selectedFile ? selectedFile(options.file) : Promise.resolve(image(options.file.name + '-p1.png')),
        activate() {}, fit() {controller.fits = (controller.fits ?? 0) + 1;}, zoomBy() {}, setLanguage() {}, setTheme() {}, setNavigation() {}, setComputeProfile() {}, setLoupe() {},
        exportSize: () => ({width: 400, height: 600}), exportImage(value) {controller.exported = value ?? 'dialog';},
        async restoreSession(file) {calls.restoredSessions??=[];calls.restoredSessions.push({controller,id,value:JSON.parse(await file.text())});},
        dispose() {calls.disposed.push(controller);}
      };
      readers.set(options.file.name, controller);
      if (pdfGate) await pdfGate.promise;
      return controller;
    },
    async batchFactory() {
      const dialog = document.createElement('dialog'); dialog.id = 'batch-dialog'; dialog.className = 'batch-dialog';
      const zone = document.createElement('div'); zone.className = 'batch-drop'; dialog.append(zone); document.body.append(dialog);
      const importFiles = files => {calls.batchImports.push([...files]);};
      zone.ondrop = event => {event.preventDefault(); event.stopPropagation(); importFiles(event.dataTransfer.files);};
      zone.addEventListener('drop', zone.ondrop);
      return {dialog, open() {dialog.open = true; dialog.setAttribute('open', '');}, importFiles,...(batchSourceAware?{importSource:value=>calls.batchSources.push(value)}:{}), busy: false, canExport: false};
    }
  });
  return {document, window, workspace, panels, readers, calls, flush() {while (frames.length) frames.shift()();}, async dispose() {window.dispatchEvent(new window.Event('pagehide')); await workspace.closeAll(); while (frames.length) frames.shift()(); window.dispatchEvent(new window.Event('pagehide'));}};
}


const sourceShape={sourceSha256:'f'.repeat(64),width:40,height:30};
async function snapshot(){const state=await createOriginalSourceRegionsState(sourceShape);await state.add('acquisition',{x0:3,y0:4,x1:34,y1:26},{id:'positive'});await state.add('exclusion',{x0:12,y0:10,x1:18,y1:16},{id:'negative'});return state.snapshot();}

async function importSession(h,value){
 const file=new File([JSON.stringify(value)],'session.json',{type:'application/json'});
 await h.document.getElementById('session-file').onchange({target:{files:[file]}});
}


test('a stale import must not transfer Original options to a replacement source',async()=>{
 const h=setup(),entered=deferred(),gate=deferred();let importing;
 try{
  await h.workspace.openImage(image('source.png'));
  const old=h.workspace.state.documents.get('original').originalRegions,restore=old.restore;
  old.restore=async value=>{const result=await restore(value);entered.resolve();await gate.promise;return result;};
  importing=importSession(h,{schema:'sherloq.session/1',operation:'original',sha256:sourceShape.sourceSha256,originalSourceRegions:await snapshot(),originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts:false}});
  await entered.promise;
  await h.workspace.openImage(image('different.png'));
  const next=h.workspace.state.documents.get('original').originalRegions;
  assert.notEqual(next,old);assert.equal(next.snapshot().sourceSha256,'a'.repeat(64));assert.equal(next.serializeOptions().excludeTexts,true);
  gate.resolve();await importing;
  assert.equal(next.serializeOptions().excludeTexts,true,'old-session preference crossed to the replacement source');
 }finally{gate.resolve();await importing;await h.dispose();}
});

test('same encoded SHA with a new Original owner still invalidates a suspended import',async()=>{
 const h=setup(),entered=deferred(),gate=deferred();let importing;
 try{await h.workspace.openImage(image('source.png'));const old=h.workspace.state.documents.get('original').originalRegions,restore=old.restore;
 old.restore=async value=>{const answer=await restore(value);entered.resolve();await gate.promise;return answer;};
 importing=importSession(h,{schema:'sherloq.session/1',operation:'original',sha256:sourceShape.sourceSha256,originalSourceRegions:await snapshot(),originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts:false}});await entered.promise;
 await h.workspace.openImage(image('same-sha-new-owner.png'));const next=h.workspace.state.documents.get('original').originalRegions;assert.notEqual(next,old);assert.equal(next.snapshot().sourceSha256,sourceShape.sourceSha256);
 gate.resolve();await importing;assert.equal(next.serializeOptions().excludeTexts,true,'a matching SHA cannot authorize a different Original owner');
 }finally{gate.resolve();await importing;await h.dispose();}
});

test('without Original geometry a stale tool import cannot adopt into a new tool record after openTool',async()=>{
 const h=setup(),gate=deferred();let importing;
 try{await h.workspace.openImage(image('source.png'));const old=h.workspace.state.documents.get('original'),input=await old.inputReady;old.inputReady=gate.promise;
 importing=importSession(h,{schema:'sherloq.session/1',operation:'file.hex',sha256:sourceShape.sourceSha256,originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts:false}});
 while(!h.workspace.state.documents.get('file.hex')?.controller)await tick();
 await h.workspace.openImage(image('different.png'));await h.workspace.openTool('file.hex');const next=h.workspace.state.documents.get('file.hex').controller;
 gate.resolve(input);await importing;
 assert.equal((h.calls.restoredSessions??[]).filter(r=>r.controller===next).length,0,'old import resumed into the new tool with the same operation ID');
 assert.equal(h.workspace.state.documents.get('original').originalRegions.serializeOptions().excludeTexts,true);
 }finally{gate.resolve();await importing;await h.dispose();}
});

const sessionValue=(excludeTexts)=>({schema:'sherloq.session/1',operation:'original',sha256:sourceShape.sourceSha256,originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts}});

test('a claimed initial pending session is not replayed after its source was replaced and the old import cancelled',async()=>{
 const entered=deferred(),gate=deferred();let gated=false;
 const h=setup({originalRegionHook(owner,options){if(options.source()?.name!=='source.png'||gated)return;gated=true;const restore=owner.restore;owner.restore=async v=>{const result=await restore(v);entered.resolve();await gate.promise;return result;};}});let opening;
 try{await importSession(h,{...sessionValue(false),originalSourceRegions:await snapshot()});opening=h.workspace.openImage(image('source.png'));await entered.promise;
 await h.workspace.openImage(image('different.png'));gate.resolve();await opening;
 await h.workspace.openImage(image('source-again.png'));const final=h.workspace.state.documents.get('original').originalRegions;
 assert.equal(final.snapshot().sourceSha256,sourceShape.sourceSha256);assert.equal(final.serializeOptions().excludeTexts,true,'cancelled initial pending session was replayed on a later image');
 }finally{gate.resolve();await opening;await h.dispose();}
});

test('a newer pending import made during old source cleanup is not overwritten by captured pending state',async()=>{
 const h=setup(),entered=deferred(),gate=deferred();let opening;
 try{await importSession(h,sessionValue(false));await h.workspace.openImage(image('different.png'));const old=h.workspace.state.documents.get('original').originalRegions,dispose=old.dispose;old.dispose=async()=>{await dispose();entered.resolve();await gate.promise;};
 opening=h.workspace.openImage(image('source.png'));await entered.promise;await importSession(h,sessionValue(true));gate.resolve();await opening;
 assert.equal(h.workspace.state.documents.get('original').originalRegions.serializeOptions().excludeTexts,true,'new pending import was overwritten by the old captured session');
 }finally{gate.resolve();await opening;await h.dispose();}
});

test('a newer import on the same source wins over an older suspended import',async()=>{
 const h=setup(),entered=deferred(),gate=deferred();let first;
 try{await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions,restore=owner.restore;let blocked=false;owner.restore=async v=>{const answer=await restore(v);if(!blocked){blocked=true;entered.resolve();await gate.promise;}return answer;};
 first=importSession(h,{...sessionValue(false),originalSourceRegions:await snapshot()});await entered.promise;await importSession(h,sessionValue(true));gate.resolve();await first;
 assert.equal(owner.serializeOptions().excludeTexts,true,'older import overwrote the newer preference on the same source');
 }finally{gate.resolve();await first;await h.dispose();}
});

test('a pending session for another image can still wait for the correct source before being consumed',async()=>{
 const h=setup();try{await importSession(h,sessionValue(false));await h.workspace.openImage(image('different.png'));assert.equal(h.workspace.state.documents.get('original').originalRegions.serializeOptions().excludeTexts,true);await h.workspace.openImage(image('source.png'));assert.equal(h.workspace.state.documents.get('original').originalRegions.serializeOptions().excludeTexts,false);}finally{await h.dispose();}
});

test('a definitively invalid pending geometry is consumed once rather than retried on all subsequent images',async()=>{
 const h=setup(),digest=crypto.subtle.digest.bind(crypto.subtle);let validations=0;
 const originalDigest=crypto.subtle.digest;crypto.subtle.digest=function(algorithm,data){const text=new TextDecoder().decode(data);if(text.includes('pending-invalid'))validations++;return digest(algorithm,data);};
 try{const regions=structuredClone(await snapshot());regions.zones[0].id='pending-invalid';regions.fingerprint='0'.repeat(64);await importSession(h,{...sessionValue(false),originalSourceRegions:regions});await h.workspace.openImage(image('source.png'));const first=validations;assert.equal(first,1);await h.workspace.openImage(image('source-again.png'));assert.equal(validations,first,'failed pending geometry was revalidated after a subsequent source change');}finally{crypto.subtle.digest=originalDigest;await h.dispose();}
});
