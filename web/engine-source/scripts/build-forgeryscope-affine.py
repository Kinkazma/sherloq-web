"""Pin OpenCV's affine minimal solver to the native fused arithmetic order.

Only expression evaluation is made explicit; sampler, scoring, USAC/MAGSAC,
refinement, degeneracy test and all thresholds remain OpenCV 4.11.0.
Shared OpenCV sources/libraries remain read-only.
"""
from pathlib import Path
import argparse,os,subprocess,hashlib,json
p=argparse.ArgumentParser();p.add_argument('--opencv-build',type=Path,required=True);a=p.parse_args();root=Path(__file__).resolve().parents[1];shared=a.opencv_build.resolve();source=shared/'opencv-4.11.0/modules/calib3d/src/usac/homography_solver.cpp';out=root/'.build/forgeryscope';out.mkdir(exist_ok=True)
s=source.read_text();old='double denominator = x1*y2 - x2*y1 - x1*y3 + x3*y1 + x2*y3 - x3*y2;';assert s.count(old)==1
new='''// Native ARM/Clang contracts this polynomial in float32, then widens.
        const auto cross_sum = [](float p1,float p2,float p3,float q1,float q2,float q3) {
            float value = (-p2) * q1;
            value = std::fma(p1,q2,value);
            value = std::fma(-p1,q3,value);
            value = std::fma(p3,q1,value);
            value = std::fma(p2,q3,value);
            return std::fma(-p3,q2,value);
        };
        double denominator = cross_sum(x1,x2,x3,y1,y2,y3);'''
s=s.replace(old,new)
replacements={
 '(u1*y2 - u2*y1 - u1*y3 + u3*y1 + u2*y3 - u3*y2)':'cross_sum(u1,u2,u3,y1,y2,y3)',
 '(u1*x2 - u2*x1 - u1*x3 + u3*x1 + u2*x3 - u3*x2)':'cross_sum(u1,u2,u3,x1,x2,x3)',
 '(v1*y2 - v2*y1 - v1*y3 + v3*y1 + v2*y3 - v3*y2)':'cross_sum(v1,v2,v3,y1,y2,y3)',
 '(v1*x2 - v2*x1 - v1*x3 + v3*x1 + v2*x3 - v3*x2)':'cross_sum(v1,v2,v3,x1,x2,x3)',
 'u1 - a * x1 - b * y1':'std::fma(-b,double(y1),std::fma(-a,double(x1),double(u1)))',
 'v1 - d * x1 - e * y1':'std::fma(-e,double(y1),std::fma(-d,double(x1),double(v1)))'}
for old,new in replacements.items():assert s.count(old)==1;s=s.replace(old,new)
s=s.replace('#include "../precomp.hpp"','#include "precomp.hpp"\n#include <cmath>').replace('#include "../usac.hpp"','#include "usac.hpp"');patched=out/'homography_solver.cpp';patched.write_text(s)
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';obj=out/'affine-native.o'
subprocess.run([str(compiler),'-c',str(patched),'-o',str(obj),'@'+str(shared/'cv/modules/calib3d/CMakeFiles/opencv_calib3d.dir/includes_CXX.rsp'),'-I'+str(source.parent.parent),'-D__OPENCV_BUILD=1','-O3','-ffp-contract=off','-fexceptions','-std=c++11'],check=True,env={**os.environ,'EM_FROZEN_CACHE':'1'})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(out/'affine-build.json').write_text(json.dumps(dict(upstreamSha256=sha(source),patchedSha256=sha(patched),objectSha256=sha(obj)),indent=2)+'\n')
