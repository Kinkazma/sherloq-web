"""Build the pinned native dense bridge; write only inside this worktree.

EMSDK points to Emscripten 4.0.15. EM_CACHE must be a private writable cache.
The native snapshot remains unchanged. Build copies replace macOS dispatch and
optionally evaluate four independent Zernike pixels with exact Wasm SIMD.
Independent jobs belong to workers; reductions retain their native order.
"""
from pathlib import Path
import argparse, hashlib, json, os, shutil, subprocess, sys
ROOT = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--variant',choices=('all','scalar','simd'),default='all',help='Default builds SIMD with a scalar compatibility fallback.')
parser.add_argument('--output',type=Path,help='Destination directory for this build variant.')
parser.add_argument('--name',default='dense',help='Factory/binary basename for an individual variant.')
args=parser.parse_args()
SOURCE = ROOT / 'vendor/dense-source'
BUILD = ROOT / '.build' / ('dense-simd' if args.variant=='simd' else 'dense')
OUT = args.output or ROOT / 'vendor/dense'
if args.variant=='all':
    OUT.mkdir(parents=True,exist_ok=True)
    for variant,name in (('scalar','dense-scalar'),('simd','dense')):
        subprocess.run([sys.executable,__file__,'--variant',variant,'--output',str(OUT),'--name',name],check=True)
    (OUT/'dense.js').replace(OUT/'dense-simd.js')
    shutil.copyfile(ROOT/'native/dense-runtime.js',OUT/'dense.js')
    names=('dense.js','dense-simd.js','dense.wasm','dense-scalar.js','dense-scalar.wasm')
    manifest={'compiler':'emscripten-4.0.15','default':'simd','fallback':'scalar on compilation failure of the requested real module','floatingPoint':'strict; no relaxed SIMD; original reduction order and required FMA retained','files':{name:{'bytes':(OUT/name).stat().st_size,'sha256':hashlib.sha256((OUT/name).read_bytes()).hexdigest()}for name in names}}
    (OUT/'BUILD.json').write_text(json.dumps(manifest,indent=2)+'\n')
    sys.exit(0)
for entry in json.loads((SOURCE / 'PINNED.json').read_text())['files']:
    assert hashlib.sha256((SOURCE / entry['file']).read_bytes()).hexdigest() == entry['sha256']
BUILD.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True,exist_ok=True)
shutil.copytree(SOURCE, BUILD / 'source', dirs_exist_ok=True)
src = BUILD / 'source'
(src / 'src/Utilities/parallel.h').write_text('''// Browser worker owns this independent pixel job.
#pragma once
template<class Function> void parallel_pixels(int size, Function function) {
 for (int id=0; id<size; ++id) function(id);
}
''')
generic = src / 'src/vlfeat/vl/generic.c'
generic.write_text(generic.read_text().replace('(defined(VL_OS_LINUX) || defined(VL_OS_MACOSX)) && defined(VL_COMPILER_GNUC)', '(defined(VL_OS_LINUX) || defined(VL_OS_MACOSX) || defined(__EMSCRIPTEN__)) && defined(VL_COMPILER_GNUC)'))
if args.variant=='simd':
    zernike=src/'src/Utilities/FeatManager/zMManager.cpp'
    text=zernike.read_text().replace('#include "../parallel.h"','#include "../parallel.h"\n#include "dense-zernike-simd.h"')
    begin='            parallel_pixels(descSize.wh, [&](int id) {'
    end='            });'
    assert text.count(begin)==2 and text.count(end)==2, 'Pinned Zernike convolution structure changed'
    while begin in text:
        first=text.index(begin);last=text.index(end,first)+len(end)
        text=text[:first]+'            dense_zernike_convolve_simd(image,descSize.width,descSize.height,sp,convFilter[n],weights[n],features,n);'+text[last:]
    zernike.write_text(text)
