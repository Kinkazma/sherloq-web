import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML, DOMParser} from 'linkedom';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../sherloq-browser/assets/original-source-regions.js';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';

const html = await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/app.html')), 'utf8');
const panel = await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/panel.html')), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
const image = name => new File(['image transport only'], name, {type: 'image/png'});
const pdf = name => new File(['%PDF-1.7\ntransport only'], name, {type: 'application/pdf'});

function setup({pdfGate, selectedFile, batchSourceAware=false} = {}) {
  const {document, window} = parseHTML(html), panels = new Map(), readers = new Map(), frames = [], calls = {loads: [], disposed: [], pdfFiles: [], batchImports: [], batchSources: [], settings: [], stale: [], regionDisposals: []};
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true, get() {return [...this.options].find(option => option.hasAttribute('selected'))?.value || this.options[0]?.value || '';}, set(value) {for (const option of this.options) option.toggleAttribute('selected', option.value === String(value));}});
  for (const [key, value] of Object.entries({document, window, DOMParser, location: {hash: '#lang=fr', href: 'http://localhost/app.html', origin: 'http://localhost'}, localStorage: {getItem: () => null, setItem() {}}, requestAnimationFrame: callback => (frames.push(callback), frames.length), cancelAnimationFrame() {}, confirm: () => true})) Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  const workspace = mountWorkspace(document, {
    fetcher: async () => ({ok: true, text: async () => panel}),
    panelFactory(_document, options) {
      const id = options.sourceOnly ? 'original' : options.toolId;
      let sourceFile, adopted;
      calls.panelOptions??=new Map();calls.panelOptions.set(id,options);
      const controller = {
        busy: false, async load(value) {sourceFile = value; calls.loads.push(value);},
        adopt(value) {adopted = value;controller.adoptedSourceRegions=value.sourceRegions;},
        input() {return adopted ?? {file: sourceFile, imageId: 'shared-original', hash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', source: {width: 40, height: 30, draw() {}, close() {}}, description: sourceFile?.name};},
        refreshOriginalRegions() {controller.regionDraws=(controller.regionDraws??0)+1;},markSourceRegionsStale(value) {calls.stale.push({id,value});controller.regionsStale=false;},snapshot() {return {busy: controller.busy, hasResult: id !== 'original', hasReport: false, status: 'ready', progress: 0, zoom: 100};},
        settings() {calls.settings.push(id); return {};}, applySettings() {}, activate() {}, fit() {}, zoomBy() {}, setLanguage() {}, setTheme() {}, setNavigation() {}, setComputeProfile() {}, setLoupe() {}, setHighlight() {},
        exportImage(value) {controller.exported = value ?? 'dialog';}, saveSession() {controller.sessions = (controller.sessions ?? 0) + 1;},
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

test('workspace session restores Original detection options before opening an independent tool',async()=>{
 const h=setup();try{
  await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions;
  const regions=await snapshot();
  await importSession(h,{schema:'sherloq.session/1',operation:'original',sha256:sourceShape.sourceSha256,originalSourceRegions:regions,originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts:false}});
  assert.equal(owner.snapshot().fingerprint,regions.fingerprint);assert.equal(owner.serializeOptions().excludeTexts,false);
  const checkbox=h.workspace.state.documents.get('original').originalRegionsElement.querySelector('[data-original-regions="texts"]');assert.equal(checkbox.checked,false);
  await h.workspace.openTool('file.hex');const host=h.calls.panelOptions.get('file.hex');
  assert.deepEqual(host.getOriginalSourceRegionOptions(),{schema:'sherloq.original-region-options/1',excludeTexts:false});
  assert.equal(h.panels.get('file.hex').adoptedSourceRegions.fingerprint,regions.fingerprint);
 }finally{await h.dispose();}
});

test('invalid Original session preference does not partially restore scientific geometry',async()=>{
 const h=setup();try{
  await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions,before=owner.snapshot();
  const regions=await snapshot();
  await importSession(h,{schema:'sherloq.session/1',operation:'original',sha256:sourceShape.sourceSha256,originalSourceRegions:regions,originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts:'false'}});
  assert.equal(owner.snapshot(),before);assert.equal(owner.serializeOptions().excludeTexts,true);
  assert.match(h.document.getElementById('workspace-status').textContent,/Invalid original source detection options/);
 }finally{await h.dispose();}
});

test('legacy Original sessions preserve a user choice instead of re-enabling OCR',async()=>{
 const h=setup();try{
  await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions;
  owner.restoreOptions({schema:'sherloq.original-region-options/1',excludeTexts:false});
  await importSession(h,{schema:'sherloq.session/1',operation:'original',sha256:sourceShape.sourceSha256,originalSourceRegions:await snapshot()});
  assert.equal(owner.serializeOptions().excludeTexts,false);
 }finally{await h.dispose();}
});

test('foreign image sessions cannot change the Original detection choice',async()=>{
 const h=setup();try{
  await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions,before=owner.snapshot();
  await importSession(h,{schema:'sherloq.session/1',operation:'original',sha256:'a'.repeat(64),originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts:false}});
  assert.equal(owner.snapshot(),before);assert.equal(owner.serializeOptions().excludeTexts,true);
  assert.match(h.document.getElementById('workspace-status').textContent,/autre image/);
 }finally{await h.dispose();}
});

test('a foreign zone snapshot is rejected before adopting otherwise valid UI options',async()=>{
 const h=setup();try{
  await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions,before=owner.snapshot();
  const foreign=await createOriginalSourceRegionsState({...sourceShape,sourceSha256:'a'.repeat(64)});
  await importSession(h,{schema:'sherloq.session/1',operation:'original',sha256:sourceShape.sourceSha256,originalSourceRegions:foreign.snapshot(),originalSourceRegionOptions:{schema:'sherloq.original-region-options/1',excludeTexts:false}});
  assert.equal(owner.snapshot(),before);assert.equal(owner.serializeOptions().excludeTexts,true);
  assert.match(h.document.getElementById('workspace-status').textContent,/identity/);
 }finally{await h.dispose();}
});

