#!/usr/bin/env python3
"""Rebuild the bounded scalar/SIMD LCMS display projector with its pins."""
import argparse, hashlib, json, subprocess
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--emscripten-root', type=Path, required=True)
p.add_argument('--output', type=Path, help='Optional separate reconstruction directory')
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
here=a.output.resolve() if a.output else root/'vendor/lcms-display-cpu'
here.mkdir(parents=True,exist_ok=True)
em=a.emscripten_root.resolve()/'emcc'
version=subprocess.check_output([str(em),'--version'],text=True).splitlines()[0]
if '4.0.15' not in version:
    raise SystemExit('Emscripten4.0.15 is required for a comparable candidate.')
source=root/'native/lcms-linear-projection.c'
flags=['-O3','-std=c11','-ffp-contract=off','-fno-fast-math',
       '-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node',
       '-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1',
       '-sINITIAL_MEMORY=2097152','-sMAXIMUM_MEMORY=33554432','-sSTACK_SIZE=65536',
       '-ffile-prefix-map='+str(root)+'/=engine/']
record={'schema':'sherloq.lcms-display-cpu/1',
        'toolchain':version,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'sourceSamplesModified':False,'maximumMemoryBytes':33554432,'native16Error':0,'maximumSdrCodeError':1,'source':'native/lcms-linear-projection.c','variants':{}}
for variant in ['scalar','simd']:
    exports=['_malloc','_free','_lcms_linear_rgb8_scalar']
    if variant=='simd': exports.append('_lcms_linear_rgb8_simd')
    out=here/('lcms-linear-'+variant+'.mjs')
    args=[str(em),str(source),*flags,*(['-msimd128'] if variant=='simd' else []),
          '-sEXPORTED_FUNCTIONS='+json.dumps(exports),'-o',str(out)]
    subprocess.run(args,check=True)
    record['variants'][variant]={name:{'bytes':(here/name).stat().st_size,
        'sha256':hashlib.sha256((here/name).read_bytes()).hexdigest()}
        for name in [out.name,out.with_suffix('.wasm').name]}
(here/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
