"""Build the pinned native DCT-II arithmetic with portable exact FMA wrappers."""
from pathlib import Path
import hashlib,json,os,subprocess
ROOT=Path(__file__).resolve().parents[1];vendor=ROOT/'vendor/pocketfft'
source=(vendor/'pocketfft_hdronly.h').read_text()
assert hashlib.sha256(source.encode()).hexdigest()==json.loads((vendor/'PINNED.json').read_text())['files'][0]['sha256']
meta=json.loads((vendor/'NOISESNIFFER-TWIDDLES.json').read_text())
assert hashlib.sha256((ROOT/meta['file']).read_bytes()).hexdigest()==meta['sha256']
source=source.replace('namespace pocketfft {','namespace noisesniffer_fft {')
source=source.replace('(defined(__ARM_NEON__) || defined(__ARM_NEON))','(defined(__ARM_NEON__) || defined(__ARM_NEON) || defined(__wasm_simd128__))')
source=source.replace('3.141592653589793238462643383279502884197L','3.141592653589793238462643383279502884197').replace('Thigh(0.25L*pi/n)','Thigh(0.25*pi/n)')
needle='''      v1.resize(mask+1);
      v1[0].Set'''
assert source.count(needle)==1
source=source.replace(needle,'''      v1.resize(mask+1);
      v2.resize((nval+mask)/(mask+1));
      const double* seeds=noisesnifferSeeds(n,v1.size(),v2.size());
      for(size_t i=0;i<v1.size();i++)v1[i].Set(seeds[2*i],seeds[2*i+1]);
      seeds+=2*v1.size();
      for(size_t i=0;i<v2.size();i++)v2[i].Set(seeds[2*i],seeds[2*i+1]);
      return;
      v1[0].Set''')
(ROOT/'.build/noisesniffer-pocketfft.h').write_text(source)
compiler=str(Path(os.environ['EMSDK'])/'upstream/emscripten/em++');llvm=ROOT/'.build/noisesniffer-dct.ll'
subprocess.run([compiler,'-O3','-msimd128','-fexceptions','-ffp-contract=on','-ffile-prefix-map='+str(ROOT)+'/=','-S','-emit-llvm',str(ROOT/'native/noisesniffer-dct.cpp'),'-o',str(llvm)],check=True)
text=llvm.read_text().replace('@llvm.fmuladd.','@llvm.fma.');seen=set();lines=[]
for line in text.splitlines():
 if line.startswith('declare ') and '@llvm.fma.' in line:
  if line in seen:continue
  seen.add(line)
 lines.append(line)
text='\n'.join(lines)+'\n';text=text.replace('@llvm.fma.f64','@sherloq_prnu_fma64').replace('@llvm.fma.v2f64','@sherloq_prnu_fma2');llvm.write_text(text)
subprocess.run([compiler,'-O3','-msimd128','-c',str(llvm),'-o',str(ROOT/'.build/noisesniffer-dct.o')],check=True)
