"""Stage only pinned runtime code/binaries, never model weights or activations."""
from pathlib import Path
import json,hashlib,re
root=Path(__file__).resolve().parents[1];out=root/'vendor/d2prl'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files={};builds={}
def qualified_fast_entry():
 names={'pixel-major-combined.js','pixel-major-combined.wasm'}
 previous=json.loads((out/'PINNED.json').read_text()) if (out/'PINNED.json').exists() else {}
 entry=previous.get('builds',{}).get('evaluator-pixel-major')
 if entry is None:
  assert not any((out/name).exists() for name in names),'Unqualified fast evaluator has no portable metadata'
  return None
 assert set(entry)=={'schema','status','descriptorLayout','buildScript','stageScript','compiler','sources','files','qualification'},'Unknown fast evaluator metadata'
 assert entry['schema']==1 and entry['status']=='qualified-exact-direct-model' and entry['descriptorLayout']=='HWC-uint16'
 assert entry['buildScript']=='scripts/build-d2prl-evaluator-original-cache.mjs' and entry['stageScript']=='scripts/stage-d2prl-evaluator-fast.mjs'
 assert '/Users/' not in json.dumps(entry) and set(entry['files'])==names,'Nonportable fast evaluator metadata'
 def proof(value):
  assert isinstance(value.get('bytes'),int) and value['bytes']>0 and re.fullmatch('[0-9a-f]{64}',value.get('sha256','')),'Invalid fast qualification identity'
 q=entry['qualification'];direct=q['directModel'];native=q['nativeCorpus'];small=q['smallParity']
 for value in [direct,native,small]:proof(value)
 assert direct['status']=='passed-exact-parity' and direct['runs']>=8 and direct['repetitions']>=2 and direct['repetitions']%2==0
 assert {'cold-context-new-model','warm-retained-model'}<=set(direct['temperatures']) and direct['summary']
 assert all(row['exact'] is True and row['globalGainQualified'] is True and row['pairs']>=2 and row['pairedMedianGainPercent']>=5 for row in direct['summary'])
 assert direct['modelSha256']=='8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b' and re.fullmatch('[0-9a-f]{40}',direct['reference'])
 assert small['status']=='passed-small-corpus-bit-parity' and small['cases']>0 and native['softmaxStatus']=='passed' and native['evaluatorCases']>0
 assert native['status'] in ['passed-existing-native-corpora','passed-available-native-corpora'] and native['coverageComplete']==(len(native['missing'])==0)
 assert (native['status']=='passed-available-native-corpora')==(len(native['missing'])>0)
 assert q['runtimeCandidate']['files']>0 and re.fullmatch('[0-9a-f]{64}',q['runtimeCandidate']['sha256'])
 original=json.loads((root/'.build/d2prl-evaluator-tiled/build.json').read_text())
 assert entry['sources']['original']==original['sources'],'Fast evaluator oracle source metadata differs'
 assert set(entry['sources']['candidate'])=={'pixel-major-combined.cpp','pixel-major-combined-tiled.cpp'}
 assert all(re.fullmatch('[0-9a-f]{64}',value) for value in entry['sources']['candidate'].values())
 for name in sorted(names):
  spec=entry['files'][name];proof(spec);source=out/name
  assert source.is_file() and not source.is_symlink() and source.stat().st_size==spec['bytes'] and sha(source)==spec['sha256'],'Qualified fast artifact differs: '+name
 return entry
