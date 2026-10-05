"""Freeze small DCT-II plan seeds from the same reference as SciPy."""
from pathlib import Path
import subprocess,platform,hashlib,json
ROOT=Path(__file__).resolve().parents[1];build=ROOT/'.build';vendor=ROOT/'vendor/pocketfft'
assert platform.system()=='Darwin' and platform.machine()=='arm64'
source=(vendor/'pocketfft_hdronly.h').read_text()
expected=json.loads((vendor/'PINNED.json').read_text())['files'][0]['sha256']
assert hashlib.sha256(source.encode()).hexdigest()==expected
source=source.replace('template<typename T> class sincos_2pibyn\n  {\n  private:','template<typename T> class sincos_2pibyn\n  {\n  public:',1)
(build/'noisesniffer-twiddles-generator.h').write_text(source)
(build/'noisesniffer-twiddles-generator.cpp').write_text(r'''
#define POCKETFFT_NO_MULTITHREADING
#include "noisesniffer-twiddles-generator.h"
#include <iostream>
#include <iomanip>
int main(){
 static_assert(sizeof(long double)==8,"Native binary64 long double required");
 std::cout << "// Generated image-independent SciPy pocketfft DCT seeds.\n";
 std::cout << "#include <stdexcept>\nstatic const double* noisesnifferSeeds(size_t n,size_t first,size_t second){\nswitch(n){\n";
 for(size_t n:{3,5,7,8,12,20,28,32}){
  pocketfft::detail::sincos_2pibyn<double> t(n);
  std::cout << "case " << n << ":{static const double data[]={" << std::hexfloat;
  for(auto* v:{&t.v1,&t.v2})for(size_t j=0;j<v->size();j++)std::cout << (*v)[j].r << ',' << (*v)[j].i << ',';
  std::cout << "};if(first!=" << t.v1.size() << "||second!=" << t.v2.size() << ")break;return data;}\n";
 }
 std::cout << "}throw std::runtime_error(\"Unqualified Noisesniffer DCT length\");}\n";
}
''')
sdk=subprocess.check_output(['xcrun','--sdk','macosx','--show-sdk-path'],text=True).strip()
subprocess.run(['clang++','-std=c++17','-O3','-ffp-contract=on','-isysroot',sdk,str(build/'noisesniffer-twiddles-generator.cpp'),'-o',str(build/'noisesniffer-twiddles-generator')],check=True)
data=subprocess.check_output([str(build/'noisesniffer-twiddles-generator')]);(ROOT/'native/noisesniffer-twiddles.h').write_bytes(data)
(vendor/'NOISESNIFFER-TWIDDLES.json').write_text(json.dumps(dict(schema=1,source='SciPy 1.17.1 pocketfft native binary64 sin/cos',headerSha256=expected,file='native/noisesniffer-twiddles.h',sha256=hashlib.sha256(data).hexdigest(),lengths=[3,5,7,8,12,20,28,32],generator='scripts/generate-noisesniffer-twiddles.py'),indent=2)+'\n')
