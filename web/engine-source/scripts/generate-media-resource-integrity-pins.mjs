import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root = new URL('../', import.meta.url);
const media = new URL('vendor/media/', root);
const target = new URL('src/media-resource-integrity.js', root);
const pinned = JSON.parse(await readFile(new URL('PINNED.json', media)));
const historical = [
  ['magick', 'magick/x86/magick.wasm'],
  ['avifSt', 'avif/avif-st.wasm'],
  ['srgb', 'srgb.icc'],
];

async function verifiedFile(file, expectedHash, expectedBytes) {
  const bytes = await readFile(new URL(file, media));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedHash || (expectedBytes !== undefined && bytes.length !== expectedBytes)) {
    throw Error('Pinned media source differs: ' + file);
  }
  return {file, bytes: bytes.length, sha256};
}

function resourceRow(id, {file, bytes, sha256}) {
  return ` ${id}:Object.freeze({file:'${file}',url:new URL('../vendor/media/${file}',import.meta.url).href,bytes:${bytes},sha256:'${sha256}'})`;
}

const rows = [];
for (const [id, file] of historical) {
  rows.push(resourceRow(id, await verifiedFile(file, pinned.files[file])));
}

const hpPins = JSON.parse(await readFile(new URL('magick-native/PINNED.json', media)));
if (hpPins.schema !== 'sherloq.native-magick-resources/1' || hpPins.variants?.length !== 2) {
  throw Error('The two native Magick precision variants must be pinned.');
}
const hpRows = [];
for (const depth of [16, 32]) {
  const variant = hpPins.variants.find(entry => entry.quantumDepth === depth);
  const {initialWasmBytes, moduleMaximumWasmBytes, quantumStorageBytes} = variant ?? {};
  if (!variant?.hdri || !variant.pagedCache || variant.files?.length !== 2
      || quantumStorageBytes !== depth / 4
      || ![initialWasmBytes, moduleMaximumWasmBytes].every(value =>
        Number.isSafeInteger(value) && value >= 65536 && value <= 2 ** 32 && value % 65536 === 0)
      || initialWasmBytes > moduleMaximumWasmBytes) {
    throw Error('Invalid native Magick precision metadata: ' + depth);
  }
  async function readVariantFile(extension) {
    const file = `magick-native/q${depth}/native-magick.${extension}`;
    const pin = variant.files.find(entry => entry.target === 'vendor/media/' + file);
    if (!Number.isSafeInteger(pin?.bytes) || pin.bytes <= 0) {
      throw Error('Missing native Magick file identity: ' + file);
    }
    return verifiedFile(file, pin.sha256, pin.bytes);
  }
  const wasm = await readVariantFile('wasm');
  const glue = await readVariantFile('mjs');
  const wasmResourceId = `magickNative${depth}`;
  rows.push(resourceRow(wasmResourceId, wasm));
  hpRows.push(` ${depth}:Object.freeze({quantumDepth:${depth},wasmResourceId:'${wasmResourceId}',moduleURL:new URL('../vendor/media/${glue.file}',import.meta.url).href,moduleSourceBytes:${glue.bytes},moduleSourceSha256:'${glue.sha256}',initialWasmBytes:${initialWasmBytes},moduleMaximumWasmBytes:${moduleMaximumWasmBytes},quantumStorageBytes:${quantumStorageBytes}})`);
}

const block = [
  '// BEGIN GENERATED MEDIA PINS',
  'export const MEDIA_RESOURCE_PINS=Object.freeze({',
  rows.join(',\n'),
  '});',
  'export const NATIVE_MAGICK_RESOURCE_METADATA=Object.freeze({',
  hpRows.join(',\n'),
  '});',
  '// END GENERATED MEDIA PINS',
].join('\n');
const before = await readFile(target, 'utf8');
const pattern = /\/\/ BEGIN GENERATED MEDIA PINS[\s\S]*?\/\/ END GENERATED MEDIA PINS/;
if (!pattern.test(before)) throw Error('Media pin block is missing');
const after = before.replace(pattern, block);
if (process.argv.includes('--check')) {
  if (after !== before) throw Error('Media resource pins require regeneration');
} else if (after !== before) {
  await writeFile(target, after);
}
console.log(JSON.stringify({status: 'pinned-media-identities-match', resources: rows.length, nativeMagickGlues: hpRows.length}));
