import test from 'node:test';import assert from 'node:assert/strict';import {createErrorJournal,errorEvidence} from '../sherloq-browser/assets/error-journal.js';
test('Diagnostics preserve allocation cause and parameters without retaining mutable buffers',()=>{
 const journal=createErrorJournal(),buffer=new Uint8Array(1024).fill(7),cause=Object.assign(Error('native refused'),{code:'MEMORY_ALLOCATION',details:{allocationKind:'wasm',maximumHeapBytes:67108864}}),error=Object.assign(Error('extraction failed',{cause}),{code:'FEATURE_EXTRACTION_FAILED',details:{sample:buffer}});
 journal.record(error,{algorithm:'SIFT',width:640,height:480,parameters:{limit:6000},progress:{phase:'extracting'}});buffer.fill(0);cause.details.maximumHeapBytes=0;const a=journal.snapshot()[0];assert.equal(a.error.cause.details.maximumHeapBytes,67108864);assert.equal(a.error.details.sample.preview.length,16);assert.equal(a.error.details.sample.preview[0],7);assert.match(a.error.stack,/extraction failed/);assert.equal(a.context.algorithm,'SIFT');a.context.algorithm='mutated';assert.equal(journal.snapshot()[0].context.algorithm,'SIFT');
});
test('Diagnostics retain eight failures and handle cycles and large payloads',()=>{
 const journal=createErrorJournal();const details={};details.loop=details;for(let i=0;i<10;i++)journal.record(Object.assign(Error('failure '+i),{details}),{algorithm:'ORB'});assert.equal(journal.length,8);assert.equal(journal.snapshot()[0].error.message,'failure 2');assert.equal(journal.snapshot()[0].error.details.loop,'[circular]');
 journal.record(Object.assign(Error('big'),{details:{huge:Array.from({length:10000},()=>'*'.repeat(10))}}),{algorithm:'SIFT'});assert.equal(journal.snapshot().at(-1).truncated,true);assert.ok(new TextEncoder().encode(JSON.stringify(journal.snapshot().at(-1))).length<32768);
 const error=Error('cycle');error.cause=error;assert.doesNotThrow(()=>errorEvidence(error));
});

test('Diagnostic byte bound also holds for escaped and non-ASCII failures',()=>{const journal=createErrorJournal();journal.record(Object.assign(Error('\u0001'.repeat(9000)),{stack:'🪨'.repeat(9000),details:{large:'é'.repeat(90000)}}),{algorithm:'🪨'.repeat(9000)});assert.ok(new TextEncoder().encode(JSON.stringify(journal.snapshot()[0])).length<=32768);});
