"""Preserve the native helper's scalar FMA contractions in WASM."""
from pathlib import Path
import os,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
compiler=str(Path(os.environ['EMSDK'])/'upstream/emscripten/em++')
llvm=ROOT/'.build/butteraugli-reference.ll'
source=(ROOT/'vendor/comparison/butteraugli/butteraugli.cc').read_text()
source=source.replace('#include "butteraugli.h"','#include "../vendor/comparison/butteraugli/butteraugli.h"')
for begin,end,left,right in [('minx','maxx + 1','row_in[j]','kernel[j - x + offset]'),('0','len','row_in[d + j]','scaled_kernel[j]')]:
 old='for (int j = '+begin+'; j '+('<= maxx' if begin=='minx' else '< len')+'; ++j) {\n'+('      ' if begin=='minx' else '        ')+'sum += '+left+' * '+right+';\n'+('    ' if begin=='minx' else '      ')+'}'
 assert source.count(old)==1
 new='{\n#pragma clang fp contract(off)\n int j='+begin+';const int stop='+begin+'+(('+end+'-'+begin+')/4)*4;\n for(;j<stop;j++)sum += '+left+' * '+right+';\n for(;j<'+end+';j++)sum=std::fma('+left+','+right+',sum);\n}'
 source=source.replace(old,new)
generated=ROOT/'.build/butteraugli-reference.cpp';generated.write_text(source)
subprocess.run([compiler,'-O3','-msimd128','-fexceptions','-ffp-contract=on','-ffile-prefix-map='+str(ROOT)+'/=','-S','-emit-llvm',str(generated),'-o',str(llvm)],check=True)
s=llvm.read_text();count=s.count('@llvm.fmuladd.');assert count>0
s=re.sub(r'@llvm.fmuladd.(v\d+f\d+)',r'@llvm.fma.\1',s)
for suffix,ret,fn in [('f32','float','sherloq_stereo_fma'),('f64','double','sherloq_stereo_fma64')]:
 s=s.replace('@llvm.fmuladd.'+suffix,'@'+fn).replace('@llvm.fma.'+suffix,'@'+fn)
 # Explicit std::fma in the scalar convolution tail shares this declaration.
 lines=s.splitlines(); seen=set(); s='\n'.join(line for line in lines if not (line.startswith('declare '+ret+' @'+fn) and (line in seen or seen.add(line))))+'\n'
 s,n=re.subn(r'declare '+ret+' @'+fn+r'\('+ret+', '+ret+', '+ret+r'\) #\d+',r'declare '+ret+' @'+fn+'('+ret+', '+ret+', '+ret+')',s);assert n==1
llvm.write_text(s)
subprocess.run([compiler,'-O3','-msimd128','-c',str(llvm),'-o',str(ROOT/'.build/butteraugli-reference.o')],check=True)
print(count,'Butteraugli FMA contraction references preserved')
