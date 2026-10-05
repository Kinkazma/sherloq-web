"""Build bounded ZERO adapters in M5; shared SDK/cache are read-only."""
from pathlib import Path
import os, subprocess, hashlib, json
root=Path(__file__).resolve().parents[1];build=root/'.build/zero-stream';build.mkdir(parents=True,exist_ok=True)
out=root/'vendor/zero-stream';out.mkdir(exist_ok=True)
cc=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc';env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(cc),'--version'],env=env,text=True).splitlines()[0];assert '4.0.15' in version
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original=root/'vendor/zero/zero.c';assert sha(original)=='f4fa0091e17cb292414b2bb451e3720c24f4d5227d918ff3730fea4de48f3d36'
source=original.read_text().replace('#include "zero.h"','#include "zero.h"\n#include "zero-cosines.h"').replace('void compute_grid_votes_per_pixel(','void zero_reference_votes(',1).replace('cos((2.0 * k + 1.0) * l * M_PI / 16.0)','zero_cosines[k][l]')
(build/'reference.c').write_text(source);include=['-I'+str(root/'vendor/zero'),'-I'+str(root/'native')]
objects=[]
for name,file in [('reference',build/'reference.c'),('adapter',root/'native/zero-stream.c')]:
 target=build/(name+'.ll');subprocess.run([str(cc),str(file),*include,'-O3','-ffp-contract=on','-S','-emit-llvm','-o',str(target)],env=env,check=True)
 target.write_text(target.read_text().replace('@llvm.fmuladd.','@llvm.fma.'));objects.append(target)
fast=build/'fast.o';subprocess.run([str(cc),str(root/'native/zero-fast.c'),*include,'-O3','-ffp-contract=off','-c','-o',str(fast)],env=env,check=True);objects.append(fast)
subprocess.run([str(cc),*map(str,objects),'-O3','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=134217728','-sEXPORTED_FUNCTIONS=["_malloc","_free","_zero_luminance_bytes","_zero_votes_bytes","_zero_reference_votes_bytes","_zero_scores_from_counts","_zero_region_minimum","_zero_region_nfa","_zero_close_band","_zero_fallback_count","_log_nfa"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',str(out/'zero-stream.js')],env=env,check=True)
(out/'LICENSE').write_bytes((root/'vendor/zero/LICENSE').read_bytes())
(out/'PINNED.json').write_text(json.dumps(dict(compiler=version,license='AGPL-3.0-or-later',source={str(p.relative_to(root)):sha(p) for p in [original,root/'native/zero-fast.c',root/'native/zero-stream.c',root/'native/zero-cosines.h']},arithmetic='Original FMA contraction explicit; existing separated-threshold vote filter unchanged',files={p.name:sha(p) for p in [out/'zero-stream.js',out/'zero-stream.wasm',out/'LICENSE']}),indent=2)+'\n')
