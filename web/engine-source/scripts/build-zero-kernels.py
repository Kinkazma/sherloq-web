"""Reconstruct ZERO scalar/SIMD kernels and their bounded byte adapters."""
from pathlib import Path
import argparse,hashlib,json,os,re,subprocess
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--targets',choices=['all','zero','stream'],default='all');parser.add_argument('--diagnostics',action='store_true');args=parser.parse_args();build=root/'.build/zero-kernels';build.mkdir(parents=True,exist_ok=True)
cc=Path(os.environ['EMSDK'])/'upstream/emscripten/emcc';env={**os.environ,'EM_FROZEN_CACHE':'1','EMCC_CORES':'1'}
version=subprocess.check_output([str(cc),'--version'],text=True,env=env).splitlines()[0];assert '4.0.15' in version
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
original=root/'vendor/zero/zero.c';assert sha(original)=='f4fa0091e17cb292414b2bb451e3720c24f4d5227d918ff3730fea4de48f3d36','Unpinned ZERO source'
includes=['-I'+str(root/'vendor/zero'),'-I'+str(root/'native')]
def run(values):subprocess.run([str(cc),*map(str,values)],check=True,env=env)
source=original.read_text().replace('#include "zero.h"','#include "zero.h"\n#include "zero-cosines.h"').replace('void compute_grid_votes_per_pixel(','void zero_reference_votes(',1).replace('int detect_forgeries(','int zero_reference_forgeries(',1).replace('cos((2.0 * k + 1.0) * l * M_PI / 16.0)','zero_cosines[k][l]');(build/'reference.c').write_text(source)
for name,file in [('reference',build/'reference.c'),('stream',root/'native/zero-stream.c')]:
 p=build/(name+'.ll');run([file,*includes,'-O3','-ffp-contract=on','-S','-emit-llvm','-o',p]);p.write_text(p.read_text().replace('@llvm.fmuladd.','@llvm.fma.'))
exports=['malloc','free','zero','zero_set_reference','zero_fallback_count','rgb2luminance','zero_rgb_luminance','compute_grid_votes_per_pixel','detect_global_grids','detect_forgeries','zero_reference_forgeries','log_nfa','zero_byte_regions_begin','zero_byte_regions_step','zero_byte_regions_count','zero_byte_regions_components','zero_byte_regions_visited','zero_byte_regions_phase','zero_byte_regions_dispose','zero_refine_byte_codes','zero_refine_byte_codes_range','zero_gpu_exact_refinement_count','zero_block_codes','zero_fma64_qualify','zero_fma64_enabled','zero_fma64_set_enabled','zero_fma64_wrapped_calls']
stream_exports=['zero_luminance_bytes','zero_votes_bytes','zero_reference_votes_bytes','zero_scores_from_counts','zero_region_minimum','zero_region_nfa','zero_close_band']
for variant in ['scalar','simd']:
 flags=['-msimd128','-mrelaxed-simd'] if variant=='simd' else [];objects=[build/'reference.ll']
 for name in ['zero-fast','zero-regions-fast','zero-gpu-refine','zero-fma64-'+variant]:
  p=build/(name+'-'+variant+'.o');extra=['-DZERO_FMA_DIAGNOSTICS=1'] if args.diagnostics and name=='zero-fma64-simd' else [];run([root/'native'/(name+'.c'),*includes,*flags,*extra,'-O3','-ffp-contract=off','-c','-o',p]);objects.append(p)
 for target in (['zero','stream'] if args.targets=='all' else [args.targets]):
  name='zero-stream' if target=='stream' else 'zero';out=root/'vendor'/name;out.mkdir(parents=True,exist_ok=True);output=out/(name+('-simd' if variant=='simd' else '')+'.js');functions=exports+(stream_exports if target=='stream' else [])
  run([*objects,*([build/'stream.ll'] if target=='stream' else []),*flags,*(['-Wl,--wrap=fma'] if variant=='simd' else []),'-O3','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sABORTING_MALLOC=0','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY='+str(128*1024**2 if target=='stream' else 2**31),'-sEXPORTED_FUNCTIONS='+json.dumps(['_'+x for x in functions]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8"]','-o',output])
  if variant=='scalar':output.rename(out/(name+'-scalar.js'))
for target in (['zero','stream'] if args.targets=='all' else [args.targets]):
 name='zero-stream' if target=='stream' else 'zero';out=root/'vendor'/name;(out/(name+'.js')).write_text((root/'native/zero-loader.js').read_text().replace('__NAME__',name));(out/'LICENSE').write_bytes((root/'vendor/zero/LICENSE').read_bytes())
 sources=[original,*[root/'native'/x for x in ['zero-fast.c','zero-regions-fast.c','zero-gpu-refine.c','zero-fma64-simd.c','zero-fma64-scalar.c','zero-loader.js','zero-stream.c','zero-cosines.h']],Path(__file__)]
 (out/'PINNED.json').write_text(json.dumps({'compiler':version,'license':'AGPL-3.0-or-later','referenceSource':'ZERO IPOL2021/390; original source unmodified','source':{str(p.relative_to(root)):sha(p) for p in sources},'arithmetic':'Original FMA64 threshold decisions; separated binary64 filter, bounded word-set components, exact native-border closing; SIMD f64FMA admitted only by numerical qualification of its actual instruction site','diagnosticWrappedCounter':args.diagnostics,'files':{p.name:sha(p) for p in out.iterdir() if p.is_file() and p.name!='PINNED.json'}},indent=2)+'\n')
cos=[float.fromhex(x) for x in re.findall(r'-?0x[0-9a-f.]+p[+-][0-9]+',(root/'native/zero-cosines.h').read_text())];assert len(cos)==64
(root/'src/zero-native-cosines.js').write_text('// Generated from pinned native/zero-cosines.h; no runtime cosine.\nexport const ZERO_COSINES='+json.dumps(cos)+';\n')
print(json.dumps({'status':'built','targets':args.targets,'diagnostics':args.diagnostics,'compiler':version}))
