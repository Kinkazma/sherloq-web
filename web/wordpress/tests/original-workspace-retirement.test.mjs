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

function setup({pdfGate, selectedFile, batchSourceAware=false,originalRegionHook,preparationClientFactory} = {}) {
  const {document, window} = parseHTML(html), panels = new Map(), readers = new Map(), frames = [], calls = {loads: [], disposed: [], pdfFiles: [], batchImports: [], batchSources: [], settings: [], stale: [], regionDisposals: []};
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true, get() {return [...this.options].find(option => option.hasAttribute('selected'))?.value || this.options[0]?.value || '';}, set(value) {for (const option of this.options) option.toggleAttribute('selected', option.value === String(value));}});
  for (const [key, value] of Object.entries({document, window, DOMParser, location: {hash: '#lang=fr', href: 'http://localhost/app.html', origin: 'http://localhost'}, localStorage: {getItem: () => null, setItem() {}}, requestAnimationFrame: callback => (frames.push(callback), frames.length), cancelAnimationFrame() {}, confirm: () => true})) Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  const workspace = mountWorkspace(document, {
    originalRegionsFactory(options){const owner=createOriginalSourceRegionsController({...options,...(preparationClientFactory?{preparationClientFactory,getClient:undefined}:{})});originalRegionHook?.(owner,options);return owner;},
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



test('workspace retains a closed Original owner after a cleanup ACK rejection for a later retry',async()=>{
 let releases=0,live=true;const primary=Object.freeze(new Error('prepare primary'));
 const h=setup({preparationClientFactory:async()=>({async prepare(){throw primary;},async dispose(){releases++;if(releases<3)throw Error('ACK rejected');live=false;}})});
 try{await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions;await assert.rejects(owner.detect(),e=>e===primary);assert.equal(releases,1);await h.workspace.closeAll();assert.equal(releases,2);assert.equal(live,true);await h.workspace.closeAll();assert.equal(releases,3,'second closeAll discarded the rejected cleanup record instead of retrying it');assert.equal(live,false);}finally{await h.dispose();}
});

test('workspace closes independent panel owners even if Original cleanup rejects and does not repeat a successful phase',async()=>{
 const primary=Object.freeze(new Error('Original ACK'));let originalCalls=0,panelCalls=0;const h=setup();
 try{await h.workspace.openImage(image('source.png'));const record=h.workspace.state.documents.get('original'),dispose=record.originalRegions.dispose;record.originalRegions.dispose=()=>{originalCalls++;return originalCalls===1?Promise.reject(primary):dispose();};record.controller.dispose=()=>{panelCalls++;};await h.workspace.closeDocument('original');assert.equal(originalCalls,1);assert.equal(panelCalls,1);await h.workspace.closeAll();assert.equal(originalCalls,2);assert.equal(panelCalls,1);assert.equal(primary.message,'Original ACK');}finally{await h.dispose();}
});

test('concurrent close requests share the pending retirement of the same old record',async()=>{
 const entered=deferred(),gate=deferred(),h=setup();let originalCalls=0,panelCalls=0;
 try{await h.workspace.openImage(image('source.png'));const record=h.workspace.state.documents.get('original'),dispose=record.originalRegions.dispose;record.originalRegions.dispose=async()=>{originalCalls++;entered.resolve();await gate.promise;await dispose();};record.controller.dispose=()=>{panelCalls++;};const a=h.workspace.closeAll();await entered.promise;const b=h.workspace.closeAll();await tick();assert.equal(originalCalls,1);gate.resolve();await Promise.all([a,b]);assert.equal(originalCalls,1);assert.equal(panelCalls,1);}finally{gate.resolve();await h.dispose();}
});

test('retrying a failed analysis cleanup preserves the still-open Original owner',async()=>{
 const h=setup();let toolDisposals=0;
 try{await h.workspace.openImage(image('source.png'));const original=h.workspace.state.documents.get('original');await h.workspace.openTool('file.hex');const controller=h.workspace.state.documents.get('file.hex').controller;controller.dispose=()=>{if(++toolDisposals===1)throw Object.freeze(new Error('tool ACK'));};await h.workspace.closeAnalyses();assert.equal(toolDisposals,1);assert.equal(h.workspace.state.documents.get('original'),original);assert.notEqual(original.originalRegions.serializeOptions(),null);await h.workspace.closeAnalyses();assert.equal(toolDisposals,2);assert.equal(h.workspace.state.documents.get('original'),original);assert.notEqual(original.originalRegions.serializeOptions(),null);}finally{await h.dispose();}
});
