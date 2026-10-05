"""Bounded native hash source sampling; shared SDK/library inputs are read only."""
import hashlib,json,os,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BUILD=Path(os.environ['OPENCV_BUILD_ROOT']);CC=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';OUT=ROOT/'vendor/digest-stream';OUT.mkdir(parents=True,exist_ok=True);WORK=ROOT/'.build/m5/digest-stream';WORK.mkdir(parents=True,exist_ok=True)
env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'};version=subprocess.check_output([str(CC),'--version'],env=env,text=True).splitlines()[0];assert '4.0.15' in version
CONTRIB=BUILD/'opencv_contrib-4.11.0/modules/img_hash';radial=(CONTRIB/'src/radial_variance_hash.cpp').read_text();original=radial
replacements=[('projDown[x] = input.at<uchar>(yd+yOff, x);','captureProjection(yd+yOff,x,projDown+x);'),('projUp[x] =\n                            input.at<uchar>(-(x-yOff)+yOff, -yd+yOff);','captureProjection(-(x-yOff)+yOff,-yd+yOff,projUp+x);'),('projOne[x] = input.at<uchar>(yd+yOff, x);','captureProjection(yd+yOff,x,projOne+x);'),('projTwo[x] =\n                            input.at<uchar>(x, yd+xOff);','captureProjection(x,yd+xOff,projTwo+x);')]
for a,b in replacements:assert radial.count(a)==1;radial=radial.replace(a,b)
for name in ['afterHalfProjections','firstHalfProjections','radialProjections']:
 a=name+'(cv::Mat const &input';assert radial.count(a)==1;radial=radial.replace(a,name+'(ProjectionShape const &input')
assert 'input.at<uchar>' not in radial
# Native ARM contracts the two non-integer reduction products. Keep their
# single-rounding IEEE result in WASM; byte/integer sums are already exact.
for before,after in [('sumSqd += features_[k]*features_[k];','sumSqd = std::fma(features_[k],features_[k],sumSqd);'),('sum += features_[n]*std::cos((3.14159*(2*n+1)*k)/(2*featureSize));','sum = std::fma(features_[n],std::cos((3.14159*(2*n+1)*k)/(2*featureSize)),sum);')]:
 assert radial.count(before)==1;radial=radial.replace(before,after)
radial=radial.replace('float const alpha = std::tan(theta);','float const alpha = nativeRadialTangents[k];')
(WORK/'radial-variance-capture.cpp').write_text(radial)
moments=ROOT/'.build/digest-extra/moments.o';assert moments.exists(),'Build scripts/build-digest-extra.py once in this worktree first.'
libs=[moments,BUILD/'dft-reference.o',BUILD/'cv/lib/libopencv_imgproc.a',BUILD/'cv/lib/libopencv_core.a']
args=[str(CC),str(ROOT/'native/digest-stream.cpp'),*[str(CONTRIB/'src'/name)for name in ['average_hash.cpp','block_mean_hash.cpp','phash.cpp','img_hash_base.cpp']],*map(str,libs),'-I'+str(CONTRIB/'include'),'-I'+str(CONTRIB/'src'),'-I'+str(BUILD/'opencv-4.11.0/modules/core/include'),'-I'+str(BUILD/'opencv-4.11.0/modules/imgproc/include'),'-I'+str(BUILD/'opencv-4.11.0/modules/imgproc/src'),'-I'+str(BUILD/'cv'),'-I'+str(WORK),'-O3','-ffp-contract=off','-fexceptions','-ffile-prefix-map='+str(ROOT)+'/=','-ffile-prefix-map='+str(BUILD)+'/=','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=268435456','-sEXPORTED_FUNCTIONS=["_malloc","_free","_hash_stream_begin","_hash_stream_rows","_hash_stream_start","_hash_stream_count","_hash_stream_side","_hash_stream_feed","_hash_stream_finish","_hash_stream_close","_digest_data","_digest_size"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(OUT/'digest-stream.js')]
subprocess.run(args,env=env,check=True)
for name,source in [('LICENSE',ROOT/'vendor/opencv/LICENSE'),('CAROTENE-LICENSE.txt',ROOT/'vendor/digest-extra/CAROTENE-LICENSE.txt')]: (OUT/name).write_bytes(source.read_bytes())
sha=lambda b:hashlib.sha256(b).hexdigest()
(OUT/'PINNED.json').write_text(json.dumps(dict(opencv='4.11.0',compiler=version,originalRadialSha256=sha(original.encode()),capturedRadialSha256=sha(radial.encode()),changes='Four projection pixel reads become sample requests; input parameter becomes dimension-only shape. Native projection loops/counts preserved; fixed 180-angle Darwin libm tanf table and explicit IEEE FMA in two floating reductions match the native ARM reference.',sources={p.name:sha(p.read_bytes())for p in [ROOT/'native/digest-stream.cpp',ROOT/'native/digest-extra.cpp',ROOT/'native/sqrt-tables.h',ROOT/'native/radial-tables.h',*[CONTRIB/'src'/name for name in ['average_hash.cpp','block_mean_hash.cpp','phash.cpp','img_hash_base.cpp']],BUILD/'opencv-4.11.0/modules/imgproc/src/resize.cpp',BUILD/'opencv-4.11.0/modules/imgproc/src/fixedpoint.inl.hpp']},objects={p.name:sha(p.read_bytes())for p in libs},files={p.name:sha(p.read_bytes())for p in sorted(OUT.iterdir())if p.name!='PINNED.json'}),indent=2)+'\n')
print('Built digest stream',version)
