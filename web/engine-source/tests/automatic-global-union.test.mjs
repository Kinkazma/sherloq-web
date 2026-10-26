import test from 'node:test';import assert from 'node:assert/strict';import {runGlobalUnionControls} from './automatic-global-union-controls.js';
test('global uses exact canonical pixel union, native fields and one bank; independent overlap stays autonomous',async()=>{const result=await runGlobalUnionControls();assert.equal(result.passed,true);assert.equal(result.contracts.length,4);});
