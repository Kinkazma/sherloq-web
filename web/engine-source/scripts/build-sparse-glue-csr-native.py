"""Build an additional Native CSR weights resource, no existing artifacts overwritten."""
from pathlib import Path
import argparse,os,subprocess,json,hashlib,re
p=argparse.ArgumentParser();p.add_argument('--source-root',type=Path,required=True);p.add_argument('--emsdk',type=Path,required=True);p.add_argument('--output',type=Path);a=p.parse_args();root=a.source_root.resolve();sdk=a.emsdk.resolve();compiler=sdk/'upstream/emscripten/em++';family=root/'vendor/sparse-glue-csr-native';out=a.output.resolve()if a.output else family
source=root/'native/sparse-glue-csr-native.cpp';base=root/'native/sparse-glue-paged.cpp';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
pin=json.loads((family/'SOURCE-PINNED.json').read_text())
for path,key in [(base,'baseSha256'),(source,'sourceSha256')]:
 if sha(path)!=pin[key]:raise ValueError('Pinned Native CSR source differs: '+path.name)
version=subprocess.check_output([str(compiler),'--version'],text=True)
if not re.search(r'(?<![0-9])4[.]0[.]15(?![0-9])',version):raise ValueError('Emscripten4.0.15 required')
out.mkdir(parents=True,exist_ok=True)
exports=['_malloc','_free','_glue_attention','_glue_logits','_glue_stats','_glue_confidence','_glue_attention_weights']
args=[str(compiler),str(source),'-O3','-msimd128','-ffp-contract=off','-sMODULARIZE=1','-sEXPORT_ES6=1','-sENVIRONMENT=web,worker,node','-sALLOW_MEMORY_GROWTH=1','-sIMPORTED_MEMORY=1','-sINITIAL_MEMORY=16777216','-sMAXIMUM_MEMORY=2147483648','-sFILESYSTEM=0','-sABORTING_MALLOC=0','-sEXPORTED_FUNCTIONS='+json.dumps(exports,separators=(',',':')),'-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAP32","HEAPF32"]','-o',str(out/'attention-csr-native.js')]
env={**os.environ,'PATH':str(sdk/'upstream/bin')+os.pathsep+os.pathsep.join(str(p)for p in sorted((sdk/'node').glob('*/bin')))+os.pathsep+os.environ.get('PATH','')}
subprocess.run(args,env=env,check=True)
files={name:dict(bytes=(out/name).stat().st_size,sha256=sha(out/name))for name in ['attention-csr-native.js','attention-csr-native.wasm']}
(out/'PINNED.json').write_text(json.dumps(dict(source=pin,compiler='Emscripten4.0.15',flags=['-O3','-msimd128','-ffp-contract=off'],files=files),indent=2)+'\n')
print(json.dumps(files))
