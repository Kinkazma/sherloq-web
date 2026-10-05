"""Portable SciPy 1.17.1 pocketfft with the pinned native arithmetic width."""
from pathlib import Path
import hashlib,json,os,re,subprocess
ROOT=Path(__file__).resolve().parents[1]
vendor=ROOT/'vendor/pocketfft'
for record in json.loads((vendor/'PINNED.json').read_text())['files']:
 assert hashlib.sha256((vendor/record['file']).read_bytes()).hexdigest()==record['sha256']
seeds=json.loads((vendor/'PRNU-TWIDDLES.json').read_text())
data=(vendor/seeds['file']).read_bytes()
assert len(data)==seeds['bytes'] and hashlib.sha256(data).hexdigest()==seeds['sha256']
source=(vendor/'pocketfft_hdronly.h').read_text()
# Native reference long double is binary64. The unchanged upstream copy and
# license remain under vendor; adaptations affect only this generated header.
source=source.replace('(defined(__ARM_NEON__) || defined(__ARM_NEON))','(defined(__ARM_NEON__) || defined(__ARM_NEON) || defined(__wasm_simd128__))')
source=source.replace('3.141592653589793238462643383279502884197L','3.141592653589793238462643383279502884197').replace('Thigh(0.25L*pi/n)','Thigh(0.25*pi/n)')
needle='''      v1.resize(mask+1);
      v1[0].Set'''
assert source.count(needle)==1
source=source.replace(needle,'''      v1.resize(mask+1);
#ifdef __wasm__
      v2.resize((nval+mask)/(mask+1));
      const double* seeds=sherloq_prnu_twiddle_seeds(n,v1.size(),v2.size());
      for(size_t i=0;i<v1.size();i++)v1[i].Set(seeds[2*i],seeds[2*i+1]);
      seeds+=2*v1.size();
      for(size_t i=0;i<v2.size();i++)v2[i].Set(seeds[2*i],seeds[2*i+1]);
      return;
#endif
      v1[0].Set''')
(ROOT/'.build/prnu-pocketfft.h').write_text(source)
compiler=str(Path(os.environ['EMSDK'])/'upstream/emscripten/em++');llvm=ROOT/'.build/prnu-fft.ll'
subprocess.run([compiler,'-O3','-msimd128','-fexceptions','-ffp-contract=on','-ffile-prefix-map='+str(ROOT)+'/=','-S','-emit-llvm',str(ROOT/'native/prnu-fft.cpp'),'-o',str(llvm)],check=True)
text=llvm.read_text();count=text.count('@llvm.fmuladd.');text=text.replace('@llvm.fmuladd.','@llvm.fma.')
# llvm.fma and newly promoted llvm.fmuladd may declare the same intrinsic.
seen=set();lines=[]
for line in text.splitlines():
 if line.startswith('declare ') and '@llvm.fma.' in line:
  if line in seen:continue
  seen.add(line)
 lines.append(line)
llvm.write_text('\n'.join(lines)+'\n')
text=llvm.read_text().replace('@llvm.fma.f64','@sherloq_prnu_fma64').replace('@llvm.fma.v2f64','@sherloq_prnu_fma2')
llvm.write_text(text)
subprocess.run([compiler,'-O3','-msimd128','-c',str(llvm),'-o',str(ROOT/'.build/prnu-fft.o')],check=True)
subprocess.run([compiler,'-O3','-msimd128','-ffp-contract=off','-ffile-prefix-map='+str(ROOT)+'/=','-c',str(ROOT/'native/prnu-fma.cpp'),'-o',str(ROOT/'.build/prnu-fma.o')],check=True)
print(count,'pocketfft FMA contractions preserved')
