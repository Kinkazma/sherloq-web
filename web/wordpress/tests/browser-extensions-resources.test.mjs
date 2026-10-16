import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {validateFeatureCatalog,featureDeletionPlan,requiredFeatureChunks} from '../sherloq-browser/assets/feature-catalog.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const manifest=read('../../../web-assets/manifest-template.json');
const catalog=read('../sherloq-browser/assets/feature-catalog.json');
const closure=read('../../extensions-source/comprint-statistics/pyodide/closure.json');
const tools=['ai.generation.bfree','ai.generation.spai','ai.text.doctamper','jpeg.comprint'];
test('four local resource choices preserve shared core and Comprint has its full pinned package closure',()=>{
 validateFeatureCatalog(catalog,manifest);const required=requiredFeatureChunks(catalog,manifest);
 for(const id of tools){const feature=catalog.features.find(f=>f.id===id);assert(feature&&!feature.protected&&!feature.internal);const removed=featureDeletionPlan(catalog,manifest,{},[id],{presentChunks:required.keys()});assert(removed.removableBytes>0);assert(!removed.paths.some(p=>p.startsWith('unified-engine/')));for(const hash of removed.chunks)assert(!requiredFeatureChunks(catalog,manifest,removed.state).has(hash));}
 assert.equal(closure.version,'0.26.4');assert.equal(closure.packages.length,21);assert.equal(closure.files.length,25);
 const comprint=catalog.features.find(f=>f.id==='jpeg.comprint');for(const item of closure.files){const name='extension-engine/comprint-statistics/pyodide/'+item.file;assert(comprint.resources.includes(name));assert.equal(manifest.files[name].sha256,item.sha256);assert.equal(manifest.files[name].size,item.bytes);}
 const without=featureDeletionPlan(catalog,manifest,{},['jpeg.comprint'],{presentChunks:required.keys()});assert(without.paths.includes('extension-engine/comprint-statistics/pyodide/pyodide.asm.wasm'));
});
test('browser-method composition refuses changed source, predecessor snapshot, package and model identities',()=>{
 const output=execFileSync('python3',['-c',String.raw`
import importlib.util,json
from pathlib import Path
from unittest.mock import patch
root=Path.cwd();repo=root.parents[1]
spec=importlib.util.spec_from_file_location('extensions',root/'runtime-extensions.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
receipt,_=m.reviewed_extensions_increment(root)
original=Path.read_bytes
cases={
 'source':repo/next(r['source'] for r in receipt['files'] if r['file']=='unified-engine/src/extensions-adapter.js'),
 'predecessor':repo/receipt['baseline']['snapshots'][0]['copy'],
 'package':repo/'web/extensions-source/comprint-statistics/pyodide/pyodide-lock.json',
 'models':repo/'web/extensions-source/models/manifest.json'}
rejected=[]
for name,target in cases.items():
 def changed(path):return original(path)+(b'changed' if path==target else b'')
 with patch.object(Path,'read_bytes',changed):
  try:m.reviewed_extensions_increment(root)
  except (ValueError,json.JSONDecodeError):rejected.append(name)
  else:raise AssertionError('Changed resource was accepted: '+name)
print(json.dumps(rejected))
`],{encoding:'utf8'});
 assert.deepEqual(JSON.parse(output),['source','predecessor','package','models']);
});
