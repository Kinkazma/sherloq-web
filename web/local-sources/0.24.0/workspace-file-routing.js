import {imageAccept} from './media-settings.js?v=0.24.0';

const imageExtensions = new Set(imageAccept.split(',').filter(value => value.startsWith('.')).map(value => value.toLowerCase()));
const batchSelector = '#batch-dialog,dialog.batch-dialog,.batch-drop,[data-batch-drop],[data-batch-dialog]';
const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** Classify a file hint only; its decoder remains responsible for validation. */
export function workspaceFileKind(file) {
  if (!file) return 'other';
  const type = String(file.type ?? '').split(';', 1)[0].trim().toLowerCase();
  const name = String(file.name ?? '').toLowerCase();
  if (type === 'application/pdf' || type === 'application/x-pdf' || name.endsWith('.pdf')) return 'pdf';
  const extension = name.match(/\.[^.\\/]+$/)?.[0];
  return type.startsWith('image/') || imageExtensions.has(extension) ? 'image' : 'other';
}

function checkAbort(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('File routing cancelled.', 'AbortError');
}

/** Read no more than PDF.js's header-search window; never decode or retain a file. */
export async function detectWorkspaceFileKind(file, {signal} = {}) {
  checkAbort(signal);
  const hinted = workspaceFileKind(file);
  if (hinted === 'pdf' || typeof file?.slice !== 'function') return hinted;
  const header = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  checkAbort(signal);
  for (let offset = 0; offset <= header.length - pdfSignature.length; offset++) {
    if (pdfSignature.every((value, index) => header[offset + index] === value)) return 'pdf';
  }
  return hinted;
}

/** A nested batch import owns its drop, including across a ShadowRoot boundary. */
export function isBatchDrop(event) {
  if (event?.defaultPrevented) return true;
  const path = typeof event?.composedPath === 'function' ? event.composedPath() : [];
  if (event?.target && !path.includes(event.target)) path.push(event.target);
  return path.some(node => typeof node?.closest === 'function' && Boolean(node.closest(batchSelector)));
}

export function isWorkspaceFileDrag(event) {
  return Array.from(event?.dataTransfer?.types ?? []).includes('Files');
}
