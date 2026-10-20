import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHTML, DOMParser} from 'linkedom';
import {mountWorkspace} from '../sherloq-browser/assets/workspace.js';

const html = await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/app.html')), 'utf8');
const panel = await readFile(new URL(import.meta.resolve('../sherloq-browser/assets/panel.html')), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
const image = name => new File(['image transport only'], name, {type: 'image/png'});
const pdf = name => new File(['%PDF-1.7\ntransport only'], name, {type: 'application/pdf'});

function setup({pdfGate, selectedFile} = {}) {
  const {document, window} = parseHTML(html), panels = new Map(), readers = new Map(), frames = [], calls = {loads: [], disposed: [], pdfFiles: [], batchImports: [], settings: []};
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {configurable: true, get() {return [...this.options].find(option => option.hasAttribute('selected'))?.value || this.options[0]?.value || '';}, set(value) {for (const option of this.options) option.toggleAttribute('selected', option.value === String(value));}});
  for (const [key, value] of Object.entries({document, window, DOMParser, location: {hash: '#lang=fr', href: 'http://localhost/app.html', origin: 'http://localhost'}, localStorage: {getItem: () => null, setItem() {}}, requestAnimationFrame: callback => (frames.push(callback), frames.length), cancelAnimationFrame() {}, confirm: () => true})) Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  const workspace = mountWorkspace(document, {
    fetcher: async () => ({ok: true, text: async () => panel}),
    panelFactory(_document, options) {
      const id = options.sourceOnly ? 'original' : options.toolId;
      let sourceFile, adopted;
      const controller = {
        busy: false, async load(value) {sourceFile = value; calls.loads.push(value);},
        adopt(value) {adopted = value;},
        input() {return adopted ?? {file: sourceFile, imageId: 'shared-original', hash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', source: {width: 40, height: 30, draw() {}, close() {}}, description: sourceFile?.name};},
        snapshot() {return {busy: controller.busy, hasResult: id !== 'original', hasReport: false, status: 'ready', progress: 0, zoom: 100};},
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
      return {dialog, open() {dialog.open = true; dialog.setAttribute('open', '');}, importFiles, busy: false, canExport: false};
    }
  });
  return {document, window, workspace, panels, readers, calls, flush() {while (frames.length) frames.shift()();}, async dispose() {window.dispatchEvent(new window.Event('pagehide')); await workspace.closeAll(); while (frames.length) frames.shift()(); window.dispatchEvent(new window.Event('pagehide'));}};
}

test('PDF records have independent identities and never enter image settings or source ownership', async () => {
  const h = setup();
  try {
    const source = image('original.png'); await h.workspace.openImage(source); await h.workspace.openTool('file.hex');
    const original = h.panels.get('original'), hex = h.panels.get('file.hex'); hex.busy = true;
    const a = await h.workspace.openPDF(pdf('a.pdf')), b = await h.workspace.openPDF(pdf('b.pdf')); h.flush();
    assert.notEqual(a.id, b.id); assert.match(a.id, /^pdf:/); assert.equal(a.kind, 'pdf');
    assert.equal(h.workspace.state.documents.size, 4); assert.equal(hex.busy, true); assert.equal(original.input().file, source);
    assert.deepEqual(h.calls.pdfFiles.map(value => value.name), ['a.pdf', 'b.pdf']);
    assert.equal(h.calls.loads.length, 1); assert.equal(h.calls.disposed.length, 0);
    h.workspace.saveTools(); assert.ok(h.calls.settings.every(id => !id.startsWith('pdf:')));
    assert.equal(h.document.getElementById('file-info').textContent, 'b.pdf');
  } finally {await h.dispose();}
});

test('closeAnalyses preserves PDFs and the same original owner, without another decode', async () => {
  const h = setup();
  try {
    await h.workspace.openImage(image('original.png')); await h.workspace.openTool('file.hex');
    const original = h.panels.get('original'), hex = h.panels.get('file.hex');
    const reader = await h.workspace.openPDF(pdf('preserved.pdf'));
    await h.workspace.closeDocument('original'); assert.ok(!h.calls.disposed.includes(original));
    await h.workspace.closeAnalyses(); h.flush();
    assert.deepEqual([...h.workspace.state.documents.keys()].sort(), ['original', reader.id].sort());
    assert.equal(h.panels.get('original'), original); assert.equal(h.calls.loads.length, 1);
    assert.equal(h.calls.disposed.filter(value => value === hex).length, 1);
    assert.equal(h.calls.disposed.filter(value => value === reader.controller).length, 0);
  } finally {await h.dispose();}
});

test('opening another image preserves all PDF documents but disposes the old image family', async () => {
  const h = setup();
  try {
    await h.workspace.openImage(image('old.png')); await h.workspace.openTool('file.hex');
    const old = [...h.panels.values()], a = await h.workspace.openPDF(pdf('a.pdf')), b = await h.workspace.openPDF(pdf('b.pdf'));
    const next = image('new.png'); await h.workspace.openImage(next); h.flush();
    assert.deepEqual([...h.workspace.state.documents.keys()].sort(), ['original', a.id, b.id].sort());
    for (const controller of old) assert.equal(h.calls.disposed.filter(value => value === controller).length, 1);
    for (const reader of [a, b]) assert.ok(!h.calls.disposed.includes(reader.controller));
    assert.equal(h.panels.get('original').input().file, next); assert.equal(h.calls.loads.length, 2);
  } finally {await h.dispose();}
});

test('opening a tool from a PDF adopts its selected page file and retains the reader', async () => {
  const selected = image('selected-page.png'), h = setup({selectedFile: async () => selected});
  try {
    const reader = await h.workspace.openPDF(pdf('paper.pdf'));
    await h.workspace.openTool('file.hex'); h.flush();
    assert.equal(h.panels.get('original').input().file, selected); assert.equal(h.panels.get('file.hex').input().file, selected);
    assert.equal(h.workspace.state.documents.get(reader.id), reader); assert.ok(!h.calls.disposed.includes(reader.controller));
    assert.equal(h.calls.loads.length, 1);
  } finally {await h.dispose();}
});

test('closing the source when only PDFs remain releases the image owner instead of retaining it hidden', async () => {
  const h = setup();
  try {
    await h.workspace.openImage(image('original.png')); const original = h.panels.get('original');
    const reader = await h.workspace.openPDF(pdf('reader.pdf'));
    await h.workspace.closeDocument('original');
    assert.equal(h.workspace.state.documents.size, 1); assert.equal(h.workspace.state.documents.get(reader.id), reader);
    assert.equal(h.calls.disposed.filter(value => value === original).length, 1);
  } finally {await h.dispose();}
});

test('closing a PDF while its factory is pending never resurrects it and disposes the late owner exactly once', async () => {
  const gate = deferred(), h = setup({pdfGate: gate});
  try {
    const opening = h.workspace.openPDF(pdf('slow.pdf')); await tick();
    const id = h.workspace.state.active, controller = h.readers.get('slow.pdf'); assert.ok(controller);
    const closing = h.workspace.closeDocument(id); h.flush();
    assert.equal(h.workspace.state.documents.size, 0); assert.equal(h.document.querySelectorAll('.document-window').length, 0);
    gate.resolve(); await Promise.all([opening, closing]); h.flush();
    assert.equal(h.workspace.state.documents.size, 0); assert.equal(h.document.querySelectorAll('.document-window').length, 0);
    assert.equal(h.calls.disposed.filter(value => value === controller).length, 1);
  } finally {gate.resolve(); await h.dispose();}
});

test('image-family reset preserves a pending PDF and passes its assigned file before the factory microtask', async () => {
  const gate = deferred(), h = setup({pdfGate: gate});
  try {
    const source = pdf('pending.pdf'), opening = h.workspace.openPDF(source); await tick();
    const id = h.workspace.state.active; assert.equal(h.calls.pdfFiles[0], source);
    await h.workspace.closeAll({preservePdfs: true}); assert.equal(h.workspace.state.documents.has(id), true);
    gate.resolve(); const record = await opening; h.flush();
    assert.equal(record.controller, h.readers.get('pending.pdf')); assert.equal(record.closed, undefined);
    assert.equal(h.calls.disposed.length, 0);
  } finally {gate.resolve(); await h.dispose();}
});

test('PDF export is available while unsupported session and report commands remain disabled', async () => {
  const h = setup();
  try {
    const reader = await h.workspace.openPDF(pdf('export.pdf')); h.flush(); const get = id => h.document.getElementById(id);
    assert.equal(get('export-image').disabled, false); assert.equal(get('quick-export-image').disabled, false);
    assert.equal(get('save-session').disabled, true); assert.equal(get('export-report').disabled, true);
    get('export-image').onclick(); assert.equal(reader.controller.exported, 'dialog');
    get('quick-export-image').onclick(); assert.equal(reader.controller.exported.format, 'webp');
    await h.workspace.openImage(image('image.png')); h.flush(); assert.equal(get('save-session').disabled, false);
  } finally {await h.dispose();}
});

test('a PDF drop on the main workspace opens the reader while batch dialog drops preserve batch ownership', async () => {
  const h = setup();
  const drop = (target, source) => {const event = new h.window.Event('drop', {bubbles: true, cancelable: true}); event.dataTransfer = {types: ['Files'], files: [source]}; target.dispatchEvent(event); return event;};
  try {
    const source = pdf('main.pdf'); const first = drop(h.document.getElementById('workspace-desk'), source); await tick(); h.flush();
    assert.equal(first.defaultPrevented, true); assert.equal(h.calls.pdfFiles.length, 1); assert.equal(h.calls.loads.length, 0);
    await h.document.getElementById('batch-open').onclick();
    const dialog = h.document.getElementById('batch-dialog'), batchFile = pdf('batch.pdf');
    drop(dialog.querySelector('.batch-drop'), batchFile); await tick();
    assert.deepEqual(h.calls.batchImports, [[batchFile]]); assert.equal(h.calls.pdfFiles.length, 1);
    drop(dialog, batchFile); await tick(); assert.deepEqual(h.calls.batchImports, [[batchFile], [batchFile]]);
    assert.equal(h.calls.pdfFiles.length, 1);
  } finally {await h.dispose();}
});

test('closing a reader during selected-page extraction prevents a late tool and image opening', async () => {
  const selected = deferred(), h = setup({selectedFile: () => selected.promise});
  try {
    const reader = await h.workspace.openPDF(pdf('closing.pdf'));
    const opening = h.workspace.openTool('file.hex'); await tick();
    await h.workspace.closeDocument(reader.id); selected.resolve(image('late-page.png')); await opening; h.flush();
    assert.equal(h.workspace.state.documents.size, 0); assert.equal(h.calls.loads.length, 0); assert.equal(h.panels.size, 0);
  } finally {selected.resolve(image('late-page.png')); await h.dispose();}
});

test('an already open image tool is recreated for the selected PDF page instead of exposing its old image result', async () => {
  const selected = image('new-pdf-page.png'), h = setup({selectedFile: async () => selected});
  try {
    await h.workspace.openImage(image('old.png')); await h.workspace.openTool('file.hex');
    const old = h.panels.get('file.hex'), reader = await h.workspace.openPDF(pdf('new.pdf'));
    await h.workspace.openTool('file.hex'); h.flush();
    assert.notEqual(h.panels.get('file.hex'), old); assert.equal(h.panels.get('file.hex').input().file, selected);
    assert.equal(h.calls.disposed.filter(value => value === old).length, 1);
    assert.equal(h.workspace.state.documents.get(reader.id), reader);
  } finally {await h.dispose();}
});

test('switching away from a PDF during selected-page extraction leaves the newly active source untouched', async () => {
  const selected = deferred(), h = setup({selectedFile: () => selected.promise});
  try {
    const original = image('current.png'); await h.workspace.openImage(original);
    await h.workspace.openPDF(pdf('slow.pdf')); const opening = h.workspace.openTool('file.hex'); await tick();
    h.workspace.selectDocument('original'); selected.resolve(image('unwanted.png')); await opening; h.flush();
    assert.equal(h.panels.get('original').input().file, original); assert.equal(h.calls.loads.length, 1);
    assert.equal(h.workspace.state.active, 'original'); assert.equal(h.workspace.state.documents.has('file.hex'), false);
  } finally {selected.resolve(image('unwanted.png')); await h.dispose();}
});

test('closeAll destroys both document families, including a late PDF factory, without reappearing tabs', async () => {
  const gate = deferred(), h = setup({pdfGate: gate});
  try {
    await h.workspace.openImage(image('source.png')); const opening = h.workspace.openPDF(pdf('slow.pdf')); await tick();
    const reader = h.readers.get('slow.pdf'), closing = h.workspace.closeAll(); h.flush();
    assert.equal(h.workspace.state.documents.size, 0); gate.resolve(); await Promise.all([opening, closing]); h.flush();
    assert.equal(h.workspace.state.documents.size, 0); assert.equal(h.document.querySelectorAll('.document-window').length, 0);
    assert.equal(h.calls.disposed.filter(value => value === reader).length, 1);
    assert.equal(h.document.getElementById('workspace-tabs').hidden, true);
  } finally {gate.resolve(); await h.dispose();}
});

test('closeAnalyses with only PDF documents retains every reader and its owner', async () => {
  const h = setup();
  try {
    const a = await h.workspace.openPDF(pdf('a.pdf')), b = await h.workspace.openPDF(pdf('b.pdf'));
    await h.workspace.closeAnalyses(); h.flush();
    assert.deepEqual([...h.workspace.state.documents.keys()].sort(), [a.id, b.id].sort());
    assert.equal(h.calls.disposed.length, 0); assert.equal(h.calls.loads.length, 0);
  } finally {await h.dispose();}
});

test('closing the last analysis releases its hidden image source even when a PDF remains', async () => {
  const h = setup();
  try {
    await h.workspace.openImage(image('hidden.png')); await h.workspace.openTool('file.hex');
    const original = h.panels.get('original'), reader = await h.workspace.openPDF(pdf('retained.pdf'));
    await h.workspace.closeDocument('original'); assert.equal(h.calls.disposed.includes(original), false);
    await h.workspace.closeDocument('file.hex'); h.flush();
    assert.deepEqual([...h.workspace.state.documents.keys()], [reader.id]);
    assert.equal(h.calls.disposed.filter(value => value === original).length, 1);
    assert.equal(h.calls.disposed.includes(reader.controller), false);
  } finally {await h.dispose();}
});