def verified_roles_entry(previous,vendor):
 names={'ort-wasm-simd-threaded-roles256.mjs','factory-roles256.mjs'}
 entry=previous.get('builds',{}).get('roles-256-d2prl')
 if entry is None:
  assert not any((vendor/name).exists() for name in names),'D2 roles256 artifacts have no portable metadata'
  return None
 assert set(entry)=={'schema','status','runtimeId','memoryMaximumBytes','upstreamVersion','buildScript','factory','loader','sharedWasm','wasmSha256','source','modelIdentity','files','scope','qualification'},'Unknown D2 roles256 metadata'
 assert entry['schema']==1 and entry['status'] in ['experimental-memory-cap-candidate','qualified-exact-current-engine-memory-cap']
 assert entry['runtimeId']=='ort130-wasm-256mib-d2prl' and entry['memoryMaximumBytes']==256*1024**2 and entry['upstreamVersion']=='1.30.0'
 assert entry['buildScript']=='scripts/build-d2prl-role-runtime-256.mjs' and entry['factory']=='factory-roles256.mjs' and entry['loader']=='ort-wasm-simd-threaded-roles256.mjs' and entry['sharedWasm']=='ort-wasm-simd-threaded.wasm'
 assert '/Users/' not in json.dumps(entry) and set(entry['files'])==names,'Nonportable D2 roles256 metadata'
 expected_source={'file':'ort-wasm-simd-threaded.mjs','bytes':24380,'sha256':'7ec2e1087a815e79222ade487a3dfa738aa0c606df4ca2314bd90d1735a8a420'}
 expected_wasm={'bytes':14239897,'sha256':'3398c10d07d229bd91b364548e130e0e51a8e5704b88c7c083ebbeb78842dee2'}
 model={'bytes':19943135,'sha256':'33b7b17588e96a2bcda1e1d8de203770bd782d0edc1c0ad890ee9fe425f1365b','inputs':['rgb','x_cor','y_cor','x_cor2','y_cor2','union'],'outputs':['target','source']}
 assert entry['source']==expected_source and entry['wasmSha256']==expected_wasm['sha256'] and entry['modelIdentity']==model,'D2 roles256 source/WASM/model identity differs'
 runtime=previous['rolesRuntime']
 assert runtime['runtimeId']=='ort130-wasm-512mib' and runtime['memoryMaximumBytes']==512*1024**2 and runtime['upstreamVersion']=='1.30.0' and runtime['wasmSha256']==expected_wasm['sha256'],'Original512 roles runtime differs'
 def verified_file(name,spec):
  assert set(spec)=={'bytes','sha256'} and type(spec['bytes']) is int and spec['bytes']>0 and re.fullmatch('[0-9a-f]{64}',spec['sha256']),'Invalid D2 roles identity'
  source=vendor/name
  assert source.is_file() and not source.is_symlink() and source.stat().st_size==spec['bytes'] and sha(source)==spec['sha256'],'D2 roles artifact differs: '+name
 verified_file(expected_source['file'],{key:expected_source[key] for key in ['bytes','sha256']})
 verified_file(entry['sharedWasm'],expected_wasm)
 assert previous['files'][expected_source['file']]=={key:expected_source[key] for key in ['bytes','sha256']} and previous['files'][entry['sharedWasm']]==expected_wasm
 before='new WebAssembly.Memory({initial:256,maximum:8192,shared:!0})';after='new WebAssembly.Memory({initial:256,maximum:4096,shared:!0})'
 source=(vendor/expected_source['file']).read_text();assert source.count(before)==1,'Original512 constructor boundary differs'
 compact=lambda value:json.dumps(value,separators=(',',':'))
 factory="import factory from './ort-wasm-simd-threaded-roles256.mjs';\nexport const runtimeId='ort130-wasm-256mib-d2prl';\nexport const memoryMaximumBytes=268435456;\nexport const modelIdentity=Object.freeze({bytes:19943135,sha256:'"+model['sha256']+"',inputs:Object.freeze("+compact(model['inputs'])+"),outputs:Object.freeze("+compact(model['outputs'])+")});\nlet instance;\nexport function heapBytes(){return instance?.HEAPU8.byteLength??0;}\nexport default async function(config){instance=await factory(config);return instance;}\n"
 for name in sorted(names):
  spec=entry['files'][name];verified_file(name,spec)
  assert previous['files'][name]==spec,'D2 roles256 portable pin differs'
  expected=source.replace(before,after) if name==entry['loader'] else factory
  assert (vendor/name).read_text()==expected,'D2 roles256 reproducible code differs: '+name
 if entry['status']=='qualified-exact-current-engine-memory-cap':
  q=entry['qualification'];assert set(q)=={'directModel','rolePair','scope'},'Unknown D2 roles256 memory qualification'
  direct=q['directModel'];pair=q['rolePair']
  for value in [direct,pair]:
   assert type(value.get('bytes')) is int and value['bytes']>0 and re.fullmatch('[0-9a-f]{64}',value.get('sha256','')),'Invalid D2 roles256 memory proof identity'
   reference=value['referenceFile'];assert isinstance(reference,str) and not Path(reference).is_absolute() and '..' not in Path(reference).parts and reference.startswith('.build/'),'Portable D2 roles256 proof reference required'
  assert direct['status']=='passed-exact-parity' and direct['referenceKind']=='frozen-current-engine-source' and re.fullmatch('snapshot:[0-9a-f]{64}',direct['reference'])
  assert direct['modelSha256']=='8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b' and direct['rolesMemoryMiB']==256
  assert type(direct['runs']) is int and direct['runs']>=8 and direct['matchedPairs']*2==direct['runs'] and type(direct['repetitions']) is int and direct['repetitions']>=2 and direct['repetitions']%2==0
  assert {'cold-context-new-model','warm-retained-model'}<=set(direct['temperatures']) and direct['jobs']
  assert direct['threeRawAndDecisionsExact'] is True and direct['finalOwnershipZero'] is True and direct['globalSpeedQualified'] is False,'D2 roles256 memory proof may not claim speed qualification'
  assert pair['status']=='passed-real-role-pair-parity' and pair['cases']==3 and pair['runs']==6 and pair['inputsPreserved'] is True and pair['policySavingBytes']==256*1024**2
  assert [row['kind'] for row in pair['records']]==['positive','jpeg','flat'],'D2 roles256 real-case coverage differs'
  for row in pair['records']:
   assert len(row['heapBytes'])==2 and all(type(value) is int and value>0 and value<=cap*1024**2 for value,cap in zip(row['heapBytes'],[512,256]))
   assert len(row['policyPeakBytes'])==2 and all(type(value) is int and value>0 for value in row['policyPeakBytes']) and row['policyPeakBytes'][0]-row['policyPeakBytes'][1]==256*1024**2
   assert len(row['targetSourceSha256'])==2 and all(re.fullmatch('[0-9a-f]{64}',value) for value in row['targetSourceSha256'])
 return entry
