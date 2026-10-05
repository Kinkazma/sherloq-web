"""Build the arithmetic probe locally without changing SDK or global search paths."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
def query(*args):return subprocess.check_output(args,text=True).strip()
compiler=query('xcrun','--find','clang++');sdk=Path(query('xcrun','--show-sdk-path'));resource=query(compiler,'-print-resource-dir')
subprocess.run([compiler,'-nostdinc','-isystem',str(sdk/'usr/include/c++/v1'),'-isystem',resource+'/include','-isystem',str(sdk/'usr/include'),'-dynamiclib','-O2','-ffp-contract=off','-fno-builtin-pow',str(root/'experiments/resampling-em/portable.cpp'),'-o',str(root/'.build/em-portable.dylib')],check=True)
