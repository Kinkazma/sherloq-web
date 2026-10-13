import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {sha256, validateManifest} from '../sherloq-browser/assets/dependency-core.js';
import {createChunkLoader} from '../sherloq-browser/assets/dependency-store.js';
import {localModelEntries, importLocalModelFiles, removeImportedLocalChunks, mountDependencyControls} from '../sherloq-browser/assets/dependency-library.js';

const names = ['selfdm-map-512.onnx', 'superpoint-dense-folded.onnx', 'superpoint-post-folded.onnx', 'superglue-indoor.onnx'];
const scopeURL = 'https://app.test/assets/';
const chunkURL = hash => new URL('./__dependency_chunks__/' + hash, scopeURL).href;
const file = (name, bytes) => new File([bytes], name);

async function fixture() {
  const manifest = {schema: 'sherloq.dependencies/1', remoteBase: null, slots: ['models'], files: {}, chunks: {}};
  const bytes = new Map();
  async function add(name, values, localOnly) {
    const value = Uint8Array.from(values), chunks = [];
    for (let offset = 0; offset < value.length; offset += 3) {
      const part = value.subarray(offset, offset + 3), hash = await sha256(part); chunks.push(hash); manifest.chunks[hash] = part.length;
    }
    manifest.files['models/' + name] = {size: value.length, sha256: await sha256(value), chunks, type: 'application/octet-stream', ...(localOnly ? {localOnly: true} : {})};
    bytes.set(name, value);
  }
  for (const [index, name] of names.entries()) await add(name, [1,2,3,4,5,6].map(value => value + index * 20), true);
  await add('operators.wasm', [0,97,115,109,1,0,0,0], true); await add('public.onnx', [201,202,203], false);
  validateManifest(manifest);
  const stores = new Map(); let writes = 0, writeFailure, afterWrite;
  const storage = {async open(name) {
    if (!stores.has(name)) stores.set(name, new Map()); const values = stores.get(name);
    return {values, async match(url) {return values.get(String(url))?.clone();},
      async put(url, response) {if (writeFailure) throw writeFailure; writes++; values.set(String(url), response.clone()); await afterWrite?.();},
      async delete(url) {return values.delete(String(url));}, async keys() {return [...values.keys()].map(url => ({url}));}};
  }};
  const cache = await storage.open('sherloq-dependency-chunks-v1');
  return {manifest, bytes, storage, cache, selected: names.map(name => file(name, bytes.get(name))),
    get writes() {return writes;}, set writeFailure(value) {writeFailure = value;}, set afterWrite(value) {afterWrite = value;}};
}

test('four original local models import by exact name with complete SHA and chunk parity, bounded slices and no remote requests', async () => {
  const f = await fixture(), progress = [], reads = [];
  f.manifest.files['models/another/' + names[0]] = structuredClone(f.manifest.files['models/' + names[0]]);
  const original = f.selected[0], bounded = {name: original.name, size: original.size,
    arrayBuffer() {assert.fail('No complete-file arrayBuffer');},
    slice(start, end) {reads.push(end - start); return original.slice(start, end);}};
  const result = await importLocalModelFiles([bounded, ...f.selected.slice(1)], f.manifest, f.cache, {scopeURL, progress: value => progress.push(value)});
  assert.equal(result.imported.length, 4); assert.deepEqual(result.rejected, []); assert.deepEqual(result.duplicates, []);
  assert.equal(result.imported[0].paths.length, 2); assert.ok(reads.every(size => size <= 3));
  assert.deepEqual(progress.map(value => value.completed), [1,2,3,4]); assert.ok(progress.every(value => value.total === 4));
  let requests = 0;
  const load = createChunkLoader(f.manifest, {base: null, scope: scopeURL, cacheStorage: f.storage, folder: async () => null,
    fetcher: async () => {requests++; assert.fail('Local-only import must not request the network');}});
  for (const name of names) {
    const parts = [];
    for (const hash of f.manifest.files['models/' + name].chunks) parts.push(await load(hash));
    assert.deepEqual(Buffer.concat(parts), Buffer.from(f.bytes.get(name)));
  }
  assert.equal(requests, 0);
});