compiler = Path(os.environ['EMSDK']) / 'upstream/emscripten'
assert '4.0.15' in subprocess.check_output([str(compiler/'emcc'), '--version'], text=True).splitlines()[0]
flags = ['-O3', '-ffp-contract=off', '-fexceptions', '-DVL_DISABLE_THREADS', '-DVL_DISABLE_AVX', '-DVL_DISABLE_SSE2', '-I'+str(src/'src/vlfeat'), '-I'+str(ROOT/'native'), '-ffile-prefix-map='+str(ROOT)+'/=']
if args.variant=='simd': flags.append('-msimd128')
files = [src/'src/vlfeat/vl'/f'{n}.c' for n in ('host','generic','scalespace','sift','random','imopv','imopv_sse2')]
files += [src/'src/Utilities/FeatManager'/f'{n}.cpp' for n in ('zMManager','siftManager')] + [src/'dsift_gpu.c', src/'bridge.cpp', ROOT/'native/dense-coherence.cpp', ROOT/'native/dense-compact.cpp', ROOT/'native/dense-zernike-resident.cpp']
objects=[]
for i, source in enumerate(files):
    obj=BUILD/f'{i}.o'
    if source.name in ('dsift_gpu.c','imopv.c'):
        # ARM's native VLFeat build contracts these expressions. WebAssembly has
        # no scalar FMA instruction: make contraction semantically mandatory in
        # LLVM IR so musl fmaf/fma preserves the same single rounding.
        ir=BUILD/f'{i}.ll'
        subprocess.run([str(compiler/'emcc'),'-std=c99',*flags,'-ffp-contract=on','-S','-emit-llvm',str(source),'-o',str(ir)],check=True)
        text=ir.read_text().replace('llvm.fmuladd.','llvm.fma.')
        seen=set();lines=[]
        for line in text.splitlines():
            if line.startswith('declare ') and '@llvm.fma.' in line:
                key=line.split('@')[1].split('(')[0]
                if key in seen:continue
                seen.add(key)
            lines.append(line)
        ir.write_text('\n'.join(lines)+'\n')
        subprocess.run([str(compiler/'emcc'),*flags,'-c',str(ir),'-o',str(obj)],check=True)
    else:
        subprocess.run([str(compiler/('emcc' if source.suffix=='.c' else 'em++')), '-std=c99' if source.suffix=='.c' else '-std=c++14', *flags, '-c', str(source), '-o', str(obj)], check=True)
    objects.append(str(obj))
functions = ['dense_resident_zernike','dense_resident_unpack','dense_resident_field','dense_resident_release','dense_compact_prepare','dense_compact_unpack','dense_compact_field','dense_compact_release','malloc','free','sherloq_dense_features','sherloq_patchmatch_metric','sherloq_patchmatch_bounded','sherloq_dense_area_filter','sherloq_dense_coherence']
subprocess.run([str(compiler/'em++'), *objects, *flags, '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node', '-sFILESYSTEM=0', '-sINITIAL_MEMORY=33554432', '-sMAXIMUM_MEMORY=2147483648', '-sSTACK_SIZE=1048576', '-sALLOW_MEMORY_GROWTH=1', '-sABORTING_MALLOC=0', '-sMEMORY_GROWTH_LINEAR_STEP=16777216', '-sDISABLE_EXCEPTION_CATCHING=0', '-sEXPORTED_RUNTIME_METHODS='+json.dumps(['HEAPU8','HEAPF32','HEAP32','HEAPU32','UTF8ToString']), '-sEXPORTED_FUNCTIONS='+json.dumps(['_'+f for f in functions]), '-o', str(OUT/(args.name+'.js'))], check=True)
if args.variant=='simd':
    wat=BUILD/'dense.wat'
    subprocess.run([str(compiler.parent/'bin/wasm-dis'),str(OUT/(args.name+'.wasm')),'-o',str(wat)],check=True)
    instructions=wat.read_text()
    assert 'f32x4.mul' in instructions and 'f32x4.add' in instructions, 'SIMD arithmetic was not emitted'
    assert '.relaxed_' not in instructions, 'Relaxed SIMD is not allowed for forensic arithmetic'
for name in ('GPLv3.txt','UPSTREAM.txt'):
    shutil.copyfile(SOURCE/name, OUT/name)

shutil.copyfile(SOURCE/"src/vlfeat/COPYING", OUT/"LICENSE-VLFEAT.txt")
