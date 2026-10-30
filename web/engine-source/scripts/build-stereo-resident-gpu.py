"""Build the optional resident GPU callbacks over the pinned Farneback source.

The existing CPU binaries are not overwritten. The input reference compilation
already preserves native FMA contractions; this increment adds only blur hooks.
"""
from pathlib import Path
import os,re,shlex,subprocess,json,shutil,hashlib
root=Path(__file__).resolve().parents[1]
external=Path(os.environ['OPENCV_BUILD_ROOT'])
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
build=root/'.build/stereo-resident-gpu';build.mkdir(parents=True,exist_ok=True)
out=root/'vendor/stereo-resident-gpu';out.mkdir(parents=True,exist_ok=True)
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
expected=json.loads((root/'vendor/stereo-resident-source/PINNED.json').read_text())
for relative,sha in expected['inputs'].items():
    location=root/relative if relative.startswith(('native/','vendor/')) else external/relative
    if hashlib.sha256(location.read_bytes()).hexdigest()!=sha:raise RuntimeError('Pinned stereo input mismatch: '+relative)
source=(root/'vendor/stereo-resident-source/farneback-reference.cpp').read_text()
marker='namespace cv {'
assert source.count(marker)>=1
source=source.replace(marker,marker+'\nbool sherloqStereoGpuBlur(const Mat&,Mat&,int,const float*,int);\nvoid sherloqStereoCpuBlurObserved(int,int,int,int,double);',1)
start=source.index('FarnebackUpdateFlow_GaussianBlur(')
before,part=source[:start],source[start:]
marker='    // compute blur(G)*flow=blur(h)'
assert part.count(marker)==1
part=part.replace(marker,'''    // Native updates stay farther behind the row than its blur radius.
    // Only the ordered f32 blur is computed in parallel; the f64 solve and
    // original matrix update schedule below are retained.
    Mat gpuBlurred;
    const bool gpuBlur=sherloqStereoGpuBlur(matM,gpuBlurred,m+1,kernel,1);
    double nativeBlurMs=0.;
'''+marker,1)
marker='        // vertical blur'
assert part.count(marker)==1
part=part.replace(marker,'''        if(gpuBlur){std::copy_n(gpuBlurred.ptr<float>(y),width*5,hsum);}
        else{const double nativeBlurRowStart=sherloq_stereo_clock();
'''+marker,1)
marker='''        for( x = 0; x < width; x++ )
        {
            g11 = hsum[x*5];'''
assert part.count(marker)==1
part=part.replace(marker,'        nativeBlurMs+=sherloq_stereo_clock()-nativeBlurRowStart;\n        }\n'+marker,1)
opening=part.index('{');depth=1;end=opening+1
while depth:
    depth+=(part[end]=='{')-(part[end]=='}');end+=1
part=part[:end-1]+'    if(!gpuBlur)sherloqStereoCpuBlurObserved(width,height,m+1,1,nativeBlurMs);\n'+part[end-1:]
vertical=part.index('        x = 0;',part.index('        // vertical blur'));end=part.index('        // update borders',vertical)
part=part[:vertical]+'        stereoMatrixVertical(vsum,srow,kernel,width*5,m);\n\n'+part[end:]
horizontal=part.index('        // horizontal blur');end=part.index('        nativeBlurMs+=',horizontal)
part=part[:horizontal]+'        stereoMatrixHorizontal(vsum,hsum,kernel,width*5,m);\n'+part[end:]
before='#include "'+str(root/'native/stereo-matrix-simd.h')+'"\n'+before
generated=build/'farneback-resident-gpu.cpp';generated.write_text(before+part)
flags_text=(external/'cv/modules/video/CMakeFiles/opencv_video.dir/flags.make').read_text()
flags=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:
    flags+=shlex.split(re.search('^'+key+r' = (.*)$',flags_text,re.M)[1])
flags=['-ffp-contract=on' if arg=='-ffp-contract=off' else arg for arg in flags]
llvm=build/'farneback.ll';obj=build/'farneback.o'
subprocess.run([str(compiler),*flags,'-ffile-prefix-map='+str(root)+'/=','-I',str(external/'opencv-4.11.0/modules/video/src'),'-S','-emit-llvm',str(generated),'-o',str(llvm)],cwd=external/'cv/modules/video',check=True)
text=llvm.read_text().replace('@llvm.fmuladd.','@llvm.fma.')
for kind,c in [('f32','float'),('f64','double')]:
    name='sherloq_stereo_fma'+('64' if kind=='f64' else '')
    text=text.replace('@llvm.fma.'+kind,'@'+name)
    text=re.sub(r'declare '+c+' @'+name+r'\('+c+', '+c+', '+c+r'\) #\d+',f'declare {c} @{name}({c}, {c}, {c})',text)
seen=set();lines=[]
for line in text.splitlines():
    if line.startswith('declare ') and line in seen:continue
    if line.startswith('declare '):seen.add(line)
    lines.append(line)
text='\n'.join(lines)+'\n'
llvm.write_text(text);subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(obj)],check=True)
includes=[external/f'opencv-4.11.0/modules/{name}/include' for name in ['core','imgproc','video']]+[external/'cv']
files=[obj,external/'cv/lib/libopencv_video.a',external/'cv/lib/libopencv_imgproc.a',external/'cv/lib/libopencv_core.a',external/'cv/3rdparty/lib/libzlib.a']
exports=['malloc','free','stereo_stream_search','stereo_stream_sums','stereo_stream_create','stereo_stream_input','stereo_stream_flow','stereo_stream_output','stereo_stream_normalize','stereo_stream_floating','stereo_stream_release','cv_stereo_timings']
main=build/'stereo-stream-main.o'
subprocess.run([str(compiler),str(root/'native/stereo-stream-gpu.cpp'),*[arg for inc in includes for arg in ['-I',str(inc)]],'-std=c++17','-O3','-fexceptions','-ffp-contract=off','-c','-o',str(main)],check=True)
subprocess.run([str(compiler),str(main),*map(str,files),'-msimd128','-std=c++17','-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=262144','-sSTACK_SIZE=1048576','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=2147483648','-sMEMORY_GROWTH_LINEAR_STEP=4194304','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+name for name in exports]),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['ccall','HEAPU8','HEAPF32','HEAPF64']),'-o',str(out/'stereo-resident-gpu.js')],check=True)

shutil.copyfile(root/'vendor/stereo-resident-source/LICENSE',out/'LICENSE')
(out/'PINNED.json').write_text(json.dumps({**expected,"artifacts":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [out/'stereo-resident-gpu.js',out/'stereo-resident-gpu.wasm']}},indent=2)+'\n')
