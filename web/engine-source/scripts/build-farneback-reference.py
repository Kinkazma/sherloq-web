"""Preserve native scalar expression contractions in the portable Farneback CPU path."""
from pathlib import Path
import os,re,shlex,subprocess
ROOT=Path(__file__).resolve().parents[1];core=ROOT/'.build/cv/modules/video';flags=(core/'CMakeFiles/opencv_video.dir/flags.make').read_text();compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
args=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:args+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
args=['-ffp-contract=on' if x=='-ffp-contract=off' else x for x in args]
source=ROOT/'.build/opencv-4.11.0/modules/video/src/optflowgf.cpp'
generated=ROOT/'.build/optflowgf-reference.cpp'
s=source.read_text();old='GaussianBlur(fimg, fimg, Size(smooth_sz, smooth_sz), sigma, sigma);';assert s.count(old)==1
s=s.replace(old,'sherloqStereoGaussian(fimg, fimg, Size(smooth_sz, smooth_sz), sigma, sigma);')
for old,new in [('resize( prevFlow, flow, Size(width, height), 0, 0, INTER_LINEAR );','sherloqStereoResize(prevFlow, flow, Size(width, height));'),('resize( fimg, I, Size(width, height), INTER_LINEAR );','sherloqStereoResize(fimg, I, Size(width, height));')]:
 assert s.count(old)==1;s=s.replace(old,new)
s,n=re.subn(r'namespace cv\s*\{','namespace cv {\nvoid sherloqStereoGaussian(const Mat&, Mat&, Size, double, double);\nvoid sherloqStereoResize(const Mat&, Mat&, Size);',s,count=1);assert n==1
s=s.replace('#include "precomp.hpp"','#include "precomp.hpp"\nextern "C" double sherloq_stereo_clock();\nextern "C" void sherloq_stereo_record(int,double);')
for stage,expression in enumerate(['sherloqStereoGaussian(fimg, fimg, Size(smooth_sz, smooth_sz), sigma, sigma);','sherloqStereoResize(fimg, I, Size(width, height));','FarnebackPolyExp( I, R[i], polyN_, polySigma_ );','FarnebackUpdateMatrices( R[0], R[1], flow, M, 0, flow.rows );','FarnebackUpdateFlow_GaussianBlur( R[0], R[1], flow, M, winSize_, i < numIters_ - 1 );']):
 assert s.count(expression)==1;s=s.replace(expression,'{double stageStart=sherloq_stereo_clock(); '+expression+' sherloq_stereo_record('+str(stage)+',sherloq_stereo_clock()-stageStart);}')
expression='sherloqStereoResize(prevFlow, flow, Size(width, height));';assert s.count(expression)==1;s=s.replace(expression,'{double stageStart=sherloq_stereo_clock(); '+expression+' sherloq_stereo_record(1,sherloq_stereo_clock()-stageStart);}')
generated.write_text(s)
llvm=ROOT/'.build/farneback-reference.ll';subprocess.run([str(compiler),*args,'-I',str(source.parent),'-S','-emit-llvm',str(generated),'-o',str(llvm)],cwd=core,check=True)
s=llvm.read_text();count=s.count('@llvm.fmuladd.');assert count>0;s=s.replace('@llvm.fmuladd.','@llvm.fma.')
s=s.replace('@llvm.fma.f32','@sherloq_stereo_fma')
s,n=re.subn(r'declare float @sherloq_stereo_fma\(float, float, float\) #\d+','declare float @sherloq_stereo_fma(float, float, float)',s);assert n==1
s=s.replace('@llvm.fma.f64','@sherloq_stereo_fma64')
s,n=re.subn(r'declare double @sherloq_stereo_fma64\(double, double, double\) #\d+','declare double @sherloq_stereo_fma64(double, double, double)',s);assert n==1
llvm.write_text(s)
subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(ROOT/'.build/farneback-reference.o')],cwd=core,check=True);print(count,'Farneback contraction references made explicit')
