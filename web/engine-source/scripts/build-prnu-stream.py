from pathlib import Path
import os,subprocess,hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
# This verifies vendored inputs and prepares the exact qualified pocketfft/FMA
# headers and objects exclusively in this checkout's .build directory.
subprocess.run(['python3',str(root/'scripts/build-prnu-fft.py')],check=True)
compiler=str(Path(os.environ['EMSDK'])/'upstream/emscripten/em++');out=root/'vendor/prnu-stream';out.mkdir(exist_ok=True)
llvm=root/'.build/prnu-stream.ll';obj=root/'.build/prnu-stream.o'
subprocess.run([compiler,'-O3','-msimd128','-fexceptions','-ffp-contract=on','-ffile-prefix-map='+str(root)+'/=','-S','-emit-llvm',str(root/'native/prnu-stream.cpp'),'-o',str(llvm)],check=True)
text=llvm.read_text().replace('@llvm.fmuladd.','@llvm.fma.');seen=set();lines=[]
for line in text.splitlines():
 if line.startswith('declare ') and '@llvm.fma.' in line:
  if line in seen:continue
  seen.add(line)
 lines.append(line)
llvm.write_text(('\n'.join(lines)+'\n').replace('@llvm.fma.f64','@sherloq_prnu_fma64').replace('@llvm.fma.v2f64','@sherloq_prnu_fma2'))
subprocess.run([compiler,'-O3','-msimd128','-c',str(llvm),'-o',str(obj)],check=True)
exports=['malloc','free','cv_prnu_twiddles','cv_prnu_fma_mode','prnu_stream_axis','prnu_stream_multiply','prnu_stream_full','prnu_stream_data','prnu_stream_size','prnu_stream_release']
subprocess.run([compiler,str(obj),str(root/'.build/prnu-fma.o'),'-O3','-msimd128','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=134217728','-sMEMORY_GROWTH_LINEAR_STEP=4194304','-sABORTING_MALLOC=0','-sFILESYSTEM=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+x for x in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF64"]','-o',str(out/'prnu-stream.js')],check=True)
shutil.copyfile(root/'vendor/pocketfft/LICENSE.md',out/'LICENSE.md');(out/'PINNED.json').write_text(json.dumps(dict(emscripten='4.0.15',pocketfft=json.loads((root/'vendor/pocketfft/PINNED.json').read_text()),twiddles=json.loads((root/'vendor/pocketfft/PRNU-TWIDDLES.json').read_text())),indent=2)+'\n')