def qualified_table_simd_entry(previous,vendor,variant='table-simd4-scalar'):
 known={
  'table-simd4-scalar':{'files':{'table-simd4-scalar.js':{'bytes':7729,'sha256':'c710bd74cd271b047cf4178b47fc500f69508dde2fb47d346d749033ea46fbf5'},'table-simd4-scalar.wasm':{'bytes':17203,'sha256':'6c29e735058260f1d1ed35128730908e25edbd736d0c0f8c1c833c6831f7f6f9'}},'candidate':{'table-simd4-scalar.cpp':'fa3d530b5ff959d8350cda5563aae38b063658a64b4c10f97ecf0273b4c978a8','table-simd4-scalar-tiled.cpp':'26ffad7004c7167ed6e821b99dabbc6d89b180644fe0cf786bcfcf5e3ead7517'}},
  'table-simd4-normal':{'files':{'table-simd4-normal.js':{'bytes':7729,'sha256':'7ebe643342b7b36e4a030e95413e1a5cb013bb0321242ead2fb1360f732e192b'},'table-simd4-normal.wasm':{'bytes':18278,'sha256':'ef605d15bff9c35274ffff134759745194168f71f3fa75c3151d217c598765c4'}},'candidate':{'table-simd4-normal.cpp':'d5cde99fc10699c1b99d09e6fa9a530b7ead6c9ae90a340ad16ad5f69b584f7e','table-simd4-normal-tiled.cpp':'024b41759cd21afc3c7f325bc4443525ac4d6cc843da9f61514b021f76937d40'}},
  'table-simd4-exact-subnormal':{'buildScript':'scripts/build-d2prl-evaluator-table-simd-subnormal.mjs','files':{'table-simd4-exact-subnormal.js':{'bytes':7747,'sha256':'cda1e5e9d64566652c12d6eb5589b8f8621fcdc519897b47344dc2e9dfc0759a'},'table-simd4-exact-subnormal.wasm':{'bytes':18586,'sha256':'54944c22b79e25068908af4c0885a4b0cf2131cf943b77f176683cbef50f8fb5'}},'candidate':{'table-simd4-exact-subnormal.cpp':'7a8ede16ef8cc00da922ed2b00d6287c95efd4e6e5cf2fc7bd2f1280fd4d50eb','table-simd4-exact-subnormal-tiled.cpp':'2797c1ed1f6245d8a55ed266f63b2f5d5c4e17f9836c6c4069c55914eefc2122'}}
 }
 assert variant in known,'Unknown table/SIMD variant'
 expected_files=known[variant]['files'];entry=previous.get('builds',{}).get('evaluator-'+variant)
 if entry is None:
  assert not any((vendor/name).exists() for name in expected_files),'Unqualified table/SIMD evaluator has no portable metadata'
  return None
 # Version2 is a separate SHA-bound revision. Schema1 below keeps its exact historical contract.
 if variant=='table-simd4-exact-subnormal' and entry.get('schema')==2:
  expected={'schema': 2,
   'status': 'qualified-exact-current-public-api-half-round-table',
   'revision': 'half-round-table-v1',
   'descriptorLayout': 'HWC-uint16',
   'buildScript': '.build/d2prl-half-round-table/prepare-build.py',
   'stageScript': 'scripts/stage-d2prl-runtime.py',
   'compiler': 'emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.11 (a0014542110d6078c3a1a7941fa1ddb3a2281f16)',
   'compilerProvenance': {'kind': 'inferred-from-recorded-command-and-byte-identical-control',
                          'buildTimeVersionCaptured': False,
                          'legacyCompiler': 'emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.11 '
                                            '(a0014542110d6078c3a1a7941fa1ddb3a2281f16)',
                          'commandTool': 'em++',
                          'controlFiles': {'table-simd4-exact-subnormal.js': {'bytes': 7747,
                                                                              'sha256': 'cda1e5e9d64566652c12d6eb5589b8f8621fcdc519897b47344dc2e9dfc0759a'},
                                           'table-simd4-exact-subnormal.wasm': {'bytes': 18586,
                                                                                'sha256': '54944c22b79e25068908af4c0885a4b0cf2131cf943b77f176683cbef50f8fb5'}}},
   'sources': {'baselineTable': '38edcd7a5ab6ce5a2e81c71df8c2a2c04a4c31ba9589a237cf034cec991d3096',
               'originalCandidate': {'table-simd4-exact-subnormal.cpp': '7a8ede16ef8cc00da922ed2b00d6287c95efd4e6e5cf2fc7bd2f1280fd4d50eb',
                                     'table-simd4-exact-subnormal-tiled.cpp': '2797c1ed1f6245d8a55ed266f63b2f5d5c4e17f9836c6c4069c55914eefc2122'},
               'candidate': {'table-simd4-exact-subnormal.cpp': {'referenceFile': '.build/d2prl-half-round-table/candidate/table-simd4-exact-subnormal.cpp',
                                                                 'bytes': 11498,
                                                                 'sha256': 'aa1b85fedb3a440ce879d9f1365211fe91f0cdd6cb6110cc364b355bfe1c45ab'},
                             'table-simd4-exact-subnormal-tiled.cpp': {'referenceFile': '.build/d2prl-half-round-table/candidate/table-simd4-exact-subnormal-tiled.cpp',
                                                                       'bytes': 738,
                                                                       'sha256': '2797c1ed1f6245d8a55ed266f63b2f5d5c4e17f9836c6c4069c55914eefc2122'},
                             'reference-exp.h': {'referenceFile': '.build/d2prl-half-round-table/candidate/reference-exp.h',
                                                 'bytes': 1282,
                                                 'sha256': '63ec2b5a527d4429bbd1bfa1547cbbea440c097e02b1e4deab285b44fa60c24e'},
                             'prepare-build.py': {'referenceFile': '.build/d2prl-half-round-table/prepare-build.py',
                                                  'bytes': 5065,
                                                  'sha256': '20db78126f0995c9dc8d02dc37453109fe84bc80420088e7f74d872c7aea3654'}}},
   'files': {'table-simd4-exact-subnormal.js': {'bytes': 7747, 'sha256': 'cda1e5e9d64566652c12d6eb5589b8f8621fcdc519897b47344dc2e9dfc0759a'},
             'table-simd4-exact-subnormal.wasm': {'bytes': 19584, 'sha256': '1e94c50c2a89ead1f7e595e042966345ce20fe366a4b4c5e0f58a1e180695ee3'}},
   'scientificContract': {'modelSha256': '8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b',
                          'sharedBudgetBytes': 3221225472,
                          'cpuWorkersMaximum': 4,
                          'gpuWorkersMaximum': 1,
                          'rolesMemoryMaximumBytes': 268435456,
                          'nativeSide': 448,
                          'iterations': 40,
                          'seed': 22,
                          'referenceThreads': 8,
                          'newTables': 0,
                          'newHeapOrWorkspace': False,
                          'roundingAndReductionOrderChanged': False},
   'qualification': {'evidence': {'sourceBuild': {'referenceFile': '.build/d2prl-half-round-table/source-build-proof.json',
                                                  'bytes': 7330,
                                                  'sha256': '76e55d9ab43ef066e330e63b6a5a14ff106f45676cd8bf7bcea4d43fd2ded907'},
                                  'nativeParity': {'referenceFile': '.build/d2prl-half-round-table/native-parity.json',
                                                   'bytes': 105362,
                                                   'sha256': '9aedb414cf5c8674de9a21352dafcf52accb19539f584b3bd1a6e7d6acf2b216'},
                                  'publicModel': {'referenceFile': '.build/d2prl-half-round-table/real-model-qualification.json',
                                                  'bytes': 431879,
                                                  'sha256': '8051fb1e6e04e950c91cb2738a166ccafadb3314df3a96db6a2429a7b3842863'},
                                  'largeQualification': {'referenceFile': '.build/d2prl-half-round-table/large-qualification.json',
                                                         'bytes': 13247,
                                                         'sha256': '3929259d6090f3caffdbf20de1259a3e53b69a040f646aa994565e2a98685a7b'},
                                  'large30': {'referenceFile': '.build/d2prl-half-round-table/large30-resume1/large-report.json',
                                              'bytes': 2001694,
                                              'sha256': '9a4c30ade2042bd86fea41353b73848129be0adbb4208dad051792df54e4265d'},
                                  'large96': {'referenceFile': '.build/d2prl-half-round-table/large96-qualification1/large-report.json',
                                              'bytes': 2133255,
                                              'sha256': '20f7049c269604cfff7dff7525a51775ef856c304bc184d2b477497c4de5c97a'},
                                  'postInstallSmoke': {'referenceFile': '.build/d2prl-half-round-table/post-install-smoke1/post-install-smoke-report.json',
                                                       'bytes': 78615,
                                                       'sha256': 'cc633537796cca37448604d545d619f0ed480d512f59ca4b15d6d3aa7e6b846d'}},
                     'nativeParity': {'status': 'passed-current-vendor-control-candidate-bit-parity',
                                      'cases': 174,
                                      'allHeapsWithinOriginalABI': True,
                                      'sourceSha256': 'aa1b85fedb3a440ce879d9f1365211fe91f0cdd6cb6110cc364b355bfe1c45ab'},
                     'publicModel': {'status': 'passed-current-complete-public-model-lut-parity-and-balanced-timings',
                                     'parityRecords': 2,
                                     'timingRecords': 4,
                                     'balancedPairs': 2,
                                     'rawOutputsMasksViewsNPZAndRefiltersExact': True,
                                     'allFinalOwnersLeasesBackingsZero': True,
                                     'analysisMedianPairedGainPercent': 10.229296471911164},
                     'largeSizes': [{'sizeMP': 30,
                                     'status': 'passed-current-large-public-engine',
                                     'balancedPairs': 2,
                                     'exactAllScientificRepetitions': True,
                                     'analysisMedianPairedGainPercent': 9.297308822792626,
                                     'independentNpz': ['passed', 'passed', 'passed', 'passed'],
                                     'hostCleanup': {'status': 'closed', 'failures': []}},
                                    {'sizeMP': 96,
                                     'status': 'passed-current-large-public-engine-with-native-diagnostic-unavailable',
                                     'balancedPairs': 2,
                                     'exactAllScientificRepetitions': True,
                                     'analysisMedianPairedGainPercent': 9.32466744410345,
                                     'independentNpz': ['passed', 'passed', 'passed', 'passed'],
                                     'hostCleanup': {'status': 'closed', 'failures': []}}],
                     'nativeTorch96': {'status': 'unavailable-pinned-files-missing-no-comparison',
                                       'qualified': False,
                                       'missing': [{'expectedBytes': 2408448,
                                                    'expectedSha256': 'e3bad27163e2ff123fb8ffa9d6e19b31cbd57422f1d90adbebd5e409d8e7ab1e',
                                                    'status': 'absent-not-compared'},
                                                   {'expectedBytes': 2408448,
                                                    'expectedSha256': 'b79181d6a57e28a097724aeebda7ae23fb6e82cc67c24af5896eedf8540548ff',
                                                    'status': 'absent-not-compared'},
                                                   {'expectedBytes': 2408448,
                                                    'expectedSha256': '0bd6f8cf68034cc974f5262235306acca6f4e96ba6b9568aa40a67de84499aae',
                                                    'status': 'absent-not-compared'}]},
                     'postInstallSmoke': {'status': 'passed-installed-public-api-no-remapping',
                                          'installed': True,
                                          'exact': True,
                                          'remapping': False,
                                          'injection': False,
                                          'speedClaim': False,
                                          'hostCleanup': {'status': 'closed', 'failures': []}},
                     'scope': 'SHA-bound half-round-table-v1 only. Exact current public API parity on the recorded pinned source and 30/96MP fixtures; two '
                              'balanced timing pairs per fixture. No universal gain or detector-accuracy claim. Historical native Torch96 binaries remain absent '
                              'and unqualified. Compiler version is an explicit inference, not a captured build-time version.'}}
  assert json.dumps(entry,sort_keys=True,separators=(',',':'))==json.dumps(expected,sort_keys=True,separators=(',',':')),'Unknown or changed half-round-table-v1 identity/provenance/qualification'
  assert previous['builds'].get('evaluator-pixel-major',{}).get('status')=='qualified-exact-direct-model','Qualified HWC baseline required'
  roles=previous['builds'].get('roles-256-d2prl',{})
  assert roles.get('status')=='qualified-exact-current-engine-memory-cap' and roles.get('runtimeId')=='ort130-wasm-256mib-d2prl' and roles.get('memoryMaximumBytes')==268435456,'Qualified unchanged256MiB D2 roles required'
  assert '/Users/' not in json.dumps(entry),'Nonportable half-round-table-v1 metadata'
  def verified(name,spec,folder):
   source=folder/name
   assert source.is_file() and not source.is_symlink() and source.stat().st_size==spec['bytes'] and sha(source)==spec['sha256'],'Half-round-table-v1 artifact/proof differs: '+name
  for name,spec in expected['files'].items():
   assert previous['files'].get(name)==spec,'Half-round-table-v1 portable pin differs: '+name
   verified(name,spec,vendor)
  evidence_root=vendor.parent.parent
  for spec in list(expected['sources']['candidate'].values())+list(expected['qualification']['evidence'].values()):
   name=spec['referenceFile']
   assert not Path(name).is_absolute() and '..' not in Path(name).parts and name.startswith('.build/'),'Portable half-round-table-v1 evidence reference required'
   verified(name,spec,evidence_root)
  return entry
 assert set(entry)=={'schema','status','descriptorLayout','buildScript','stageScript','compiler','sources','files','qualification'},'Unknown table/SIMD evaluator metadata'
 assert entry['schema']==1 and entry['status']=='qualified-exact-direct-model' and entry['descriptorLayout']=='HWC-uint16'
 assert entry['buildScript']==known[variant].get('buildScript','scripts/build-d2prl-evaluator-table-simd.mjs') and entry['stageScript']=='scripts/stage-d2prl-evaluator-module.mjs'
 assert isinstance(entry['compiler'],str) and '6.0.11' in entry['compiler'] and '/Users/' not in json.dumps(entry),'Nonportable table/SIMD evaluator metadata'
 assert previous['builds'].get('evaluator-pixel-major',{}).get('status')=='qualified-exact-direct-model','Qualified HWC baseline required'
 assert entry['files']==expected_files,'Unknown table/SIMD compiled artifact identity'
 expected_sources={'baselineTable':'38edcd7a5ab6ce5a2e81c71df8c2a2c04a4c31ba9589a237cf034cec991d3096','candidate':known[variant]['candidate']}
 assert entry['sources']==expected_sources,'Known table/SIMD source identity differs'
 q=entry['qualification'];assert set(q)=={'directModel','smallParity','nativeCorpus','runtimeReference','runtimeCandidate','scope'},'Unknown table/SIMD qualification metadata'
 direct=q['directModel'];native=q['nativeCorpus'];small=q['smallParity']
 def proof(value):
  assert type(value.get('bytes')) is int and value['bytes']>0 and re.fullmatch('[0-9a-f]{64}',value.get('sha256','')),'Invalid table/SIMD proof identity'
 for value in [direct,native,small]:proof(value)
 assert direct['status']=='passed-exact-parity' and direct['referenceKind']=='frozen-current-engine-source' and re.fullmatch('snapshot:[0-9a-f]{64}',direct['reference'])
 assert direct['additionalGainBaseline']=='previously qualified HWC current-engine snapshot' and direct['rolesMemoryMiB']==256
 assert direct['modelSha256']=='8d040659ccfebb62fea155ed98f6d0effc563bfbf8c6a8df225c1c814257a51b' and type(direct['runs']) is int and direct['runs']>=8 and type(direct['repetitions']) is int and direct['repetitions']>=2 and direct['repetitions']%2==0
 assert {'cold-context-new-model','warm-retained-model'}<=set(direct['temperatures']) and direct['summary'] and direct['jobs']
 if direct.get('speedCriterion')=='all-paired-runs-faster':
  assert type(direct['allCasesReachFivePercent']) is bool and (not direct['allCasesReachFivePercent'] or all(row['globalGainQualified'] is True for row in direct['summary'])),'Table/SIMD five-percent scope differs'
  assert all(row['exact'] is True and row['pairs']>=2 and row['allPairedRunsFaster'] is True and type(row['minObservedPairedGainPercent']) in [int,float] and row['minObservedPairedGainPercent']>0 and row['pairedMedianGainPercent']>=row['minObservedPairedGainPercent'] and row['globalGainQualified'] is (row['pairedMedianGainPercent']>=5) for row in direct['summary']),'Every explicitly accepted table/SIMD pair must be faster'
  assert direct['minObservedPairedGainPercent']==min(row['minObservedPairedGainPercent'] for row in direct['summary']) and direct['minObservedPairedGainPercent']>0,'Table/SIMD minimum observed gain differs'
 else:
  assert direct.get('speedCriterion') in [None,'paired-median-at-least-five-percent'],'Unknown table/SIMD speed criterion'
  assert all(row['exact'] is True and row['globalGainQualified'] is True and row['pairs']>=2 and row['pairedMedianGainPercent']>=5 for row in direct['summary']),'Table/SIMD direct gain is unqualified'
 assert small['status']=='passed-small-corpus-bit-parity' and small['cases']>=58 and small['totalElements']>0
 assert native['status'] in ['passed-existing-native-corpora','passed-available-native-corpora'] and native['softmaxStatus']=='passed' and native['evaluatorCases']>=264 and native['evaluatorElements']>=723784
 assert native['coverageComplete']==(len(native['missing'])==0) and (native['status']=='passed-available-native-corpora')==(len(native['missing'])>0),'Native table/SIMD omissions must be explicit'
 for field in ['runtimeReference','runtimeCandidate']:
  value=q[field];assert set(value)=={'files','sha256'} and type(value['files']) is int and value['files']>0 and re.fullmatch('[0-9a-f]{64}',value['sha256']),'Invalid table/SIMD snapshot identity'
 assert direct['reference']=='snapshot:'+q['runtimeReference']['sha256'],'Frozen table/SIMD baseline identity differs'
 for name,spec in sorted(expected_files.items()):
  assert previous['files'].get(name)==spec,'Table/SIMD portable pin differs'
  source=vendor/name
  assert source.is_file() and not source.is_symlink() and source.stat().st_size==spec['bytes'] and sha(source)==spec['sha256'],'Qualified table/SIMD artifact differs: '+name
 return entry
