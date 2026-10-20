import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceFileKind, detectWorkspaceFileKind, isBatchDrop, isWorkspaceFileDrag} from '../sherloq-browser/assets/workspace-file-routing.js';

const file = (name, type, body = '') => Object.assign(new Blob([body], {type}), {name});
const node = (match = false) => ({closest(selector) {
  assert.match(selector, /#batch-dialog/);
  assert.match(selector, /dialog\.batch-dialog/);
  assert.match(selector, /\.batch-drop/);
  return match ? this : null;
}});

test('PDF MIME and extension work independently, including empty browser MIME', () => {
  for (const value of [file('paper', 'application/pdf'), file('PAPER.PDF', ''), file('paper.pdf', 'image/png'), file('paper', 'application/x-pdf')]) assert.equal(workspaceFileKind(value), 'pdf');
});

test('all existing image extensions and RAW paths keep their image routing', () => {
  for (const name of ['source.PNG', 'source.CR3', 'source.nef', 'source.DNG', 'source.rw2', 'source.jp2', 'source.jxl', 'source.heic']) assert.equal(workspaceFileKind(file(name, '')), 'image');
  assert.equal(workspaceFileKind(file('source', 'image/avif')), 'image');
  for (const name of ['study.zip', 'session.json', 'source.raw', 'paper.pdf.zip']) assert.equal(workspaceFileKind(file(name, '')), 'other');
  assert.equal(workspaceFileKind(null), 'other');
});

test('sniff recognizes a PDF header with a short preamble and misleading image name', async () => {
  assert.equal(await detectWorkspaceFileKind(file('paper.bin', '', 'prefix\n%PDF-1.7\n')), 'pdf');
  assert.equal(await detectWorkspaceFileKind(file('paper.png', 'image/png', '%PDF-2.0\n')), 'pdf');
  assert.equal(await detectWorkspaceFileKind(file('source.png', 'image/png', 'not a PDF')), 'image');
  assert.equal(await detectWorkspaceFileKind(file('paper.bin', '', 'x'.repeat(1024) + '%PDF-1.7')), 'other');
});

test('sniff bounds reads to 1024 bytes and leaves a PDF-hinted decoder error to PDF.js', async () => {
  let calls = 0;
  const source = {name: 'data.bin', type: '', slice(start, end) {
    calls++; assert.equal(start, 0); assert.equal(end, 1024); return new Blob(['data']);
  }};
  assert.equal(await detectWorkspaceFileKind(source), 'other');
  assert.equal(calls, 1);
  assert.equal(await detectWorkspaceFileKind({...source, name: 'invalid.pdf'}), 'pdf');
  assert.equal(calls, 1);
});

test('cancelled and stale asynchronous sniff cannot silently continue routing', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(detectWorkspaceFileKind(file('paper.bin', '', '%PDF-1.7'), {signal: abort.signal}), {name: 'AbortError'});
  let complete;
  const late = {name: 'data.bin', slice() {return {arrayBuffer: () => new Promise(resolve => {complete = resolve;})};}};
  const controller = new AbortController();
  const result = detectWorkspaceFileKind(late, {signal: controller.signal});
  controller.abort(); complete(new Uint8Array(pdfHeader()).buffer);
  await assert.rejects(result, {name: 'AbortError'});
});

function pdfHeader() { return [37, 80, 68, 70, 45, 49]; }

test('drop in the existing batch dialog, drop zone or composed shadow path belongs to batch', () => {
  assert.equal(isBatchDrop({target: node(true)}), true);
  const host = node(false), inside = node(true);
  assert.equal(isBatchDrop({target: host, composedPath: () => [inside, {}, host]}), true);
  assert.equal(isBatchDrop({target: node(false), composedPath: () => []}), false);
});

test('the batch drop handler remains the only recipient after preventDefault and stopPropagation', () => {
  const drop = new Event('drop', {cancelable: true, bubbles: true});
  drop.preventDefault(); drop.stopPropagation();
  assert.equal(isBatchDrop(drop), true);
  assert.equal(drop.defaultPrevented, true);
  assert.equal(drop.cancelBubble, true);
});

test('an ordinary main-workspace file drop remains available to the reader or image path', () => {
  const event = {target: node(false), dataTransfer: {types: ['Files', 'application/pdf']}};
  assert.equal(isWorkspaceFileDrag(event), true);
  assert.equal(isBatchDrop(event), false);
  assert.equal(isWorkspaceFileDrag({dataTransfer: {types: ['text/plain']}}), false);
  assert.equal(isWorkspaceFileDrag({}), false);
});