test('public or unknown names, wrong length and corrupted bytes cannot count as imported models', async () => {
  const f = await fixture(), corrupted = Uint8Array.from(f.bytes.get(names[1])); corrupted[0]++;
  const result = await importLocalModelFiles([file('public.onnx', f.bytes.get('public.onnx')), file('unknown.onnx', [1]),
    file(names[0], [1]), file(names[1], corrupted)], f.manifest, f.cache, {scopeURL});
  assert.equal(result.imported.length, 0); assert.equal(result.rejected.length, 4); assert.equal(f.writes, 0);
  assert.deepEqual(result.rejected.map(value => value.code), ['LOCAL_MODEL_NAME', 'LOCAL_MODEL_NAME', 'LOCAL_MODEL_LENGTH', 'LOCAL_MODEL_IMPORT']);
  assert.match(result.rejected[3].message, /integrity/);
});

test('integral file SHA is checked independently of verified chunk hashes and duplicate inputs do not inflate the model count', async () => {
  const f = await fixture(), wrong = structuredClone(f.manifest); wrong.files['models/' + names[0]].sha256 = '0'.repeat(64);
  const rejected = await importLocalModelFiles([f.selected[0]], wrong, f.cache, {scopeURL});
  assert.equal(rejected.imported.length, 0); assert.equal(rejected.rejected[0].code, 'LOCAL_MODEL_INTEGRITY');
  assert.equal(rejected.rejected[0].details.receivedSha256, f.manifest.files['models/' + names[0]].sha256);
  const result = await importLocalModelFiles([f.selected[1], f.selected[1]], f.manifest, f.cache, {scopeURL});
  assert.equal(result.imported.length, 1); assert.deepEqual(result.duplicates, [names[1]]);
});

test('ambiguous same-name model identities are refused instead of guessing a manifest path', async () => {
  const f = await fixture(); f.manifest.files['models/different/' + names[0]] = structuredClone(f.manifest.files['models/' + names[1]]);
  const result = await importLocalModelFiles([f.selected[0]], f.manifest, f.cache, {scopeURL});
  assert.equal(result.imported.length, 0); assert.equal(result.rejected[0].code, 'LOCAL_MODEL_AMBIGUOUS'); assert.equal(f.writes, 0);
});

test('targeted removal preserves pre-existing local chunks, public chunks and unrelated cache entries', async () => {
  const f = await fixture(), oldHash = f.manifest.files['models/' + names[0]].chunks[0], publicHash = f.manifest.files['models/public.onnx'].chunks[0], unknown = 'f'.repeat(64);
  await f.cache.put(chunkURL(oldHash), new Response(f.bytes.get(names[0]).subarray(0,3)));
  await f.cache.put(chunkURL(publicHash), new Response(f.bytes.get('public.onnx')));
  await f.cache.put(chunkURL(unknown), new Response('unrelated'));
  const result = await importLocalModelFiles(f.selected, f.manifest, f.cache, {scopeURL});
  assert.ok(!result.addedChunks.includes(oldHash));
  const removed = await removeImportedLocalChunks(f.manifest, [...result.addedChunks, publicHash, unknown], f.cache, {scopeURL});
  assert.equal(removed.removed.length, result.addedChunks.length); assert.deepEqual(removed.kept, [publicHash, unknown]);
  assert.deepEqual([...f.cache.values.keys()].sort(), [chunkURL(oldHash),chunkURL(publicHash),chunkURL(unknown)].sort());
  assert.deepEqual(new Uint8Array(await (await f.cache.match(chunkURL(oldHash))).arrayBuffer()), f.bytes.get(names[0]).subarray(0,3));
});

test('chunks also used by public dependencies are excluded from local-import removal', async () => {
  const f = await fixture(); f.manifest.files['models/shared-public.onnx'] = {...structuredClone(f.manifest.files['models/' + names[0]]), localOnly: false};
  const result = await importLocalModelFiles([f.selected[0]], f.manifest, f.cache, {scopeURL});
  assert.equal(result.imported.length, 1); assert.deepEqual(result.addedChunks, []);
  const hashes = f.manifest.files['models/' + names[0]].chunks;
  const removed = await removeImportedLocalChunks(f.manifest, hashes, f.cache, {scopeURL});
  assert.deepEqual(removed.kept, hashes); assert.equal(f.cache.values.size, hashes.length);
});

test('quota failure reports rejection, and cancellation retains only explicitly recorded verified pieces for cleanup', async () => {
  const f = await fixture(); f.writeFailure = new DOMException('Cache is full', 'QuotaExceededError');
  const rejected = await importLocalModelFiles([f.selected[0]], f.manifest, f.cache, {scopeURL});
  assert.equal(rejected.imported.length, 0); assert.match(rejected.rejected[0].message, /Cache is full/); assert.deepEqual(rejected.addedChunks, []);
  f.writeFailure = null; const controller = new AbortController(), added = [];
  await assert.rejects(importLocalModelFiles([f.selected[0]], f.manifest, f.cache, {scopeURL, signal: controller.signal,
    onAddedChunk(hash) {added.push(hash); controller.abort();}}), error => error.name === 'AbortError');
  assert.equal(added.length, 1); assert.equal(f.cache.values.size, 1);
  await removeImportedLocalChunks(f.manifest, added, f.cache, {scopeURL}); assert.equal(f.cache.values.size, 0);
});

