import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('retired aliased backing identities are collectable while their release closures remain live',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['--expose-gc',new URL('./resource-registry-liveness-check.mjs',import.meta.url).pathname]);
 assert.deepEqual(JSON.parse(stdout),{retainedReleaseClosures:2,identityCollected:true,backings:0});
});
