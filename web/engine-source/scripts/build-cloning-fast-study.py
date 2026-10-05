"""Build an isolated exact-FMA candidate from the pinned AKAZE study objects.

Run build-cloning-math.py first. No product/prototype binary is overwritten.
"""
from pathlib import Path
import hashlib,json,os,subprocess
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
command=[str(compiler),str(root/'native/cloning.cpp'),str(root/'native/cloning-fma.cpp'),str(root/'.build/cloning-orb-reference.o')]
records=[]
for name,expected in [('AKAZEFeatures',79),('nldiffusion_functions',13),('fed',8)]:
    source=root/f'.build/akaze-area-{name}.ll';text=source.read_text()
    assert text.count('@llvm.fma.f32')==expected
    output=root/f'.build/akaze-fast-{name}.ll';output.write_text(text.replace('@llvm.fma.f32','@cloning_fma32'))
    obj=output.with_suffix('.o');subprocess.run([str(compiler),'-O3','-c',str(output),'-o',str(obj)],check=True);command.append(str(obj))
    records.append(dict(source=source.relative_to(root).as_posix(),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),callSites=expected-1,symbolReferences=expected))
declaration='extern "C" float cloning_fma32(float,float,float);\n'
for name in ['angles','filters','separable','area']:
    source=root/f'experiments/cloning/akaze-{name}.cpp';text=source.read_text()
    # All helper FMA operands are float32; no double accumulation is replaced.
    output=root/f'.build/akaze-fast-{name}.cpp';output.write_text(declaration+text.replace('std::fma(', 'cloning_fma32('));command.append(str(output))
for name in ['features2d','flann','imgproc','core']:
    command += [str(root/f'.build/cv/lib/libopencv_{name}.a'),'-I',str(root/f'.build/opencv-4.11.0/modules/{name}/include')]
command += [str(root/'.build/cv/3rdparty/lib/libzlib.a'),'-I',str(root/'.build/cv'),'-I',str(root/'.build'),'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMEMORY_GROWTH_LINEAR_STEP=16777216','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_cloning_detect","_cloning_detect_akaze","_cloning_result","_cloning_descriptors","_cloning_release","_cloning_select","_cloning_match","_cloning_match_sized","_cloning_norm","_cloning_draw_points","_cloning_draw_matches","_cloning_count","_cloning_fma_mode","_cloning_fma_test"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPU32","HEAPF64","HEAPF32"]','-o',str(root/'.build/cloning-fast.mjs')]
subprocess.run(command,check=True)
(root/'.build/cloning-fast-build.json').write_text(json.dumps(dict(schema=1,scope='offline candidate only',llvm=records,wasmSha256=hashlib.sha256((root/'.build/cloning-fast.wasm').read_bytes()).hexdigest()),indent=2)+'\n')
