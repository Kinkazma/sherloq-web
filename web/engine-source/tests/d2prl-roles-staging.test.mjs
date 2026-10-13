import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('runtime packaging preserves only the reproducible D2-only roles256 pair and rejects changed contracts',()=>{
 // Load only the pure guard from the Python staging script. No staging runs,
 // and malformed artifact variants live exclusively in this process's RAM.
 const source=String.raw`
import ast,copy,hashlib,json,re
from pathlib import Path
root=Path.cwd();vendor=root/'vendor/d2prl';script=root/'scripts/stage-d2prl-runtime.py'
tree=ast.parse(script.read_text());guard=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='verified_roles_entry')
scope={'json':json,'re':re,'Path':Path,'sha':lambda p:hashlib.sha256(p.read_bytes()).hexdigest()}
exec(compile(ast.Module(body=[guard],type_ignores=[]),str(script),'exec'),scope)
verify=scope['verified_roles_entry'];pins=json.loads((vendor/'PINNED.json').read_text());entry=pins['builds']['roles-256-d2prl']
assert verify(pins,vendor)==entry
names={'ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded-roles256.mjs','factory-roles256.mjs'}
data={name:(vendor/name).read_bytes() for name in names}
wasm='ort-wasm-simd-threaded.wasm';wasm_spec=pins['files'][wasm]
class MemoryPath:
 def __init__(self,files,name=None,symlinks=()):self.files=files;self.name=name;self.symlinks=symlinks
 def __truediv__(self,name):return MemoryPath(self.files,name,self.symlinks)
 def is_file(self):return self.name in self.files or self.name==wasm
 def exists(self):return self.is_file()
 def is_symlink(self):return self.name in self.symlinks
 def stat(self):return type('Stat',(),{'st_size':len(self.files[self.name]) if self.name in self.files else wasm_spec['bytes']})()
 def read_bytes(self):return self.files[self.name]
 def read_text(self):return self.read_bytes().decode()
scope['sha']=lambda p:wasm_spec['sha256'] if isinstance(p,MemoryPath) and p.name==wasm else hashlib.sha256(p.read_bytes()).hexdigest()
def rejected(value,files=data,symlinks=()):
 try:verify(value,MemoryPath(files,symlinks=symlinks))
 except (AssertionError,KeyError):return
 raise AssertionError('Malformed roles256 packaging was accepted')
checks=1
for mutate in [
 lambda p:p['builds']['roles-256-d2prl'].__setitem__('memoryMaximumBytes',512*1024**2),
 lambda p:p['builds']['roles-256-d2prl'].__setitem__('runtimeId','ort130-wasm-512mib'),
 lambda p:p['builds']['roles-256-d2prl']['modelIdentity'].__setitem__('sha256','0'*64),
 lambda p:p['builds']['roles-256-d2prl']['modelIdentity']['inputs'].reverse(),
 lambda p:p['builds']['roles-256-d2prl']['source'].__setitem__('sha256','0'*64),
 lambda p:p['builds']['roles-256-d2prl'].__setitem__('wasmSha256','0'*64),
 lambda p:p['builds']['roles-256-d2prl'].__setitem__('extra','unknown'),
 lambda p:p['builds']['roles-256-d2prl'].__setitem__('buildScript','/Users/private/build.mjs'),
 lambda p:p['rolesRuntime'].__setitem__('memoryMaximumBytes',256*1024**2),
 lambda p:p['files']['factory-roles256.mjs'].__setitem__('sha256','0'*64),
]:
 changed=copy.deepcopy(pins);mutate(changed);rejected(changed);checks+=1
rejected(pins,symlinks={'factory-roles256.mjs'});checks+=1
rejected(pins,{key:value for key,value in data.items() if key!='factory-roles256.mjs'});checks+=1
for name in ['ort-wasm-simd-threaded-roles256.mjs','factory-roles256.mjs']:
 changed=copy.deepcopy(pins);files=dict(data);files[name]=data[name]+b'\n// unexpected runtime change\n';spec={'bytes':len(files[name]),'sha256':hashlib.sha256(files[name]).hexdigest()}
 changed['builds']['roles-256-d2prl']['files'][name]=spec;changed['files'][name]=dict(spec)
 rejected(changed,files);checks+=1
absent=copy.deepcopy(pins);del absent['builds']['roles-256-d2prl'];assert verify(absent,MemoryPath({})) is None;checks+=1
rejected(absent);checks+=1
qualified=copy.deepcopy(pins);qualified_entry=qualified['builds']['roles-256-d2prl'];qualified_entry['status']='qualified-exact-current-engine-memory-cap'
proof={'bytes':1,'sha256':'d'*64,'referenceFile':'.build/proof.json'}
qualified_entry['qualification']={'directModel':{**proof,'status':'passed-exact-parity','referenceKind':'frozen-current-engine-source','reference':'snapshot:'+'e'*64,'modelSha256':'8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b','rolesMemoryMiB':256,'runs':8,'matchedPairs':4,'repetitions':2,'temperatures':['cold-context-new-model','warm-retained-model'],'jobs':[{'id':'test-only'}],'threeRawAndDecisionsExact':True,'finalOwnershipZero':True,'globalSpeedQualified':False},'rolePair':{**proof,'status':'passed-real-role-pair-parity','cases':3,'runs':6,'inputsPreserved':True,'policySavingBytes':268435456,'records':[{'kind':kind,'heapBytes':[170524672,170524672],'policyPeakBytes':[595513055,327077599],'targetSourceSha256':['a'*64,'b'*64]} for kind in ['positive','jpeg','flat']]},'scope':'Synthetic memory qualification metadata only for the guard test; no vendor write.'}
assert verify(qualified,MemoryPath(data))==qualified_entry;checks+=1
for mutate in [
 lambda q:q['directModel'].__setitem__('status','running'),
 lambda q:q['directModel'].__setitem__('referenceKind','historical-git-commit'),
 lambda q:q['directModel'].__setitem__('runs',7),
 lambda q:q['directModel'].__setitem__('matchedPairs',3),
 lambda q:q['directModel'].__setitem__('rolesMemoryMiB',512),
 lambda q:q['directModel'].__setitem__('globalSpeedQualified',True),
 lambda q:q['directModel'].__setitem__('threeRawAndDecisionsExact',False),
 lambda q:q['directModel'].__setitem__('finalOwnershipZero',False),
 lambda q:q['directModel'].__setitem__('referenceFile','/tmp/private/proof.json'),
 lambda q:q['rolePair'].__setitem__('policySavingBytes',0),
 lambda q:q['rolePair']['records'].pop(),
 lambda q:q['rolePair']['records'][0]['heapBytes'].__setitem__(1,512*1024**2),
 lambda q:q['rolePair']['records'][0]['policyPeakBytes'].__setitem__(1,595513055),
]:
 changed=copy.deepcopy(qualified);mutate(changed['builds']['roles-256-d2prl']['qualification']);rejected(changed);checks+=1
print(json.dumps({'checks':checks,'staged':False,'originalSharedRuntimePreserved':True}))
`;
 const result=spawnSync('python3',['-c',source],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{checks:31,staged:false,originalSharedRuntimePreserved:true});
});
for(const variant of ['table-simd4-scalar','table-simd4-normal','table-simd4-exact-subnormal'])test('runtime packaging preserves only the fixed '+variant+' pair after current-HWC exact gain qualification',t=>{
 const hasPair=relative=>['js','wasm'].every(extension=>existsSync(root+relative+'/'+variant+'.'+extension));
 let fixture=variant==='table-simd4-exact-subnormal'?'tests/fixtures/d2prl-subnormal-v1':'.build/evaluator-table-simd';
 if(!hasPair(fixture)){
  if(variant==='table-simd4-exact-subnormal'){
   fixture='vendor/d2prl';
   assert.ok(hasPair(fixture),'the retained exact-subnormal JS/WASM pair must be shipped');
  }else{
   t.skip('The rejected '+variant+' experimental pair is not shipped; its .build fixture is absent.');
   return;
  }
 }
 const source=String.raw`
import ast,copy,hashlib,json,re
from pathlib import Path
root=Path.cwd();script=root/'scripts/stage-d2prl-runtime.py';tree=ast.parse(script.read_text())
guard=next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='qualified_table_simd_entry')
scope={'json':json,'re':re,'Path':Path,'sha':lambda p:hashlib.sha256(p.read_bytes()).hexdigest()}
exec(compile(ast.Module(body=[guard],type_ignores=[]),str(script),'exec'),scope);verify=scope['qualified_table_simd_entry']
actual_pins=json.loads((root/'vendor/d2prl/PINNED.json').read_text());assert verify(actual_pins,root/'vendor/d2prl')==actual_pins['builds'].get('evaluator-table-simd4-scalar')
files={name:(root/Path(__import__('sys').argv[1])/name).read_bytes() for name in ['table-simd4-scalar.js','table-simd4-scalar.wasm']}
specs={name:{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in files.items()}
proof={'bytes':1,'sha256':'d'*64};snapshot={'files':1,'sha256':'e'*64}
entry={'schema':1,'status':'qualified-exact-direct-model','descriptorLayout':'HWC-uint16','buildScript':'scripts/build-d2prl-evaluator-table-simd.mjs','stageScript':'scripts/stage-d2prl-evaluator-module.mjs','compiler':'Emscripten6.0.11','sources':{'baselineTable':'38edcd7a5ab6ce5a2e81c71df8c2a2c04a4c31ba9589a237cf034cec991d3096','candidate':{'table-simd4-scalar.cpp':'fa3d530b5ff959d8350cda5563aae38b063658a64b4c10f97ecf0273b4c978a8','table-simd4-scalar-tiled.cpp':'26ffad7004c7167ed6e821b99dabbc6d89b180644fe0cf786bcfcf5e3ead7517'}},'files':specs,'qualification':{'directModel':{**proof,'status':'passed-exact-parity','referenceKind':'frozen-current-engine-source','reference':'snapshot:'+snapshot['sha256'],'additionalGainBaseline':'previously qualified HWC current-engine snapshot','rolesMemoryMiB':256,'modelSha256':'8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b','runs':8,'repetitions':2,'temperatures':['cold-context-new-model','warm-retained-model'],'jobs':[{'id':'test-memory-only'}],'summary':[{'exact':True,'globalGainQualified':True,'pairs':2,'pairedMedianGainPercent':10}]},'smallParity':{**proof,'status':'passed-small-corpus-bit-parity','cases':58,'totalElements':1},'nativeCorpus':{**proof,'status':'passed-available-native-corpora','coverageComplete':False,'missing':[{'name':'explicit'}],'softmaxStatus':'passed','evaluatorCases':264,'evaluatorElements':723784},'runtimeReference':dict(snapshot),'runtimeCandidate':dict(snapshot),'scope':'Synthetic metadata only for the pure packaging guard test; no qualification or vendor write.'}}
pins={'builds':{'evaluator-pixel-major':{'status':'qualified-exact-direct-model'},'evaluator-table-simd4-scalar':entry},'files':copy.deepcopy(specs)}
class MemoryPath:
 def __init__(self,files,name=None,symlinks=()):self.files=files;self.name=name;self.symlinks=symlinks
 def __truediv__(self,name):return MemoryPath(self.files,name,self.symlinks)
 def exists(self):return self.name in self.files
 def is_file(self):return self.exists()
 def is_symlink(self):return self.name in self.symlinks
 def stat(self):return type('Stat',(),{'st_size':len(self.files[self.name])})()
 def read_bytes(self):return self.files[self.name]
assert verify(pins,MemoryPath(files))==entry;checks=2
def rejected(value,data=files,symlinks=()):
 try:verify(value,MemoryPath(data,symlinks=symlinks))
 except (AssertionError,KeyError):return
 raise AssertionError('Malformed table/SIMD packaging was accepted')
for mutate in [
 lambda e:e.__setitem__('status','compiled-experimental-unqualified'),
 lambda e:e.__setitem__('descriptorLayout','CHW-uint16'),
 lambda e:e.__setitem__('buildScript','scripts/unknown.mjs'),
 lambda e:e.__setitem__('compiler','/Users/private/emcc6.0.11'),
 lambda e:e['sources'].__setitem__('baselineTable','a'*64),
 lambda e:e['sources']['candidate'].__setitem__('table-simd4-scalar.cpp','a'*64),
 lambda e:e['files']['table-simd4-scalar.js'].__setitem__('sha256','a'*64),
 lambda e:e['qualification']['directModel'].__setitem__('status','running'),
 lambda e:e['qualification']['directModel'].__setitem__('referenceKind','historical-git-commit'),
 lambda e:e['qualification']['directModel'].__setitem__('additionalGainBaseline','historical engine'),
 lambda e:e['qualification']['directModel'].__setitem__('rolesMemoryMiB',512),
 lambda e:e['qualification']['directModel'].__setitem__('runs',7),
 lambda e:e['qualification']['directModel'].__setitem__('repetitions',1),
 lambda e:e['qualification']['directModel']['temperatures'].pop(),
 lambda e:e['qualification']['directModel']['summary'][0].__setitem__('exact',False),
 lambda e:e['qualification']['directModel']['summary'][0].__setitem__('pairedMedianGainPercent',4.9),
 lambda e:e['qualification']['smallParity'].__setitem__('cases',57),
 lambda e:e['qualification']['nativeCorpus'].__setitem__('softmaxStatus','failed'),
 lambda e:e['qualification']['nativeCorpus'].__setitem__('evaluatorCases',263),
 lambda e:e['qualification']['nativeCorpus'].__setitem__('missing',[]),
 lambda e:e['qualification']['runtimeReference'].__setitem__('sha256','a'*64),
 lambda e:e['qualification']['runtimeCandidate'].__setitem__('files',0),
]:
 changed=copy.deepcopy(pins);mutate(changed['builds']['evaluator-table-simd4-scalar']);rejected(changed);checks+=1
changed=copy.deepcopy(pins);changed['builds']['evaluator-pixel-major']['status']='unqualified';rejected(changed);checks+=1
changed=copy.deepcopy(pins);del changed['builds']['evaluator-table-simd4-scalar'];rejected(changed);checks+=1
assert verify(changed,MemoryPath({})) is None;checks+=1
rejected(pins,symlinks={'table-simd4-scalar.wasm'});checks+=1
rejected(pins,{name:data for name,data in files.items() if name!='table-simd4-scalar.js'});checks+=1
changed_data=dict(files);changed_data['table-simd4-scalar.wasm']=b'changed';rejected(pins,changed_data);checks+=1
# Execute only the optional preservation block against RAM dictionaries, so
# the rebuilt files/builds table retains the exact same qualified two pins.
block=next(node for node in tree.body if isinstance(node,ast.If) and isinstance(node.test,ast.Name) and node.test.id=='table_simd')
preserve={'table_simd':entry,'builds':{'existing':{}},'files':{'existing.js':{}}}
exec(compile(ast.Module(body=[block],type_ignores=[]),str(script),'exec'),preserve)
assert preserve['builds']['evaluator-table-simd4-scalar']==entry and {name:preserve['files'][name] for name in specs}==specs and 'existing.js' in preserve['files'];checks+=1
positive=copy.deepcopy(pins);direct=positive['builds']['evaluator-table-simd4-scalar']['qualification']['directModel'];direct['speedCriterion']='all-paired-runs-faster';direct['allCasesReachFivePercent']=False;direct['minObservedPairedGainPercent']=3.8;direct['summary'][0].update({'globalGainQualified':False,'pairedMedianGainPercent':4.4,'minObservedPairedGainPercent':3.8,'allPairedRunsFaster':True})
assert verify(positive,MemoryPath(files))==positive['builds']['evaluator-table-simd4-scalar'];checks+=1
for mutate in [
 lambda d:d.pop('speedCriterion'),
 lambda d:d.__setitem__('speedCriterion','unspecified-looser-rule'),
 lambda d:d.__setitem__('allCasesReachFivePercent',True),
 lambda d:d.__setitem__('minObservedPairedGainPercent',4.4),
 lambda d:d['summary'][0].__setitem__('minObservedPairedGainPercent',0),
 lambda d:d['summary'][0].__setitem__('minObservedPairedGainPercent',-1),
 lambda d:d['summary'][0].__setitem__('allPairedRunsFaster',False),
 lambda d:d['summary'][0].__setitem__('globalGainQualified',True),
 lambda d:d['summary'][0].__setitem__('pairs',1),
 lambda d:d.__setitem__('status','passed-resource-parity-only'),
]:
 changed=copy.deepcopy(positive);mutate(changed['builds']['evaluator-table-simd4-scalar']['qualification']['directModel']);rejected(changed);checks+=1
print(json.dumps({'checks':checks,'staged':False,'runtimeChanged':False}))
`;
 const normal=variant==='table-simd4-normal',subnormal=variant==='table-simd4-exact-subnormal';
 let selected=source;
 if(normal||subnormal)selected=source.replaceAll('table-simd4-scalar',variant)
  .replaceAll('fa3d530b5ff959d8350cda5563aae38b063658a64b4c10f97ecf0273b4c978a8',normal?'d5cde99fc10699c1b99d09e6fa9a530b7ead6c9ae90a340ad16ad5f69b584f7e':'7a8ede16ef8cc00da922ed2b00d6287c95efd4e6e5cf2fc7bd2f1280fd4d50eb')
  .replaceAll('26ffad7004c7167ed6e821b99dabbc6d89b180644fe0cf786bcfcf5e3ead7517',normal?'024b41759cd21afc3c7f325bc4443525ac4d6cc843da9f61514b021f76937d40':'2797c1ed1f6245d8a55ed266f63b2f5d5c4e17f9836c6c4069c55914eefc2122')
  .replace("verify=scope['qualified_table_simd_entry']","verify=lambda previous,vendor:scope['qualified_table_simd_entry'](previous,vendor,'"+variant+"')")
  .replaceAll("'table_simd'",normal?"'table_simd_normal'":"'table_simd_subnormal'");
 if(subnormal)selected=selected.replaceAll("'.build/evaluator-table-simd'","'.build/evaluator-table-simd-subnormal'")
  .replaceAll('scripts/build-d2prl-evaluator-table-simd.mjs','scripts/build-d2prl-evaluator-table-simd-subnormal.mjs');
 const result=spawnSync('python3',['-c',selected,fixture],{cwd:root,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{checks:42,staged:false,runtimeChanged:false});
});
