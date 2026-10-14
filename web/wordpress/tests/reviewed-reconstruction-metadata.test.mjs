import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('reconstruction preserves exact receipt-bound source/executable locks and historical inventory without copying model bodies',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',String.raw`
import importlib.util,json,copy
from pathlib import Path
root=Path.cwd();spec=importlib.util.spec_from_file_location('distribution',root/'prepare-distribution.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
overlay=m._delivery.qualified_runtime_overlay(root)
raw=(root.parents[1]/'web-assets/manifest-template.json').read_bytes();manifest=json.loads(raw)
active=copy.deepcopy(manifest);used={h for f in active['files'].values() for h in f['chunks']}
active['chunks']={h:n for h,n in active['chunks'].items() if h in used}
active['localFiles'].reverse()
received=m.reviewed_publication_metadata(root,active,overlay)
assert received==(raw,(root/'runtime-source-lock.json').read_bytes(),(root/'runtime-lock.json').read_bytes())
assert received[1]!=received[2]
for kind in ['file','local','chunk','missing-chunk']:
 changed=copy.deepcopy(active)
 if kind=='file':changed['files']['unified-engine/src/cache.js']['sha256']='f'*64
 elif kind=='local':changed['localFiles'].pop()
 elif kind=='chunk':changed['chunks'][next(iter(changed['chunks']))]+=1
 else:changed['chunks'].pop(next(iter(changed['chunks'])))
 try:m.reviewed_publication_metadata(root,changed,overlay);raise AssertionError('Unreviewed reconstruction accepted: '+kind)
 except ValueError:pass
assert m.reviewed_publication_metadata(root,active,type('Empty',(),{'files':{}})()) is None
print(json.dumps({'reviewedMetadataExact':True,'sourceAndExecutableLocksDistinct':True,'undeclaredChangesRejected':4,'modelBodiesRead':False}))
`],{encoding:'utf8'}));
 assert.deepEqual(result,{reviewedMetadataExact:true,sourceAndExecutableLocksDistinct:true,undeclaredChangesRejected:4,modelBodiesRead:false});
});
