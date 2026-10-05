import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('delivery adaptation preserves WASM identity, is idempotent, and rejects unfamiliar generated loaders',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',`
import importlib.util,json
spec=importlib.util.spec_from_file_location('delivery','runtime-delivery.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
b=b'\\x00asm\\x01\\x00\\x00\\x00'
s=b'async function instantiateAsync(binary,binaryFile,imports){return legacyFetch()}function getWasmImports(){return {}}'
lookup=lambda p:b
out=d.adapted_runtime('unified-engine/vendor/test/test.js',s,lookup,'0.14.5')
assert b'legacyFetch()' not in out and b'instantiateDependency(binary,binaryFile,imports,' in out
assert d.adapted_runtime('unified-engine/vendor/test/test.js',out,lookup,'0.14.5')==out
src=d.adapted_runtime('unified-engine/src/worker.js',b"export const a=1",lookup,'0.14.5')
assert d.adapted_runtime('unified-engine/src/worker.js',src,lookup,'0.14.5')==src
try:d.adapted_runtime('unified-engine/vendor/test/test.js',b'async function instantiateAsync(binary,binaryFile,imports){unreviewed()}',lookup,'0.14.5');raise AssertionError('accepted unfamiliar code')
except ValueError:pass
print(json.dumps({'idempotent':True,'strict':True}))
`],{encoding:'utf8'}));assert.deepEqual(result,{idempotent:true,strict:true});
});
