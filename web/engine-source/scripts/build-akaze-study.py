"""Build offline AKAZE candidates; never overwrite product runtime assets."""
from pathlib import Path
import argparse,hashlib,json,os,re,shlex,subprocess,sys
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--stage',choices=['angles','filters','separable','area'],default='area');args=parser.parse_args()
stage=['angles','filters','separable','area'].index(args.stage)
compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
assert '4.0.15' in subprocess.check_output([str(compiler),'--version'],text=True).splitlines()[0]
subprocess.run([sys.executable,str(root/'scripts/build-cloning-study.py'),'--native-orb'],check=True)
base=root/'.build/cv/modules/features2d';flags=(base/'CMakeFiles/opencv_features2d.dir/flags.make').read_text();options=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:options+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
options=['-ffp-contract=on' if x=='-ffp-contract=off' else x for x in options]
command=[str(compiler),str(root/'experiments/cloning/features.cpp'),str(root/'.build/cloning-orb-reference.o')]
helpers=['angles']+(['filters'] if stage>=1 else [])+(['separable'] if stage>=2 else [])+(['area'] if stage>=3 else [])
command += [str(root/f'experiments/cloning/akaze-{name}.cpp') for name in helpers]
records=[]
for name,expected in [('AKAZEFeatures',79),('nldiffusion_functions',13),('fed',8)]:
    source=root/f'.build/opencv-4.11.0/modules/features2d/src/kaze/{name}.cpp';text=source.read_text()
    if name=='AKAZEFeatures':
        declarations=['void cloningAKAZEAngles(const float*,const float*,float*,int);']
        replacements=[('hal::fastAtan2(resY, resX, Ang, ang_size, false);','cloningAKAZEAngles(resY,resX,Ang,ang_size);'),('kpt.angle = fastAtan2(maxY, maxX);','kpt.angle = cloningNativeAngle(maxY,maxX);')]
        if stage>=1:
            declarations+=['void cloningAKAZEGaussian(cv::InputArray,cv::OutputArray,cv::Size,double,double,int);','void cloningAKAZEScharr(cv::InputArray,cv::OutputArray,int,int,int,double,double,int);']
            replacements += [('GaussianBlur(','cloningAKAZEGaussian('),('Scharr(','cloningAKAZEScharr(')]
        if stage>=2:
            declarations+=['void cloningAKAZESep(cv::InputArray,cv::OutputArray,int,cv::InputArray,cv::InputArray);']
            replacements += [('sepFilter2D(','cloningAKAZESep(')]
        if stage>=3:
            declarations+=['void cloningAKAZEResize(cv::InputArray,cv::OutputArray,cv::Size,double,double,int);']
            replacements += [('resize(evolution[i - 1].Lt,','cloningAKAZEResize(evolution[i - 1].Lt,')]
        for before,after in replacements:
            assert text.count(before)>0,before
            text=text.replace(before,after)
        text=text.replace('#include <iostream>','#include <iostream>\n'+(root/'experiments/cloning/angle.inc').read_text()+'\n'+'\n'.join(declarations))
    generated=root/f'.build/akaze-{args.stage}-{name}.cpp';generated.write_text(text)
    llvm=generated.with_suffix('.ll');obj=generated.with_suffix('.o')
    subprocess.run([str(compiler),*options,'-I',str(source.parent),'-S','-emit-llvm',str(generated),'-o',str(llvm)],cwd=base,check=True)
    ir=llvm.read_text();count=ir.count('@llvm.fmuladd.');assert count==expected,(name,count,expected)
    llvm.write_text(ir.replace('@llvm.fmuladd.','@llvm.fma.'))
    subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(obj)],check=True);command.append(str(obj))
    records.append(dict(source=source.relative_to(root).as_posix(),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),explicitContractions=count-1,intrinsicSymbolReferences=count))
for name in ['features2d','flann','imgproc','core']:command+=[str(root/f'.build/cv/lib/libopencv_{name}.a'),'-I',str(root/f'.build/opencv-4.11.0/modules/{name}/include')]
command += [str(root/'.build/cv/3rdparty/lib/libzlib.a'),'-I',str(root/'.build/cv'),'-I',str(root/'.build'),'-O3','-fexceptions','-ffp-contract=off','-ffile-prefix-map='+str(root)+'/=',
 '-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=1073741824','-sFILESYSTEM=0',
 '-sEXPORTED_FUNCTIONS=["_malloc","_free","_features_detect","_features_points","_features_descriptors","_features_descriptor_size","_features_select","_features_match","_features_match_direct","_features_matches","_features_render","_features_output","_features_count","_features_compactness","_features_norm","_features_heap_fallbacks","_features_release"]',
 '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(root/f'.build/cloning-features-akaze-{args.stage}.mjs')]
subprocess.run(command,check=True)
(root/f'.build/akaze-{args.stage}-build.json').write_text(json.dumps(dict(schema=1,scope='offline study only',stage=args.stage,sources=records),indent=2)+'\n')
print(json.dumps(records))
