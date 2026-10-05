"""Reproduce the distributable OpenCV BRISK/FMA/area path in this worktree.
Uses the portable libm angle; no APSL polynomial or derived object is included.
"""
from pathlib import Path
import os,subprocess,re,shlex,hashlib,json
root=Path(__file__).resolve().parents[1];build=Path(os.environ['OPENCV_BUILD_ROOT']).resolve();compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'.build/m3';out.mkdir(exist_ok=True,parents=True)
source=build/'opencv-4.11.0/modules/features2d/src/brisk.cpp';original=source.read_text();old='resize(srcimg, dstimg, dstimg.size(), 0, 0, INTER_AREA);';assert original.count(old)==2
code=original.replace('namespace cv\n{','namespace cv\n{\nvoid cloningBriskArea(const Mat&,Mat&);\nstatic int m3BriskLimit=0,m3BriskTotal=0;\nstatic bool m3BriskPointsOnly=false;\nextern \"C\" void m3_brisk_set_points_only(int value){m3BriskPointsOnly=value!=0;}\nextern \"C\" void m3_brisk_set_limit(int value){m3BriskLimit=value;}\nextern \"C\" int m3_brisk_total(){return m3BriskTotal;}',1).replace(old,'cloningBriskArea(srcimg, dstimg);');# Erasing every rejected border point shifts all later points quadratically.
# Stable compaction applies exactly the same scale and boundary predicates.
a=code.index('  std::vector<cv::KeyPoint>::iterator beginning = keypoints.begin();');b=code.index('  // first, calculate the integral image',a)
part=code[a:b];part=part.replace('  std::vector<cv::KeyPoint>::iterator beginning = keypoints.begin();\n  std::vector<int>::iterator beginningkscales = kscales.begin();','  size_t kept=0;').replace('      kscales[k] = scale;','')
start=part.index('    if (RoiPredicate(');end=part.index('\n  }',start)
part=part[:start]+"    if (RoiPredicate((float)border, (float)border, (float)border_x, (float)border_y, keypoints[k]))continue;\n    keypoints[kept]=keypoints[k];kscales[kept++]=scale;"+part[end:]
part+='  keypoints.resize(kept);kscales.resize(kept);ksize=kept;\n\n';code=code[:a]+part+code[b:]
# CM2 ranks all valid points before descriptor computation; historical BRISK
# leaves this limit zero and keeps the complete population in native order.
selection="""  m3BriskTotal=int(ksize);
  if(m3BriskLimit>0&&ksize>size_t(m3BriskLimit)){
    std::vector<int> ids(ksize);for(size_t i=0;i<ksize;i++)ids[i]=int(i);
    std::partial_sort(ids.begin(),ids.begin()+m3BriskLimit,ids.end(),[&](int a,int b){return keypoints[a].response!=keypoints[b].response?keypoints[a].response>keypoints[b].response:a<b;});
    std::vector<cv::KeyPoint> chosen;std::vector<int> scales;chosen.reserve(m3BriskLimit);scales.reserve(m3BriskLimit);
    for(int i=0;i<m3BriskLimit;i++){chosen.push_back(keypoints[ids[i]]);scales.push_back(kscales[ids[i]]);}keypoints.swap(chosen);kscales.swap(scales);ksize=keypoints.size();
  }
"""
selection+='  if(m3BriskPointsOnly){_descriptors.release();return;}\n'
code=code.replace('  // first, calculate the integral image',selection+'  // first, calculate the integral image',1)
generated=out/'brisk-native.cpp';generated.write_text(code)
flags=(build/'cv/modules/features2d/CMakeFiles/opencv_features2d.dir/flags.make').read_text();options=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:options+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
options=['-ffp-contract=on' if x=='-ffp-contract=off' else x for x in options];llvm=out/'brisk-native.ll'
subprocess.run([str(compiler),*options,'-I',str(source.parent),'-S','-emit-llvm',str(generated),'-o',str(llvm)],cwd=build/'cv/modules/features2d',check=True);ir=llvm.read_text();count=ir.count('@llvm.fmuladd.');assert count>0;llvm.write_text(ir.replace('@llvm.fmuladd.','@llvm.fma.'));obj=out/'brisk-native.o';subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(obj)],check=True)
(out/'brisk-native-pin.json').write_text(json.dumps(dict(opencv='4.11.0',sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),objectSha256=hashlib.sha256(obj.read_bytes()).hexdigest(),fmaReferences=count,borderSelection='stable linear compaction, original scale/border predicates; optional CM2 stable ranking before descriptors',angle='portable libm atan2f; known native boundary differences'),indent=2)+'\n')
