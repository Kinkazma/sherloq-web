"""Offline native SIFT arithmetic investigation; never modifies shared sources."""
from pathlib import Path
import os,re,shlex,subprocess,json,hashlib
root=Path(__file__).resolve().parents[1];build=Path(os.environ['OPENCV_BUILD_ROOT']).resolve();out=root/'.build/m3';out.mkdir(parents=True,exist_ok=True)
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
source=build/'opencv-4.11.0/modules/features2d/src'
for name,expected in [('sift.dispatch.cpp','c92b6016fcbdf8a5451bfdc4382a906263b058080880218f7ee28b89f7d1ffd6'),('sift.simd.hpp','07f5084ef8ef0776652aca0ffe2218447560e5bf6ebf73700fc721637675ae08')]:
 assert hashlib.sha256((source/name).read_bytes()).hexdigest()==expected,name
flags=(build/'cv/modules/features2d/CMakeFiles/opencv_features2d.dir/flags.make').read_text();options=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:options+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
options=['-ffp-contract=on' if x=='-ffp-contract=off' else x for x in options]
text=(source/'sift.dispatch.cpp').read_text()
helper=(root/'experiments/cloning/akaze-angles.cpp').read_text().replace('cloningAKAZEAngles','siftNativeAngles').replace('int count){','int count,bool degrees){').replace('angles[i]=a*scale','angles[i]=degrees?a:a*scale')
helper+='\nvoid siftNativeMagnitude(const float* x,const float* y,float* dst,int n){for(int i=0;i<n;i++)dst[i]=std::sqrt(std::fma(x[i],x[i],y[i]*y[i]));}\n'
helper+=(root/'experiments/m3/sift-gaussian.cpp').read_text()
helper+=(root/'experiments/m3/sift-exp.cpp').read_text()
text=text.replace('GaussianBlur(', '::siftNativeGaussian(')
text=text.replace('#include "sift.simd.hpp"',helper+'\n#include "sift.simd.hpp"')
(out/'sift.dispatch.cpp').write_text(text)
simd=(source/'sift.simd.hpp').read_text().replace('cv::hal::fastAtan2(', '::siftNativeAngles(').replace('cv::hal::magnitude32f(', '::siftNativeMagnitude(').replace('cv::hal::exp32f(', '::siftNativeExp(')
simd=simd.replace('temphist[bin] += W[k]*Mag[k];', 'if(k<len/4*4){volatile float product=W[k]*Mag[k];temphist[bin]+=product;}else{temphist[bin] += W[k]*Mag[k];}')
before='hist[i] = (temphist[i-2] + temphist[i+2])*(1.f/16.f) +\n            (temphist[i-1] + temphist[i+1])*(4.f/16.f) +\n            temphist[i]*(6.f/16.f);'
after='hist[i] = std::fma(temphist[i-2] + temphist[i+2],1.f/16.f,std::fma(temphist[i-1] + temphist[i+1],4.f/16.f,temphist[i]*(6.f/16.f)));'
assert before in simd
simd=simd.replace(before,after)
(out/'sift.simd.hpp').write_text(simd)
llvm=out/'sift-native.ll';obj=out/'sift-native.o'
subprocess.run([str(compiler),*options,'-I',str(source),'-S','-emit-llvm',str(out/'sift.dispatch.cpp'),'-o',str(llvm)],cwd=build/'cv/modules/features2d',check=True)
ir=llvm.read_text();count=ir.count('@llvm.fmuladd.');ir=ir.replace('@llvm.fmuladd.','@llvm.fma.')
seen=set();lines=[]
for line in ir.splitlines():
 match=re.match(r'declare .* (@llvm\.fma\.[^(]+)',line)
 if match:
  if match[1] in seen:continue
  seen.add(match[1])
 lines.append(line)
llvm.write_text('\n'.join(lines)+'\n')
subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(obj)],check=True)
(out/'sift-arithmetic-build.json').write_text(json.dumps(dict(explicitFmaReferences=count,scope='unqualified extraction study'))+'\n');print(count,'SIFT FMA references')
