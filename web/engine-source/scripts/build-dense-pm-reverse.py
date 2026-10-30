from pathlib import Path
import argparse, subprocess, hashlib, json
parser=argparse.ArgumentParser(description='Build the native ordered reverse phase for the shared dense GPU broker.')
parser.add_argument('--emxx',required=True)
a=parser.parse_args()
root=Path(__file__).resolve().parents[1]
target=root/'vendor/dense-pm'
subprocess.run([a.emxx,str(target/'dense-pm-reverse.cpp'),'-O3','-ffp-contract=off','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,node','-sALLOW_MEMORY_GROWTH=1','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPU32","HEAPF32"]','-sEXPORTED_FUNCTIONS=["_malloc","_free","_dense_reverse_state_range","_dense_reverse_state_metric_range","_dense_reverse_state_symmetric_range","_dense_reverse_active_map","_dense_reverse_active_validate","_dense_reverse_state_active_range"]','-ffile-prefix-map='+str(root)+'=','-o',str(target/'dense-pm-reverse.js')],check=True)
files={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [target/'dense-pm-reverse.cpp',target/'dense-pm-reverse.js',target/'dense-pm-reverse.wasm']}
(target/'PINNED.json').write_text(json.dumps({'source':'Native bridge.cpp live ordered reverse, float32 contraction off','files':files},indent=2)+'\n')