async function uiFixture() {
  const f = await fixture(), {document,window} = parseHTML('<html lang="fr"><body><div id="settings-menu"><div></div></div></body></html>');
  const bytes = new TextEncoder().encode(JSON.stringify(f.manifest)), identity = await sha256(bytes), previous = {};
  for (const key of ['fetch','caches','MutationObserver','indexedDB']) previous[key] = globalThis[key];
  globalThis.fetch = async input => {assert.ok(String(input).endsWith('dependency-manifest-' + identity + '.json')); return new Response(bytes);};
  globalThis.caches = f.storage; globalThis.MutationObserver = class {observe() {}};
  globalThis.indexedDB = {open() {throw Error('No remembered folder in this fixture');}};
  window.HTMLElement.prototype.showModal = function() {this.setAttribute('open','');};
  window.HTMLElement.prototype.close = function() {this.removeAttribute('open');};
  const controls = mountDependencyControls(document, {enabled:true,manifest:identity}); await controls.ready;
  const input = document.getElementById('dependency-local-model-files'); let clicks = 0; input.click = () => clicks++;
  Object.defineProperty(input, 'files', {configurable:true,writable:true,value:[]});
  return {...f,document,controls,input,get clicks() {return clicks;},
    async import(files) {input.files=files;await input.onchange();},
    dispose() {document.getElementById('dependency-dialog').remove();for(const [key,value] of Object.entries(previous)) if(value===undefined)delete globalThis[key];else globalThis[key]=value;}};
}

test('local-model GUI exposes exact manifest names and extensions, verifies four originals and cleans only its own new chunks', async () => {
  const f = await uiFixture();
  try {
    f.controls.open(); const importButton=f.document.getElementById('dependency-import-local'),remove=f.document.getElementById('dependency-remove-local'),status=f.document.querySelector('#dependency-dialog [role=status]');
    assert.equal(importButton.textContent,'Importer modèles locaux…');assert.equal(importButton.disabled,false);
    assert.equal(f.input.multiple,true);assert.equal(f.input.accept,'.onnx,.wasm');
    const listed=[...f.document.querySelectorAll('.dependency-local-model-list li')].map(node=>node.textContent);
    assert.deepEqual(listed,[...names,'operators.wasm'].sort());assert.ok(!listed.includes('public.onnx'));
    importButton.onclick();assert.equal(f.clicks,1);assert.equal(remove.disabled,true);
    const old=f.manifest.files['models/'+names[0]].chunks[0],key=new URL('./__dependency_chunks__/'+old,new URL('../sherloq-browser/assets/',import.meta.url)).href;
    await f.cache.put(key,new Response(f.bytes.get(names[0]).subarray(0,3)));
    await f.import(f.selected);assert.match(status.textContent,/4 modèle\(s\) importé\(s\) et vérifié\(s\)/);assert.equal(remove.disabled,false);
    await remove.onclick();assert.equal(remove.disabled,true);assert.equal(f.cache.values.size,1);assert.ok(f.cache.values.has(key));assert.match(status.textContent,/7 morceaux.*retirés/);
    f.document.documentElement.lang='en';f.controls.open();assert.equal(importButton.textContent,'Import local models…');assert.equal(remove.textContent,'Remove these imports from cache');
  } finally {f.dispose();}
});

test('local-model GUI reports honest mixed counts and never claims a public or corrupted file was installed', async () => {
  const f=await uiFixture();
  try {
    const corrupt=Uint8Array.from(f.bytes.get(names[1]));corrupt[0]++;
    await f.import([f.selected[0],file('public.onnx',f.bytes.get('public.onnx')),file(names[1],corrupt)]);
    const text=f.document.querySelector('#dependency-dialog [role=status]').textContent;
    assert.match(text,/1 modèle\(s\) importé\(s\) et vérifié\(s\)/);assert.match(text,/2 fichier\(s\) refusé\(s\)/);
    assert.match(text,/public.onnx — nom absent/);assert.match(text,/superpoint-dense-folded.onnx — empreinte SHA-256 incorrecte/);
    assert.equal(f.cache.values.size,2);
  } finally {f.dispose();}
});
