import test from 'node:test';
import assert from 'node:assert/strict';
import {safireParams} from '../src/safire.js';
for(const minimum of [2147483648,4294967297,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1])test(`SAFIRE rejects minimum ${minimum} before signed32 ABI truncation`,()=>{assert.throws(()=>safireParams({kind:'dbscan',minimum}),{code:'INVALID_INPUT'});});
test('SAFIRE accepts exact signed32 minimum boundary without changing native parameters',()=>{assert.equal(safireParams({kind:'dbscan',minimum:2147483647}).minimum,2147483647);});
test('SAFIRE native grouping options retain exact legal values',()=>{const p={side:4,groups:16,kind:'dbscan',eps:.125,minimum:17,binary:true};assert.deepEqual(safireParams(p),p);for(const minimum of [0,-1,1.5,Infinity,NaN])assert.throws(()=>safireParams({minimum}),{code:'INVALID_INPUT'});});
