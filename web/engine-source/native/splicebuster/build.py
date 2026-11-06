"""Rebuild the pinned Splicebuster kernel with Emscripten4.0.15.

Set EMSDK to an external SDK root. Compiler config/cache/temp files stay in the
engine's ignored .build directory; only qualified outputs enter the runtime.
"""
from pathlib import Path
import argparse,json,os,subprocess,hashlib,shutil
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--stream',action='store_true');args=parser.parse_args()
if not os.environ.get('EMSDK'):parser.error('Set EMSDK to an Emscripten4.0.15 SDK root.')
SDK=Path(os.environ['EMSDK']).resolve()
PRIVATE=HERE.parents[1]/'.build/splicebuster';PRIVATE.mkdir(parents=True,exist_ok=True)
TEMP=PRIVATE/'tmp';TEMP.mkdir(exist_ok=True)
NODE=next((SDK/'node').glob('*/bin/node'))
CONFIG=PRIVATE/'private-4.emscripten'
CONFIG.write_text('\n'.join(f'{key} = {str(value)!r}' for key,value in dict(LLVM_ROOT=SDK/'upstream/bin',BINARYEN_ROOT=SDK/'upstream',EMSCRIPTEN_ROOT=SDK/'upstream/emscripten',NODE_JS=NODE).items())+'\n')
ENV={**os.environ,'EM_CONFIG':str(CONFIG),'EM_CACHE':str(PRIVATE/'cache4'),'TMPDIR':str(TEMP),'EMCC_CORES':'1'}
compiler=SDK/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],env=ENV,text=True).splitlines()[0]
assert '4.0.15' in version,version
exports=['malloc','free','sb_prepare','sb_fit','sb_map']
source='statistics.cpp';stem='statistics'
if args.stream:
 source='stream-statistics.cpp';stem='stream-statistics'
 exports+=['sb_indices','sb_feature_sums','sb_feature_covariance','sb_basis','sb_project','sb_training_sums','sb_training_variance','sb_initial_model','sb_expect_chunk','sb_covariance_chunk','sb_model_update','sb_factor']
cmd=[str(compiler),source,'-Itoolchain','-O3','-msimd128','-ffp-contract=off','-DEIGEN_DONT_PARALLELIZE','-DNDEBUG','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createStatistics','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sSTACK_SIZE=1048576','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS='+','.join('_'+x for x in exports),'-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF32,HEAPF64,HEAP32,HEAPU32','-o',stem+'.mjs']
expected_path=HERE/(stem+'-build.json')
expected=json.loads(expected_path.read_text())
subprocess.run(cmd,cwd=HERE,env=ENV,check=True)
manifest=dict(compiler=version,flags=cmd[2:-2],source=source,files={name:dict(bytes=(HERE/name).stat().st_size,sha256=hashlib.sha256((HERE/name).read_bytes()).hexdigest()) for name in [source,stem+'.mjs',stem+'.wasm']})
for name in [source,stem+'.mjs',stem+'.wasm']:
 if manifest['files'][name]!=expected['files'][name]:raise RuntimeError('Rebuild differs from pinned identity: '+name+'. Qualify the change before replacing runtime assets.')
target=HERE.parents[1]/'src/splicebuster/cpu'
for suffix in ['.mjs','.wasm']:shutil.copyfile(HERE/(stem+suffix),target/(stem+suffix))
print(json.dumps({key:manifest[key] for key in ['compiler','source','files']}))
