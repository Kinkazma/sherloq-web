"""Compile OpenCV DFT expression contractions as explicit portable IEEE FMA.

Clang emits llvm.fmuladd with -ffp-contract=on. Standard WebAssembly has no
fused opcode; llvm.fma requests the correctly rounded software operation instead
of silently dropping that native contraction. No reassociation or fast-math.
"""
from pathlib import Path
import os,re,shlex,subprocess
ROOT=Path(__file__).resolve().parents[1];core=ROOT/'.build/cv/modules/core';flags=(core/'CMakeFiles/opencv_core.dir/flags.make').read_text();compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++'
args=[]
for key in ['CXX_DEFINES','CXX_INCLUDES','CXX_FLAGS']:
 args+=shlex.split(re.search('^'+key+r' = (.*)$',flags,re.M)[1])
args=['-ffp-contract=on' if x=='-ffp-contract=off' else x for x in args]
llvm=ROOT/'.build/dft-reference.ll';subprocess.run([str(compiler),*args,'-S','-emit-llvm',str(ROOT/'.build/opencv-4.11.0/modules/core/src/dxt.cpp'),'-o',str(llvm)],cwd=core,check=True)
s=llvm.read_text();count=s.count('@llvm.fmuladd.');assert count>0;s=s.replace('@llvm.fmuladd.','@llvm.fma.');llvm.write_text(s)
subprocess.run([str(compiler),'-O3','-c',str(llvm),'-o',str(ROOT/'.build/dft-reference.o')],cwd=core,check=True);print(count,'DFT contraction references made explicit')
