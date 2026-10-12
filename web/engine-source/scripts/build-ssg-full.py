"""Local-only exact-source structured-forest C ABI build and standard NPY export.

The original forest/model is not an open-source/public SHERLOQ dependency.
This script keeps restricted files in the caller's explicit private output.
"""
from pathlib import Path
import argparse, hashlib, json, os, shutil, subprocess
import numpy as np
from scipy.io import loadmat

ROOT=Path(__file__).resolve().parents[1]
VENDOR=ROOT/'vendor/ssg-full'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',type=Path,required=True)
parser.add_argument('--channels',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--emsdk',type=Path,required=True)
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
private=args.output/'source';private.mkdir(exist_ok=True)
records=[]
for p in [args.source/'Function/EDGE/private/edgesDetectMex.cpp',args.source/'Function/EDGE/license.txt',*args.channels.glob('*.cpp'),*args.channels.glob('*.hpp')]:
 data=p.read_bytes();(private/p.name).write_bytes(data)
 records.append(dict(file=p.name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
simd=private/'sse.hpp';text=simd.read_text();text=text.replace('#include <emmintrin.h>','#include <emmintrin.h>\n#include "sse-instruction-lut.h"')
assert text.count('return _mm_rcp_ps(x);')==1 and text.count('return _mm_rsqrt_ps(x);')==1
simd.write_text(text.replace('return _mm_rcp_ps(x);','return ssg_sse_vector(x,false);').replace('return _mm_rsqrt_ps(x);','return ssg_sse_vector(x,true);'))
rgb=private/'rgbConvertMex.cpp';text=rgb.read_text();marker='const int k=256; float R[k], G[k], B[k];';assert text.count(marker)==1
rgb.write_text(text.replace(marker,'const int k=256; alignas(16) float R[k], G[k], B[k];'))
wrappers=private/'wrappers.hpp';text=wrappers.read_text();text=text.replace('return calloc(num,size);','void*p=aligned_alloc(16,(num*size+15)&~size_t(15)); if(p)memset(p,0,num*size); return p;').replace('return malloc(size);','return aligned_alloc(16,(size+15)&~size_t(15));');wrappers.write_text(text)
forest=private/'edgesDetectMex.cpp';text=forest.read_text()
marker='for( int c=0; c<w1; c++ ) for( int t=0; t<nTreesEval; t++ ) {';assert text.count(marker)==1
text=text.replace(marker,'ssg_parallel(w1,[&](int c) { for( int t=0; t<nTreesEval; t++ ) {')
marker='\n  // compute edge maps (avoiding collisions';idx=text.index(marker);text=text[:idx].rstrip()+' });\n'+text[idx:]
marker='for( int c=0; c<w1; c++ ) for( int r=0; r<h1; r++ ) {';assert text.count(marker)==1
text=text.replace(marker,'for(int c0=0;c0<gtWidth/stride;c0++) { ssg_parallel((w1-c0+gtWidth/stride-1)/(gtWidth/stride),[&](int ci) { int c=c0+ci*(gtWidth/stride); for( int r=0; r<h1; r++ ) {')
marker='\n  // free memory';idx=text.index(marker);before=text[:idx];pos=before.rfind('\n  }');before=before[:pos]+' }); }'+before[pos:];text=before+text[idx:];forest.write_text(text)
model_path=args.source/'Function/EDGE/model.mat'
model=loadmat(model_path,simplify_cells=True)['model'];arrays=[]
for name in ['thrs','fids','child','segs','nSegs','eBins','eBnds']:
 data=np.asfortranarray(model[name]);p=args.output/(name+'.npy');np.save(p,data,allow_pickle=False)
 arrays.append(dict(name=name,file=p.name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),shape=list(data.shape),dtype=data.dtype.str,fortranOrder=True,dataBytes=data.nbytes))
manifest=dict(schema='sherloq.ssg-structured-forest/1',source='https://github.com/ChaoWang1016/word2phraseCMFD',sourceCommit='66bb26eca0c7e95c76042d5bcca58f744d70a27d',privateOnly=True,license='MSR-LA; original author repository all rights reserved; no public redistribution authorized',original=dict(file=str(model_path),bytes=model_path.stat().st_size,sha256=hashlib.sha256(model_path.read_bytes()).hexdigest()),arrays=arrays,nodes=int(model['fids'].shape[0]),opts={k:model['opts'][k] for k in ['shrink','stride','imWidth','gtWidth','nChns','nCells','nChnFtrs','nTrees','nTreesEval','sharpen','grdSmooth','chnSmooth','simSmooth','normRad','nOrients']},sourceFiles=records)
(args.output/'forest-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
env=dict(os.environ,EM_CONFIG=str(args.emsdk/'.emscripten'))
exports=['malloc','free','ssg_edges_release','ssg_edges_detect','ssg_edges_set_model','ssg_edges_set_team','ssg_edges_shutdown','ssg_edges_output','ssg_edges_regular','ssg_edges_similar','ssg_edges_leaves','ssg_edges_channel_count','ssg_edges_leaf_count','ssg_edges_allocation_bytes','ssg_edges_approx']
cmd=[str(args.emsdk/'upstream/emscripten/em++'),'-O3','-std=c++17','-ffp-contract=off','-fexceptions','-sDISABLE_EXCEPTION_CATCHING=0','-msimd128','-msse2','-I'+str(VENDOR),'-I'+str(private),str(VENDOR/'wrapper.cpp'),'-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=node,web,worker','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sSTACK_SIZE=1048576','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS='+json.dumps(['_'+s for s in exports]),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAPU32"]','-o',str(args.output/'edges.mjs')]
subprocess.run(cmd,check=True,env=env)
p=args.output/'edges.mjs';text=p.read_text();marker='var getHeapMax=()=>2147483648;';assert text.count(marker)==1
p.write_text(text.replace(marker,'var getHeapMax=()=>Module["maximumHeapBytes"]??2147483648;'))
threaded=cmd.copy();threaded[threaded.index('-o')+1]=str(args.output/'edges-shared.mjs');threaded+=['-pthread','-sPTHREAD_POOL_SIZE=Module["workerCount"]||1','-sPTHREAD_POOL_SIZE_STRICT=2']
subprocess.run(threaded,check=True,env=env)
p=args.output/'edges-shared.mjs';text=p.read_text();assert text.count(marker)==1;p.write_text(text.replace(marker,'var getHeapMax=()=>Module["maximumHeapBytes"]??2147483648;'))
manifest['runtime']={name:dict(bytes=(args.output/name).stat().st_size,sha256=hashlib.sha256((args.output/name).read_bytes()).hexdigest()) for name in ['edges.mjs','edges.wasm','edges-shared.mjs','edges-shared.wasm']}
(args.output/'forest-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(dict(manifest=str(args.output/'forest-manifest.json'),modelBytes=sum(a['dataBytes'] for a in arrays),runtime=manifest['runtime'])))
