"""Rebuild mathematical ONNX operators and the qualified float32 FMA anchors.

Requires Python onnx1.19.0 and Emscripten4.0.15. No learned weights are generated,
downloaded, modified or embedded in these operator-only resources.
"""
from pathlib import Path
import argparse,hashlib,json,os,shutil,subprocess
import onnx
from google.protobuf import text_format
parser=argparse.ArgumentParser();parser.add_argument('--emcc',default=os.environ.get('EMCC')or shutil.which('emcc'));args=parser.parse_args()
if not args.emcc:parser.error('Set EMCC or provide --emcc for Emscripten4.0.15.')
version=subprocess.check_output([args.emcc,'--version'],text=True).splitlines()[0]
if '4.0.15'not in version:raise SystemExit('This reconstruction is pinned to Emscripten4.0.15.')
if onnx.__version__!='1.19.0':raise SystemExit('This reconstruction is pinned to onnx1.19.0.')
root=Path(__file__).resolve().parents[1];out=root/'vendor/xfeat-glue-global';out.mkdir(parents=True,exist_ok=True)
records=json.loads((root/'native/xfeat-glue-operators.textproto.json').read_text())
for name,source in records.items():
 model=onnx.ModelProto();text_format.Parse(source,model);onnx.checker.check_model(model);(out/name).write_bytes(model.SerializeToString())
flags=['-O3','-ffp-contract=off','-fno-fast-math']
for name,extra in [('cross-dot-fma',[]),('cross-dot-relaxed-fma',['-msimd128','-mrelaxed-simd','-DCROSS_RELAXED_FMA=1'])]:
 subprocess.run([args.emcc,*flags,*extra,str(root/'native/xfeat-glue-cross-dot.c'),'-sSTANDALONE_WASM=1','-sFILESYSTEM=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sALLOW_MEMORY_GROWTH=1','-Wl,--no-entry','-Wl,--export=cross_dot','-Wl,--export=fma_triplets','-Wl,--export=__heap_base','-o',str(out/(name+'.wasm'))],check=True)
expected=json.loads((out/'PINNED.json').read_text())
for name,pin in expected['resources'].items():
 data=(out/pin['file']).read_bytes()
 if len(data)!=pin['bytes']or hashlib.sha256(data).hexdigest()!=pin['sha256']:raise SystemExit('Rebuilt resource differs from its pinned bytes: '+name)
print(json.dumps({'status':'rebuilt-pins-exact','resources':len(expected['resources']),'compiler':version,'onnx':onnx.__version__}))
