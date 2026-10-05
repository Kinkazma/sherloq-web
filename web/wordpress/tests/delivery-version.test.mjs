import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
test('installed UI graph has coherent version URLs without altering codecs or download filenames',()=>{
 const script=`import importlib.util, pathlib, tempfile, json
spec=importlib.util.spec_from_file_location('build','build.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d)/'test.js';p.write_text("import {x} from './app.js'; const worker=new URL('./engine-worker.js',import.meta.url); const file='report.json'; import {engine} from './unified-engine/src/index.js'; const config=new URL('./integrated-config.json',import.meta.url);")
 js=b.delivery_bytes('assets/test.js',p,'0.11.1').decode()
 p.write_text('<script type="module" src="workspace-entry.js"></script><link href="app.css" rel="stylesheet">')
 html=b.delivery_bytes('assets/app.html',p,'0.11.1').decode()
 print(json.dumps({'js':js,'html':html,'runtime':b.delivery_bytes('assets/unified-engine/src/index.js',p,'0.11.1')}))`;
 const result=JSON.parse(execFileSync('python3',['-c',script],{encoding:'utf8'}));assert.match(result.js,/app\.js\?v=0\.11\.1/);assert.match(result.js,/engine-worker\.js\?v=0\.11\.1/);assert.match(result.js,/integrated-config\.json\?v=0\.11\.1/);assert.match(result.js,/'report.json'/);assert.match(result.js,/'\.\/unified-engine\/src\/index\.js'/);assert.match(result.html,/workspace-entry\.js\?v=0\.11\.1/);assert.match(result.html,/app\.css\?v=0\.11\.1/);assert.equal(result.runtime,null);
});
