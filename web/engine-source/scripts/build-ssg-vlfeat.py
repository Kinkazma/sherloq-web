"""Rebuild the pinned VLFeat component; never substitute a complete SSG detector."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / 'vendor/ssg-vlfeat'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=VENDOR)
parser.add_argument('--build', type=Path, default=ROOT / '.build/ssg-vlfeat')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
args.build.mkdir(parents=True, exist_ok=True)
manifest = json.loads((VENDOR / 'BUILD.json').read_text())
archive = VENDOR / manifest['archive']['file']
assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifest['archive']['sha256']
source = args.build / 'source'
source.mkdir(exist_ok=True)
with tarfile.open(archive) as tar:
    members = {entry.name:entry for entry in tar.getmembers()}
    for identity in manifest['sourceFiles']:
        name = identity['path']
        assert not Path(name).is_absolute() and '..' not in Path(name).parts
        data = tar.extractfile(members[name]).read()
        assert len(data) == identity['bytes'] and hashlib.sha256(data).hexdigest() == identity['sha256']
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

# Platform scaffolding only. Preserve the official 0.9.18 numerical kernels.
generic = (source / 'vl/generic.c').read_text()
marker = '(defined(VL_OS_LINUX) || defined(VL_OS_MACOSX)) && defined(VL_COMPILER_GNUC)'
assert generic.count(marker) == 1
generic = generic.replace(marker, '(defined(VL_OS_LINUX) || defined(VL_OS_MACOSX) || defined(__EMSCRIPTEN__)) && defined(VL_COMPILER_GNUC)')
(args.build / 'generic-wasm.c').write_text(generic)
host = (source / 'vl/host.c').read_text()
begin = host.index('  vl_int32 info [4] ;', host.index('_vl_x86cpu_info_init ('))
end = host.index('\n}\n', begin)
host = host[:begin] + '#if defined(HAS_CPUID)\n' + host[begin:end] + '\n#else\n  memset(self,0,sizeof(*self));\n#endif' + host[end:]
host = host.replace('#include <stdio.h>', '#include <stdio.h>\n#include <string.h>')
(args.build / 'host-portable.c').write_text(host)
emcc = Path(os.environ['EMSDK']) / 'upstream/emscripten/emcc'
assert '4.0.15' in subprocess.check_output([str(emcc), '--version'], text=True).splitlines()[0]
flags = ['-O3','-std=c99','-ffp-contract=off','-DVL_DISABLE_THREADS','-DVL_DISABLE_SSE2','-DVL_DISABLE_AVX','-I'+str(source),'-I'+str(source / 'vl')]
objects = []
for name in ['host','generic','sift','random','imopv','imopv_sse2']:
    path = args.build / 'host-portable.c' if name == 'host' else args.build / 'generic-wasm.c' if name == 'generic' else source / ('vl/'+name+'.c')
    output = args.build / (name+'.o')
    subprocess.run([str(emcc),*flags,'-c',str(path),'-o',str(output)], check=True)
    objects.append(str(output))
wrapper = VENDOR / 'wrapper.c'
assert hashlib.sha256(wrapper.read_bytes()).hexdigest() == manifest['runtimeFiles']['wrapper.c']['sha256']
subprocess.run([str(emcc),*flags,str(wrapper),*objects,'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=node,web,worker',
    '-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648',
    '-sSTACK_SIZE=1048576','-sABORTING_MALLOC=0',
    '-sEXPORTED_FUNCTIONS=["_malloc","_free","_ssg_vlfeat_detect","_ssg_vlfeat_output","_ssg_vlfeat_release","_ssg_vlfeat_allocation_bytes"]',
    '-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAPF64"]','-o',str(args.output / 'vlfeat.mjs')], check=True)
glue = args.output / 'vlfeat.mjs'
text = glue.read_text()
marker = 'var getHeapMax=()=>2147483648;'
assert text.count(marker) == 1, 'Unreviewed Emscripten heap-growth helper'
# Limit speculative overgrowth to the arena already admitted by the caller.
# The imported WebAssembly.Memory enforces the same cap physically. Arithmetic
# code and native WASM bytes are unchanged by this JavaScript transport edit.
glue.write_text(text.replace(marker, 'var getHeapMax=()=>Module["maximumHeapBytes"]??2147483648;'))
for name in ('vlfeat.wasm','vlfeat.mjs'):
    path=args.output / name
    print(json.dumps({'file':str(path),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}))
