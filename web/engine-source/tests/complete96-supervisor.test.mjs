import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('emergency cleanup selects only the launched browser profile and its descendants',()=>{
 const script=fileURLToPath(new URL('../scripts/complete96-supervise.py',import.meta.url));
 const output=execFileSync('python3',['-c',`
import runpy,sys
pick=runpy.run_path(sys.argv[1])['owned_browser_processes']
rows=[(10,1,'Chrome --user-data-dir=/tmp/run/chrome-own'),(11,10,'Renderer'),(12,11,'Worker'),(20,1,'Chrome --user-data-dir=/tmp/run-other/chrome-own'),(21,20,'Renderer'),(30,1,'Chrome --user-data-dir=/tmp/run/user-profile')]
assert set(pick(rows,'/tmp/run'))=={10,11,12}
assert pick(rows,'/tmp/unknown')=={}
print('ok')
`,script],{encoding:'utf8'});
 assert.equal(output.trim(),'ok');
});
