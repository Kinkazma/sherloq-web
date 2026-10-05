"""Stage only pinned runtime code/binaries, never model weights or activations."""
from pathlib import Path
import json,hashlib,shutil
root=Path(__file__).resolve().parents[1];out=root/'vendor/d2prl';out.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();files={};builds={}
def copy(source,name):
 data=source.read_bytes();assert b'/' + b'Users/' not in data,'Private path in '+str(source);target=out/name;target.write_bytes(data);files[name]=dict(bytes=len(data),sha256=sha(target))
for name,stem in [('prepare','prepare'),('feature-math','feature-math'),('neural-math','neural-math'),('dlf','dlf'),('convolution-cpu','convolution'),('evaluator-tiled','evaluator-tiled'),('postprocess','postprocess'),('spatial','spatial')]:
 base=root/'.build'/('d2prl-'+name);build=json.loads((base/'build.json').read_text());builds[name]=build
 for extension in ['js','wasm']:copy(base/(stem+'.'+extension),stem+'.'+extension)
for name in ['SLEEF-LICENSE.txt','SLEEF-PINNED.json','PYTORCH-LICENSE.txt','MT19937-LICENSE.txt']:copy(root/'experiments/d2prl'/name,name)
copy(root/'vendor/cloning/MUSL-LICENSE.txt','MUSL-LICENSE.txt')
for name in ['ort-wasm-simd-threaded.mjs','factory.mjs']:copy(root/'.build/d2prl-roles-runtime'/name,name)
for name in ['ort-wasm-simd-threaded.wasm','ort.wasm.min.mjs']:copy(root/'.build/ort130/package/dist'/name,name)
copy(root/'.build/ort130/notices/LICENSE','ONNXRUNTIME-LICENSE.txt')
copy(root/'.build/ort130/notices/ThirdPartyNotices.txt','ONNXRUNTIME-ThirdPartyNotices.txt')
copy(root/'.build/ort130/notices/sources.json','ONNXRUNTIME-SOURCES.json')
runtime=json.loads((root/'.build/d2prl-roles-runtime/runtime.json').read_text())
(out/'PINNED.json').write_text(json.dumps(dict(schema=1,scope='Portable runtime without model weights; private package supplied separately by verified manifest. No runtime calibration.',rolesRuntime=runtime,builds=builds,files=files),indent=2)+'\n')
print('Staged',len(files),'runtime files; no model parameters')
