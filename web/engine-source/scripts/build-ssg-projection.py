#!/usr/bin/env python3
"""Rebuild exact SSG cubic projection; original localization resources are preserved."""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess
p=argparse.ArgumentParser()
p.add_argument('--emsdk',type=Path,required=True)
p.add_argument('--source-root',type=Path,default=Path(__file__).resolve().parents[1])
a=p.parse_args(); root=a.source_root.resolve();family=root/'vendor/ssg-projection'; sdk=a.emsdk.resolve(); em=sdk/'upstream/emscripten/em++'
env=dict(os.environ,EM_CONFIG=str(sdk/'.emscripten'),EM_FROZEN_CACHE='1',EMCC_CORES='1')
for key in ['CPATH','C_INCLUDE_PATH','CPLUS_INCLUDE_PATH','OBJC_INCLUDE_PATH']:env.pop(key,None)
v=subprocess.run([str(em),'--version'],env=env,check=True,text=True,capture_output=True)
m=re.search(r'^em(?:cc|\+\+) \(Emscripten[^\n]*\) ([0-9]+\.[0-9]+\.[0-9]+)(?:\s|$)',v.stdout)
if not m or m.group(1)!='4.0.15':raise RuntimeError('Emscripten 4.0.15 required; no resources modified.')
out=family/'projection.mjs';out.parent.mkdir(parents=True,exist_ok=True)
cmd=[str(em),str(family/'ssg-project.cpp'),'-O3','-std=c++17','-ffp-contract=off','-fno-fast-math','-fno-vectorize','-fno-slp-vectorize','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=node,web,worker','-sFILESYSTEM=0','-sIMPORTED_MEMORY=1','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=33554432','-sMAXIMUM_MEMORY=2147483648','-sABORTING_MALLOC=0','-sSTACK_SIZE=1048576','-sEXPORTED_FUNCTIONS=["_malloc","_free","_ssg_project_rows"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPU32","HEAPF64"]','-ffile-prefix-map='+str(root)+'/=','-o',str(out)]
subprocess.run(cmd,env=env,check=True)
record={'compiler':'Emscripten4.0.15','buildScript':'scripts/build-ssg-projection.py','commands':[[x.replace(str(sdk),'EMSDK').replace(str(root),'SOURCE_ROOT')for x in cmd]],'files':{str(q.relative_to(family)):{'bytes':q.stat().st_size,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()}for q in [family/'ssg-project.cpp',out,out.with_suffix('.wasm')]},'definition':'Literal binary64 projection using the existing JS cubic antialias coefficient arrays; no new coefficients, FMA, reassociation or tap pruning.'}
(family/'PINNED.json').write_text(json.dumps(record,indent=2)+'\n')
print('Built standalone SSG projection',flush=True)
