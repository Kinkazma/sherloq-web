"""Use M3's numerical OpenCV SIFT object read-only; own wrapper and outputs."""
from pathlib import Path
import argparse,os,subprocess,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--opencv-build',type=Path,required=True);p.add_argument('--sift-object',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope';out.mkdir(parents=True,exist_ok=True)
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True)
command=[str(compiler),str(root/'native/forgeryscope-sift.cpp'),str(a.sift_object)]
for name in ['features2d','flann','imgproc','core']:
    command+=[str(a.opencv_build/f'cv/lib/libopencv_{name}.a'),'-I',str(a.opencv_build/f'opencv-4.11.0/modules/{name}/include')]
command+=[str(a.opencv_build/'cv/3rdparty/lib/libzlib.a'),'-I',str(a.opencv_build/'cv'),'-O3','-fexceptions','-ffp-contract=off','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS=["_malloc","_free","_fg_sift","_fg_sift_points","_fg_sift_descriptors","_fg_sift_gray","_fg_sift_release"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32"]','-o',str(out/'sift.mjs')]
subprocess.run(command,check=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'sift-build.json').write_text(json.dumps(dict(schema=1,opencv='4.11.0',sharedSiftObjectSha256=sha(a.sift_object),sourceSha256=sha(root/'native/forgeryscope-sift.cpp'),files={name:dict(bytes=(out/name).stat().st_size,sha256=sha(out/name)) for name in ['sift.mjs','sift.wasm']}),indent=2)+'\n')