previous=json.loads((out/'PINNED.json').read_text()) if (out/'PINNED.json').exists() else {}
fast=qualified_fast_entry();roles256=verified_roles_entry(previous,out);table_simd=qualified_table_simd_entry(previous,out);table_simd_normal=qualified_table_simd_entry(previous,out,'table-simd4-normal');table_simd_subnormal=qualified_table_simd_entry(previous,out,'table-simd4-exact-subnormal');out.mkdir(exist_ok=True)
def copy(source,name):
 data=source.read_bytes();assert b'/' + b'Users/' not in data,'Private path in '+str(source);target=out/name;target.write_bytes(data);files[name]=dict(bytes=len(data),sha256=sha(target))
for name,stem in [('prepare','prepare'),('feature-math','feature-math'),('neural-math','neural-math'),('dlf','dlf'),('convolution-cpu','convolution'),('evaluator-tiled','evaluator-tiled'),('postprocess','postprocess'),('spatial','spatial')]:
 base=root/'.build'/('d2prl-'+name);build=json.loads((base/'build.json').read_text());builds[name]=build
 for extension in ['js','wasm']:copy(base/(stem+'.'+extension),stem+'.'+extension)
if fast:
 builds['evaluator-pixel-major']=fast
 for name in sorted(fast['files']):files[name]=dict(fast['files'][name])
