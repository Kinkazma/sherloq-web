import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('ELA composition rejects changed ancestry, source, undeclared models/inventory and unsafe resource kinds',()=>{
 const result=JSON.parse(execFileSync('python3',['-c',String.raw`
import importlib.util,json,hashlib,tempfile,shutil
from pathlib import Path
root=Path.cwd();repo=root.parents[1]
spec=importlib.util.spec_from_file_location('adapter',root/'runtime-delivery.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ela_path='web/wordpress/runtime-patches/ela-runtime-20261014.json'
parent_path='web/wordpress/runtime-patches/batch-scientific-regions-20261013.json'
ela=json.loads((repo/ela_path).read_bytes());parent=json.loads((repo/parent_path).read_bytes())
needed={ela_path,parent_path,ela['manifest']['file'],parent['baseline']['selectionOverlay']['file']}
needed.update(r['file'] for r in ela['locks'].values());needed.update(r['copy'] for r in ela['baseline']['snapshots'])
needed.update(r['asset'] for r in parent['files'])
for r in ela['files']:needed.update(r[k] for k in ['source','asset','mirror'])
def encode(x):return (json.dumps(x,sort_keys=True,separators=(',',':'))+chr(10)).encode()
def change_json(repo,name,change):
 p=repo/name;x=json.loads(p.read_bytes());change(x);b=encode(x);p.write_bytes(b);return b
def identity(b):return {'sha256':hashlib.sha256(b).hexdigest(),'size':len(b)}
def mutation(repo,case):
 if case=='source':
  p=repo/ela['files'][0]['source'];p.write_bytes(p.read_bytes()+b'changed')
 elif case=='ancestry':
  p=repo/parent_path;p.write_bytes(p.read_bytes()+b' ')
 elif case=='snapshot':
  p=repo/ela['baseline']['locks']['source']['copy'];p.write_bytes(p.read_bytes()+b' ')
 elif case=='undeclared-lock':
  name=ela['locks']['delivered']['file']
  def mutate(x):
   slot=next(s for s in x['runtimes'] if s['destination']=='sherloq-browser/assets/unified-engine')
   slot['files']['src/cache.js']='f'*64
  b=change_json(repo,name,mutate)
  change_json(repo,ela_path,lambda x:x['locks']['delivered'].update(identity(b)))
 elif case=='undeclared-inventory':
  name=ela['manifest']['file'];other='unified-engine/src/cache.js'
  b=change_json(repo,name,lambda x:x['files'][other].update(size=x['files'][other]['size']+1))
  change_json(repo,ela_path,lambda x:x['manifest'].update(identity(b)))
 elif case=='wrong-native-kind':
  change_json(repo,ela_path,lambda x:x['files'][0].update(file='unified-engine/vendor/unreviewed.wasm'))
 elif case=='rewritten-index-preimage':
  record=next(r for r in ela['baseline']['snapshots'] if r['file']=='web/engine-source/src/index.js')
  p=repo/record['copy'];b=p.read_bytes()+b'changed';p.write_bytes(b)
  def mutate(x):next(r for r in x['baseline']['snapshots'] if r['file']==record['file']).update(identity(b))
  change_json(repo,ela_path,mutate)
accepted=m.qualified_runtime_overlay(root)
assert len(accepted.files)==61 and [len(x['files']) for x in accepted.receipts]==[57,5]
rejected=[]
for case in ['source','ancestry','snapshot','undeclared-lock','undeclared-inventory','wrong-native-kind','rewritten-index-preimage']:
 with tempfile.TemporaryDirectory() as d:
  copied=Path(d)/'repo'
  for name in needed:
   p=copied/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(repo/name,p)
  mutation(copied,case)
  try:m.qualified_runtime_overlay(copied/'web/wordpress');raise AssertionError('Tampered chain accepted: '+case)
  except ValueError as error:
   expected={'source':'reviewed source/deployed bytes','ancestry':'metadata changed','snapshot':'metadata changed','undeclared-lock':'undeclared runtime locks','undeclared-inventory':'undeclared dependency metadata','wrong-native-kind':'five reviewed modules','rewritten-index-preimage':'predecessor index differs'}[case]
   assert expected in str(error),(case,str(error));rejected.append(case)
print(json.dumps({'layers':2,'activeFiles':61,'rejected':rejected,'modelBodiesCopied':False}))
`],{encoding:'utf8',maxBuffer:2_000_000}));
 assert.deepEqual(result,{layers:2,activeFiles:61,rejected:['source','ancestry','snapshot','undeclared-lock','undeclared-inventory','wrong-native-kind','rewritten-index-preimage'],modelBodiesCopied:false});
});
