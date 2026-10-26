import test from 'node:test';import assert from 'node:assert/strict';import {runForgeryscopeUnionSourceControls} from './forgeryscope-global-union-controls.js';
test('Forgeryscope global source observes exactly the canonical union once, before native network inputs',async()=>assert.equal((await runForgeryscopeUnionSourceControls()).passed,true));

test('Forgeryscope canonical source keeps a full known class without redetection',async()=>assert.equal((await runForgeryscopeUnionSourceControls({single:true})).passed,true));
test('Forgeryscope canonical source does not choose the first contradictory overlapping class',async()=>assert.equal((await runForgeryscopeUnionSourceControls({conflicting:true})).passed,true));
