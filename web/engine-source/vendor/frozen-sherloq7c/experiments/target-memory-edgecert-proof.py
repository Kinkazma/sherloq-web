#!/usr/bin/env python3
"""Fail closed unless this WASM grows only through its audited JS loader."""
from pathlib import Path
import argparse,hashlib,json,re,subprocess
p=argparse.ArgumentParser();p.add_argument('--wasm-dis',required=True);args=p.parse_args()
root=Path(__file__).resolve().parent
wasm=root/'target-memory-edgecert-kernel.wasm';loader=root/'target-memory-edgecert-kernel.mjs';wat=root/'target-memory-edgecert-kernel.wat'
subprocess.run([args.wasm_dis,str(wasm),'-o',str(wat)],check=True)
text=wat.read_text();js=loader.read_text()
assert not re.search(r'\bmemory\.grow\b',text),'Direct WASM memory.grow bypasses JS admission'
assert len(re.findall(r'\(import[^\n]*\(memory\b',text))==1,'Expected exactly one imported memory'
assert not re.search(r'^\s*\(memory\s',text,re.M),'Unexpected internal memory'
assert js.count('wasmMemory.grow(pages)')==1,'Expected audited growth call'
assert len(re.findall(r'\.grow\s*\(',js))==1,'Unreviewed growth call in loader'
assert '.prototype.grow' not in js and 'grow.call' not in js and 'grow.apply' not in js,'Loader bypasses instance method'
assert js.rstrip().endswith('export default Module;'),'Unexpected module wrapper'
factory=js[:js.rindex('export default Module;')].strip()
assert factory.startswith('async function Module(')
sha=lambda b:hashlib.sha256(b).hexdigest()
proof={'schema':1,'wasmSha256':sha(wasm.read_bytes()),'factorySha256':sha(factory.encode()),'loaderSha256':sha(loader.read_bytes()),'disassemblySha256':sha(wat.read_bytes()),'directMemoryGrowInstructions':0,'importedMemories':1,'loaderGrowthCalls':1,'growthPath':'imported WebAssembly.Memory instance grow(pages)','compiler':'Emscripten 4.0.15'}
(root/'target-memory-edgecert-growth-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
(root/'target-memory-edgecert-growth-proof.mjs').write_text('export default Object.freeze('+json.dumps(proof,separators=(',',':'))+');\n')
print(json.dumps({'growthProof':True,'wasmSha256':proof['wasmSha256'],'directMemoryGrowInstructions':0}))
