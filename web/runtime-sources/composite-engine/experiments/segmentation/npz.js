// NPY1.0 / stored ZIP, matching the existing portable exporter. Kept separate
// during development so the frozen0.29 common runtime is not changed in place.
import {requireValue, EngineError} from '../../src/errors.js';
const encoder = new TextEncoder(), little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const crcTable = Uint32Array.from({length: 256}, (_, n) => {let c = n; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;});
function header(type, shape) {
  let text = "{'descr': '" + type + "', 'fortran_order': False, 'shape': (" + shape.join(', ') + (shape.length === 1 ? ',' : '') + ')}';
  text += ' '.repeat((64 - (10 + text.length + 1) % 64) % 64) + '\n';
  const out = new Uint8Array(10 + text.length); out.set([147, 78, 85, 77, 80, 89, 1, 0]); new DataView(out.buffer).setUint16(8, text.length, true); out.set(encoder.encode(text), 10); return out;
}
export function segmentationNpz(data, {budget, maxBytes, provenance = {}}) {
  requireValue(budget && Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 0xffffffff, 'Shared export budget and byte limit required');
  requireValue(Number.isInteger(data?.width) && Number.isInteger(data.height) && data.width > 0 && data.height > 0 && data.metadata, 'Segmentation result required');
  const entries = [], n = data.width * data.height;
  const add = (name, parts, shape, type) => {
    requireValue(parts.every(a => a instanceof (type === '<f4' ? Float32Array : Uint8Array)) && parts.reduce((s, a) => s + a.length, 0) === shape.reduce((a, b) => a * b, 1), 'Typed export geometry');
    entries.push({name: encoder.encode(name + '.npy'), parts, header: header(type, shape), bytes: parts.reduce((s, a) => s + a.byteLength, 0)});
  };
  if (data.rawGrids !== undefined) {
    const shape = data.metadata.raw_shape;
    requireValue(Array.isArray(shape) && shape.length === 3 && [1, 3].includes(shape[0]) && [256, 512].includes(shape[1]) && shape[2] === shape[1] && Array.isArray(data.rawGrids) && data.rawGrids.length > 0 && data.rawGrids.length <= 256, 'Native raw grid geometry');
    add('raw_probabilities', data.rawGrids.map(g => g.raw), [data.rawGrids.length, ...shape], '<f4');
  } else {
    for (const name of ['map', 'mask', 'analyzed', 'candidates', ...(data.target !== undefined || data.source !== undefined ? ['target', 'source'] : [])]) {
      requireValue(data[name]?.length === n, 'Source array shape'); add(name, [data[name]], [data.height, data.width], ['map', 'source', 'target'].includes(name) ? '<f4' : '|u1');
    }
  }
  const seen = new Set();
  const jsonBound = value => {
    if (value === null || typeof value !== 'object') return typeof value === 'string' ? 6 * value.length + 2 : 32;
    requireValue(!seen.has(value), 'JSON metadata cycle'); seen.add(value);
    const bytes = Object.entries(value).reduce((s, [key, v]) => s + key.length * 6 + jsonBound(v) + 4, 2); seen.delete(value); return bytes;
  };
  const bound = 32768 + entries.reduce((s, e) => s + e.bytes, 0) + 8 * (jsonBound(data.metadata) + jsonBound(provenance));
  if (bound > maxBytes) throw new EngineError('MEMORY_LIMIT', 'Segmentation NPZ exceeds byte limit');
  const release = budget.reserve(bound); let complete = false;
  try {
    for (const [key, value] of [['metadata_json', data.metadata], ['browser_provenance_json', provenance]]) {
      const points = Array.from(JSON.stringify(value), c => c.codePointAt(0)), bytes = new Uint8Array(points.length * 4), view = new DataView(bytes.buffer);
      points.forEach((v, i) => view.setUint32(i * 4, v, true)); entries.push({name: encoder.encode(key + '.npy'), parts: [bytes], header: header('<U' + points.length, []), bytes: bytes.length});
    }
    let total = 22; for (const e of entries) {e.size = e.header.length + e.bytes; total += 76 + 2 * e.name.length + e.size;}
    if (total > maxBytes || total > bound) throw new EngineError('MEMORY_LIMIT', 'Segmentation NPZ exceeds admission');
    const bytes = new Uint8Array(total), view = new DataView(bytes.buffer); let at = 0;
    for (const e of entries) {
      e.offset = at; view.setUint32(at, 0x04034b50, true); view.setUint16(at + 4, 20, true); view.setUint16(at + 12, 33, true); view.setUint32(at + 18, e.size, true); view.setUint32(at + 22, e.size, true); view.setUint16(at + 26, e.name.length, true); bytes.set(e.name, at + 30);
      const start = at + 30 + e.name.length; bytes.set(e.header, start); let cursor = start + e.header.length;
      for (const part of e.parts) {if (little || part.BYTES_PER_ELEMENT === 1) bytes.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), cursor); else for (let i = 0; i < part.length; i++) view.setFloat32(cursor + 4 * i, part[i], true); cursor += part.byteLength;}
      let crc = 0xffffffff; for (let i = start; i < cursor; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); e.crc = (crc ^ 0xffffffff) >>> 0; view.setUint32(at + 14, e.crc, true); at = cursor;
    }
    const central = at;
    for (const e of entries) {view.setUint32(at, 0x02014b50, true); view.setUint16(at + 4, 20, true); view.setUint16(at + 6, 20, true); view.setUint16(at + 14, 33, true); view.setUint32(at + 16, e.crc, true); view.setUint32(at + 20, e.size, true); view.setUint32(at + 24, e.size, true); view.setUint16(at + 28, e.name.length, true); view.setUint32(at + 42, e.offset, true); bytes.set(e.name, at + 46); at += 46 + e.name.length;}
    view.setUint32(at, 0x06054b50, true); view.setUint16(at + 8, entries.length, true); view.setUint16(at + 10, entries.length, true); view.setUint32(at + 12, at - central, true); view.setUint32(at + 16, central, true);
    complete = true; return {bytes, mime: 'application/zip', release};
  } finally {if (!complete) release();}
}
