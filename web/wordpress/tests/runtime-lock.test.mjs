import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
test('runtime delivery omits Finder metadata while still rejecting unlocked code and altered bytes',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',`
import hashlib,json,tempfile
from pathlib import Path
from build import locked_files
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);runtime=root/'sherloq-browser/assets/unified-engine';runtime.mkdir(parents=True)
 binary=runtime/'tiny.wasm';binary.write_bytes(b'\\x00asm\\x01\\x00\\x00\\x00')
 lock={'schema':'sherloq.wordpress-runtime-lock/1','runtimes':[{'version':'test','destination':'sherloq-browser/assets/unified-engine','files':{'tiny.wasm':hashlib.sha256(binary.read_bytes()).hexdigest()}}]}
 (root/'runtime-lock.json').write_text(json.dumps(lock))
 (runtime/'.DS_Store').write_bytes(b'private Finder metadata')
 (root/'sherloq-browser/assets/.DS_Store').write_bytes(b'private Finder metadata')
 _,files=locked_files(root);assert set(files)=={'assets/unified-engine/tiny.wasm'}
 extra=runtime/'unexpected.js';extra.write_text('throw new Error()')
 try:locked_files(root);raise AssertionError('unlocked code accepted')
 except ValueError:pass
 extra.unlink();binary.write_bytes(b'changed')
 try:locked_files(root);raise AssertionError('altered locked bytes accepted')
 except ValueError:pass
 print(json.dumps({'finderMetadataOmitted':True,'strictSourceIdentity':True}))
`],{encoding:'utf8'}));
 assert.deepEqual(result,{finderMetadataOmitted:true,strictSourceIdentity:true});
});
