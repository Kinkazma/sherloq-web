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
bootstrap=d.adapted_runtime('unified-engine/src/m2-worker.js',b"const loaded=import('./m2-worker-host.js');self.onmessage=()=>loaded;",lookup,'0.15.1')
assert b'runtime-context.js?v=0.15.1' in bootstrap
assert d.adapted_runtime('unified-engine/src/m2-worker.js',bootstrap,lookup,'0.15.1')==bootstrap
try:d.adapted_runtime('unified-engine/vendor/test/test.js',b'async function instantiateAsync(binary,binaryFile,imports){unreviewed()}',lookup,'0.14.5');raise AssertionError('accepted unfamiliar code')
except ValueError:pass
print(json.dumps({'idempotent':True,'strict':True}))
`],{encoding:'utf8'}));assert.deepEqual(result,{idempotent:true,strict:true});
});

test('reviewed scientific increment replays exact deployed bytes after normal adaptation, while undeclared transport stays intact',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',`
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('delivery','runtime-delivery.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
root=Path.cwd();assets=root/'sherloq-browser/assets';overlay=d.qualified_runtime_overlay(root)
assert len(overlay.files)==57
changed=0
for relative,record in overlay.files.items():
 source=(assets/relative).read_bytes()
 if not relative.endswith(('.js','.mjs')):continue
 adapted=d.adapted_runtime(relative,source,lambda p:(assets/p).read_bytes(),'0.19.0-candidate')
 changed+=adapted!=source
 assert overlay.apply(relative,source,adapted)==source
 try:overlay.apply(relative,source+b'changed',adapted);raise AssertionError('changed source accepted')
 except ValueError:pass
assert changed>=10
wasm=(assets/'unified-engine/vendor/segmentation/scientific-correlation/correlation.wasm').read_bytes()
assert d._digest(wasm)=='a479db700aa63e8663226f1ddd653d01c8e5982d35a8086fdbe0778002bffe10'
factory=(assets/'unified-engine/vendor/segmentation/scientific-correlation/correlation.js').read_bytes()
assert b'correlation.wasm' in factory
original=b'export const unchanged=1;'
adapted=d.adapted_runtime('unified-engine/src/not-in-the-overlay.js',original,lambda p:None,'0.19.0-candidate')
assert adapted!=original and overlay.apply('unified-engine/src/not-in-the-overlay.js',original,adapted)==adapted
print(json.dumps({'entries':len(overlay.files),'qualifiedBytesPreserved':True,'undeclaredAdaptationPreserved':True,'changedInputRejected':True,'nativeWasmClosed':True}))
`],{encoding:'utf8'}));
 assert.deepEqual(result,{entries:57,qualifiedBytesPreserved:true,undeclaredAdaptationPreserved:true,changedInputRejected:true,nativeWasmClosed:true});
});

test('stage retains predecessor declarations and new chunks when inventory already contains the increment',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',`
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('release','scripts/build-local-release.py');r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
manifest=json.loads((Path.cwd().parents[1]/'web-assets/manifest-template.json').read_bytes())
changes,payloads,reference=r.reviewed_runtime_increment(manifest)
assert len(changes)==43 and len(payloads)==57 and reference['addedFiles']==14
assert 'unified-engine/src/neural-scientific-scope.js' not in changes
assert 'unified-engine/vendor/segmentation/scientific-correlation/correlation.wasm' not in changes
for name,record in changes.items():
 assert record['after']==manifest['files'][name]['sha256'] and record['before']!=record['after']
assert sum(map(len,payloads.values()))==596858
mixed=json.loads(json.dumps(manifest));mixed['files']['unified-engine/src/neural-scientific-scope.js']['sha256']='f'*64
try:r.reviewed_runtime_increment(mixed);raise AssertionError('partial receipt accepted')
except ValueError:pass
print(json.dumps({'existingOverrides':len(changes),'newFiles':reference['addedFiles'],'payloads':len(payloads),'partialInventoryRejected':True}))
`],{encoding:'utf8'}));
 assert.deepEqual(result,{existingOverrides:43,newFiles:14,payloads:57,partialInventoryRejected:true});
});
