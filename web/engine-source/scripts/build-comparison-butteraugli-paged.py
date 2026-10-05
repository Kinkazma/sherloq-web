from pathlib import Path
import os,re,subprocess,json,shutil
root=Path(__file__).resolve().parents[1];compiler=Path(os.environ['EMSDK'])/'upstream/emscripten/em++';out=root/'vendor/comparison-butteraugli-paged';out.mkdir(exist_ok=True);build=root/'.build/butteraugli-paged';build.mkdir(exist_ok=True)
subprocess.run(['python3',str(root/'scripts/adapt-butteraugli-paged.py')],cwd=root,check=True)
s=(root/'vendor/comparison/butteraugli/butteraugli_main.cc').read_text();(root/'.build/butteraugli-paged-heatmap.h').write_text(s[s.index('static void ScoreToRgb'):s.index('void CreateHeatMapImage')])
llvm=build/'kernel.ll';obj=build/'kernel.o';flags=['-std=c++17','-O3','-msimd128','-fexceptions','-ffile-prefix-map='+str(root)+'/=']
subprocess.run([str(compiler),*flags,'-ffp-contract=on','-S','-emit-llvm',str(root/'vendor/comparison-butteraugli-paged-source/butteraugli.cc'),'-o',str(llvm)],check=True)
s=llvm.read_text();s=re.sub(r'@llvm.fmuladd.(v\d+f\d+)',r'@llvm.fma.\1',s)
for suffix,ret,fn in [('f32','float','sherloq_stereo_fma'),('f64','double','sherloq_stereo_fma64')]:
 s=s.replace('@llvm.fmuladd.'+suffix,'@'+fn).replace('@llvm.fma.'+suffix,'@'+fn)
 seen=set();s='\n'.join(l for l in s.splitlines() if not(l.startswith('declare '+ret+' @'+fn) and (l in seen or seen.add(l))))+'\n'
 s=re.sub(r'declare '+ret+' @'+fn+r'\('+ret+', '+ret+', '+ret+r'\) #\d+',f'declare {ret} @{fn}({ret}, {ret}, {ret})',s)
llvm.write_text(s);subprocess.run([str(compiler),'-O3','-msimd128','-c',str(llvm),'-o',str(obj)],check=True)
subprocess.run([str(compiler),str(root/'native/comparison-butteraugli-paged.cpp'),str(obj),*flags,'-ffp-contract=off','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sASYNCIFY=1','-sASYNCIFY_STACK_SIZE=524288','-sSTACK_SIZE=1048576','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=8388608','-sMAXIMUM_MEMORY=1073741824','-sMEMORY_GROWTH_GEOMETRIC_STEP=0','-sMEMORY_GROWTH_LINEAR_STEP=1048576','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_malloc','_free','_comparison_butteraugli_paged','_comparison_butteraugli_score']),'-sEXPORTED_RUNTIME_METHODS='+json.dumps(['ccall','UTF8ToString','HEAPU8']),'-o',str(out/'comparison-butteraugli-paged.js')],check=True)
shutil.copyfile(root/'vendor/opencv/LICENSE',out/'LICENSE-APACHE.txt');(out/'NOTICES.txt').write_text('\n'.join((root/'vendor/comparison/butteraugli/butteraugli.cc').read_text().splitlines()[:16]))
