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

test('Original source uses its own content control bar and live regions survive hiding and reopening without decode',async()=>{
 const h=setup();try{await h.workspace.openImage(image('source.png'));const record=h.workspace.state.documents.get('original'),owner=record.originalRegions;await owner.restore(await snapshot());h.flush();
 assert.notEqual(record.originalRegionsElement,record.regionElement);assert.equal(record.originalRegionsElement.hidden,false);assert.equal(record.regionElement.hidden,true);assert.equal(owner.snapshot().zones.length,2);assert.equal(record.originalRegionsElement.parentElement.id,'tool-controls');assert.equal(record.originalRegionsElement.parentElement.classList.contains('original-source-controls'),true);assert.equal(record.originalRegionsElement.parentElement.hidden,false);assert.equal(record.originalRegionsElement.querySelector('.original-source-regions-toolbar')!==null,true);assert.equal(record.originalRegionsElement.querySelector('.original-source-region-list').hasAttribute('open'),false);
 await h.workspace.openTool('file.hex');await h.workspace.closeDocument('original');assert.equal(record.closed,undefined);assert.equal(h.workspace.state.documents.has('original'),false);
 await h.workspace.openTool('original');assert.equal(h.workspace.state.documents.get('original'),record);assert.equal(record.originalRegions,owner);assert.equal(owner.snapshot().zones.length,2);assert.equal(h.calls.loads.length,1);h.flush();assert.equal(record.originalRegionsElement.parentElement.id,'tool-controls','Activating Original must not move its controls back into the dock');
 }finally{await h.dispose();}
});

test('tools inherit fresh independent snapshots and closing/reopening captures the latest Original selection',async()=>{
 const h=setup();try{await h.workspace.openImage(image('source.png'));const record=h.workspace.state.documents.get('original');await record.originalRegions.restore(await snapshot());await h.workspace.openTool('file.hex');const first=h.panels.get('file.hex').adoptedSourceRegions;assert.equal(first.zones.length,2);assert.notEqual(first,record.originalRegions.snapshot());
 await record.originalRegions.toggle(false);assert.equal(first.enabled,true);assert.equal(h.panels.get('file.hex').regionsStale,false);assert.equal(h.calls.stale.filter(v=>v.id==='file.hex').length,1);
 await h.workspace.openTool('file.digest');assert.equal(h.panels.get('file.digest').adoptedSourceRegions.enabled,false);assert.equal(h.calls.loads.length,1);
 const options=h.calls.panelOptions.get('file.hex'),global=options.getOriginalSourceRegions(),domain=await compileOriginalSourceRegions(first,{ceiling:global});assert.equal(domain.containsOriginal(14,12),false);assert.equal(global.enabled,false);await h.workspace.closeDocument('file.hex');await h.workspace.openTool('file.hex');assert.equal(h.panels.get('file.hex').adoptedSourceRegions.enabled,false,'A genuinely reopened tool captures the latest Original selection');assert.equal(first.enabled,true,'The closed tool snapshot remains immutable');
 }finally{await h.dispose();}
});

test('Original keyboard hook owns Cmd-Z and redo without consuming typing undo',async()=>{
 const h=setup();try{await h.workspace.openImage(image('source.png'));const record=h.workspace.state.documents.get('original'),owner=record.originalRegions;await owner.restore(await snapshot());await owner.remove('negative');const options=h.calls.panelOptions.get('original'),event={key:'z',metaKey:true,preventDefault(){this.prevented=true;},stopPropagation(){},composedPath:()=>[record.element]};
 assert.equal(options.onOriginalRegionsKeydown(event),true);await owner.ready;assert.equal(event.prevented,true);assert.equal(owner.snapshot().zones.length,2);
 assert.equal(options.onOriginalRegionsKeydown({...event,shiftKey:true}),true);await owner.ready;assert.equal(owner.snapshot().zones.length,1);
 const text=h.document.createElement('input');assert.equal(options.onOriginalRegionsKeydown({...event,composedPath:()=>[text]}),false);
 }finally{await h.dispose();}
});

