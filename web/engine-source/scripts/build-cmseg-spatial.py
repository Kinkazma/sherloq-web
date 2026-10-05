"""Separate512 input-domain build of the existing source projection kernel.

The default448 build and delivered D2PRL binary are not replaced.
"""
from pathlib import Path
import os,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1]
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0];assert '4.0.15' in version
out=root/'.build/cmseg-spatial';out.mkdir(exist_ok=True)
source=root/'experiments/d2prl/spatial.cpp';objects=[root/'.build/dft-reference.o',root/'.build/cv/lib/libopencv_imgproc.a',root/'.build/cv/lib/libopencv_core.a']
subprocess.run([str(compiler),str(source),*[str(p) for p in objects],'-DSHERLOQ_SPATIAL_MAX_INPUT=512',
 '-I'+str(root/'.build/opencv-4.11.0/modules/core/include'),'-I'+str(root/'.build/opencv-4.11.0/modules/imgproc/include'),'-I'+str(root/'.build/cv'),
 '-O3','-ffp-contract=off','-fexceptions','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
 '-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=536870912','-sMEMORY_GROWTH_LINEAR_STEP=16777216',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_d2prl_resize_plane"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'spatial512.js')],check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'build.json').write_text(json.dumps(dict(schema=1,compiler=version,maxInputSide=512,sourceSha256=sha(source),objects={p.name:sha(p) for p in objects},files={p.name:dict(bytes=p.stat().st_size,sha256=sha(p)) for p in [out/'spatial512.js',out/'spatial512.wasm']}),indent=2)+'\n')
print('Built independent512 source projection',flush=True)
