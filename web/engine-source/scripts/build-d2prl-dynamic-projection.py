"""Build larger D2PRL projection helpers without changing the base448 modules."""
from pathlib import Path
import argparse,hashlib,json,os,subprocess
parser=argparse.ArgumentParser();parser.add_argument('--native-build',type=Path,required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];native=args.native_build
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
out=root/'vendor/d2prl/dynamic';out.mkdir(parents=True,exist_ok=True)
objects=[native/'dft-reference.o',native/'cv/lib/libopencv_imgproc.a',native/'cv/lib/libopencv_core.a']
common=['-O3','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-ffile-prefix-map='+str(native)+'/=','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]']
for name,exports in [('postprocess',['malloc','free','d2prl_postprocess']),('spatial',['malloc','free','d2prl_resize_plane','d2prl_resize_plane_probe'])]:
 source=root/'experiments/d2prl'/f'{name}.cpp'
 subprocess.run([str(compiler),str(source),*map(str,objects),'-I'+str(native/'opencv-4.11.0/modules/core/include'),'-I'+str(native/'opencv-4.11.0/modules/imgproc/include'),'-I'+str(native/'cv'),'-DSHERLOQ_SPATIAL_MAX_INPUT=1792','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0',*common,'-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+n for n in exports]),'-o',str(out/f'{name}.js')],check=True)
source=root/'native/neural-spatial-bands.cpp'
subprocess.run([str(compiler),str(source),*common,'-sINITIAL_MEMORY=67108864','-sMAXIMUM_MEMORY=67108864','-sEXPORTED_FUNCTIONS=["_malloc","_free","_neural_spatial_rows"]','-o',str(out/'spatial-bands.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'projection-PINNED.json').write_text(json.dumps({'schema':1,'compiler':version,'inputSides':[896,1344,1792],'base448ModulesUnchanged':True,'objects':{p.name:sha(p) for p in objects},'files':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in out.glob('*') if p.stem in ['postprocess','spatial','spatial-bands'] and p.suffix in ['.js','.wasm']}},indent=2)+'\n')