test('closing the last image releases the region owner once while keeping a PDF alive',async()=>{
 const h=setup();try{await h.workspace.openImage(image('source.png'));const record=h.workspace.state.documents.get('original'),owner=record.originalRegions;await owner.restore(await snapshot());let disposals=0;const dispose=owner.dispose;owner.dispose=()=>{disposals++;return dispose();};await h.workspace.openTool('file.hex');await h.workspace.openPDF(pdf('retained.pdf'));await h.workspace.closeDocument('original');await h.workspace.closeDocument('file.hex');assert.equal(disposals,1);assert.equal(owner.snapshot(),null);assert.equal(h.workspace.state.documents.size,1);assert.equal([...h.workspace.state.documents.values()][0].kind,'pdf');assert.equal(h.calls.disposed.filter(c=>c===h.panels.get('original')).length,1);
 }finally{await h.dispose();}
});

test('session source regions validate source identity atomically before replacing the live state',async()=>{
 const h=setup();try{await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions;await h.workspace.restoreOriginalSourceRegions(await snapshot());const before=owner.snapshot();const foreign=await createOriginalSourceRegionsState({...sourceShape,sourceSha256:'a'.repeat(64)});await assert.rejects(h.workspace.restoreOriginalSourceRegions(foreign.snapshot()),/identity/);assert.equal(owner.snapshot(),before);assert.equal(h.calls.loads.length,1);
 }finally{await h.dispose();}
});

test('Open in batch transfers the exact verified snapshot only through a source-aware import API',async()=>{
 const h=setup({batchSourceAware:true});try{await h.workspace.openImage(image('source.png'));const record=h.workspace.state.documents.get('original');await record.originalRegions.restore(await snapshot());record.originalRegionsElement.querySelector('[data-original-regions=batch]').click();await tick();await tick();assert.equal(h.calls.batchSources.length,1);assert.equal(h.calls.batchSources[0].sourceRegions.fingerprint,record.originalRegions.snapshot().fingerprint);assert.equal(h.calls.batchSources[0].file,h.panels.get('original').input().file);assert.equal(h.calls.batchImports.length,0);
 }finally{await h.dispose();}
 const unavailable=setup();try{await unavailable.workspace.openImage(image('source.png'));const record=unavailable.workspace.state.documents.get('original');record.originalRegionsElement.querySelector('[data-original-regions=batch]').click();await tick();await tick();assert.match(unavailable.document.getElementById('workspace-status').textContent,/pas encore disponible/);assert.equal(unavailable.calls.batchImports.length,0);
 }finally{await unavailable.dispose();}
});

test('Original undo remains reachable when hiding its state button returns focus to the document',async()=>{
 const h=setup();try{await h.workspace.openImage(image('source.png'));const owner=h.workspace.state.documents.get('original').originalRegions;await owner.restore(await snapshot());const original=owner.snapshot();await owner.clear();await owner.toggle(false);const event=new h.window.Event('keydown',{bubbles:true,cancelable:true});event.key='z';event.metaKey=true;h.document.body.dispatchEvent(event);await owner.ready;assert.equal(event.defaultPrevented,true);assert.equal(owner.snapshot().enabled,true);assert.equal(owner.snapshot().zones.length,0);const second=new h.window.Event('keydown',{bubbles:true,cancelable:true});second.key='z';second.metaKey=true;h.document.body.dispatchEvent(second);await owner.ready;assert.equal(owner.snapshot().fingerprint,original.fingerprint);const input=h.document.createElement('input');h.document.body.append(input);const typing=new h.window.Event('keydown',{bubbles:true,cancelable:true});typing.key='z';typing.metaKey=true;input.dispatchEvent(typing);await owner.ready;assert.equal(typing.defaultPrevented,false);assert.equal(owner.snapshot().fingerprint,original.fingerprint);}finally{await h.dispose();}
});

test('workspace never mounts the obsolete shared Regions/Biomes sidebar',async()=>{const h=setup();try{assert.equal(h.document.querySelector('.detection-regions-dock'),null);await h.workspace.openImage(image('source.png'));await h.workspace.openTool('tampering.copyMove.sparse');h.flush();assert.equal(h.document.querySelector('.detection-regions-dock'),null);assert.equal(h.document.getElementById('toolbox').querySelector('.individual-region-owner'),null);}finally{await h.dispose();}});
