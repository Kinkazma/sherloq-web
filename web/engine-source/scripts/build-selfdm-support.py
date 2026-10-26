"""Rebuild the additive native SEEDS support component from pinned inputs."""
from pathlib import Path
import argparse,hashlib,json,subprocess,os
p=argparse.ArgumentParser()
for name in ['emsdk','opencv-source','opencv-contrib-source','opencv-build','output-dir']:p.add_argument('--'+name,type=Path,required=True)
a=p.parse_args();root=Path(__file__).resolve().parents[1];native=root/'native/selfdm-support'
recipe=json.loads((native/'BUILD.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
for name,r in recipe['inputs'].items():
 f=native/name
 if f.stat().st_size!=r['bytes'] or sha(f)!=r['sha256']:raise ValueError('Native source identity differs: '+name)
libs=[a.opencv_build/'lib/libopencv_imgproc.a',a.opencv_build/'lib/libopencv_core.a',a.opencv_build/'3rdparty/lib/libzlib.a']
for f in libs:
 r=recipe['libraryInputs'][f.name]
 if f.stat().st_size!=r['bytes'] or sha(f)!=r['sha256']:raise ValueError('Pinned native library differs: '+f.name)
compiler=a.emsdk/'upstream/emscripten/emcc'
version=subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
if '4.0.15' not in version:raise ValueError('Emscripten 4.0.15 required')
out=a.output_dir.resolve();out.mkdir(parents=True,exist_ok=False)
sources=[native/'proposal-colour-support.cpp',native/'upstream/seeds-wrapper.cpp',native/'seeds-support-wrapper.cpp',native/'upstream/seeds.cpp']
modules=['calib3d','core','dnn','features2d','flann','gapi','highgui','imgcodecs','imgproc','ml','objdetect','photo','stitching','ts','video','videoio','world']
includes=[a.opencv_source/'modules'/n/'include' for n in modules]+[a.opencv_contrib_source/'modules/ximgproc/include',a.opencv_build,a.opencv_contrib_source/'modules/ximgproc/src']
command=[str(compiler),*[str(f) for f in sources],*[str(f) for f in libs],*['-I'+str(f) for f in includes],*recipe['flags'],
 '-ffile-prefix-map='+str(native)+'=native/selfdm-support',
 '-ffile-prefix-map='+str(a.opencv_source)+'=opencv-4.11.0',
 '-ffile-prefix-map='+str(a.opencv_contrib_source)+'=opencv_contrib-4.11.0',
 '-o',str(out/'seeds-support.mjs')]
subprocess.run(command,check=True,env=dict(os.environ,EM_CONFIG=str(a.emsdk/'.emscripten')))
outputs={n:{'bytes':(out/n).stat().st_size,'sha256':sha(out/n)} for n in ['seeds-support.mjs','seeds-support.wasm']}
report={'schema':'sherloq.selfdm-seeds-support-output/1','compiler':version,'inputs':recipe['inputs'],'outputs':outputs,'sourcePathPolicy':'Portable relative diagnostic names; native mathematical sources and arithmetic flags unchanged.'}
(out/'PINNED.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(outputs))