if table_simd:
 builds['evaluator-table-simd4-scalar']=table_simd
 for name in sorted(table_simd['files']):files[name]=dict(table_simd['files'][name])
if table_simd_normal:
 builds['evaluator-table-simd4-normal']=table_simd_normal
 for name in sorted(table_simd_normal['files']):files[name]=dict(table_simd_normal['files'][name])
if table_simd_subnormal:
 builds['evaluator-table-simd4-exact-subnormal']=table_simd_subnormal
 for name in sorted(table_simd_subnormal['files']):files[name]=dict(table_simd_subnormal['files'][name])
for name in ['SLEEF-LICENSE.txt','SLEEF-PINNED.json','PYTORCH-LICENSE.txt','MT19937-LICENSE.txt']:copy(root/'experiments/d2prl'/name,name)
copy(root/'vendor/cloning/MUSL-LICENSE.txt','MUSL-LICENSE.txt')
for name in ['ort-wasm-simd-threaded.mjs','factory.mjs']:copy(root/'.build/d2prl-roles-runtime'/name,name)
for name in ['ort-wasm-simd-threaded.wasm','ort.wasm.min.mjs']:copy(root/'.build/ort130/package/dist'/name,name)
copy(root/'.build/ort130/notices/LICENSE','ONNXRUNTIME-LICENSE.txt')
copy(root/'.build/ort130/notices/ThirdPartyNotices.txt','ONNXRUNTIME-ThirdPartyNotices.txt')
copy(root/'.build/ort130/notices/sources.json','ONNXRUNTIME-SOURCES.json')
runtime=json.loads((root/'.build/d2prl-roles-runtime/runtime.json').read_text())
if roles256:
 assert runtime['runtimeId']=='ort130-wasm-512mib' and runtime['memoryMaximumBytes']==512*1024**2 and runtime['wasmSha256']==roles256['wasmSha256'],'Regenerated shared512 runtime differs'
 assert files[roles256['source']['file']]=={key:roles256['source'][key] for key in ['bytes','sha256']} and files[roles256['sharedWasm']]==previous['files'][roles256['sharedWasm']],'Regenerated shared512 source/WASM differs'
 builds['roles-256-d2prl']=roles256
 for name in sorted(roles256['files']):files[name]=dict(roles256['files'][name])
(out/'PINNED.json').write_text(json.dumps(dict(schema=1,scope='Portable runtime without model weights; private package supplied separately by verified manifest. No runtime calibration.',rolesRuntime=runtime,builds=builds,files=files),indent=2)+'\n')
print('Staged',len(files),'runtime files; no model parameters')
