"""Collect only model parameters/configuration, never reference activations.

Private development package. This does not publish weights or grant a license.
"""
from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[1];out=root/'.build/d2prl-private-package';(out/'assets').mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads((root/p).read_text())
assets={}
def asset(base,spec,dtype='float32'):
 b=(root/base/spec['file']).read_bytes();assert len(b)==spec['bytes'] and sha(b)==spec['sha256']
 name='assets/'+spec['sha256']+'.bin';p=out/name
 if not p.exists():p.write_bytes(b)
 assets[name]=dict(bytes=len(b),sha256=spec['sha256'])
 return dict(file=name,bytes=len(b),sha256=spec['sha256'],shape=spec.get('shape'),dtype=spec.get('dtype',dtype))
def layers(kind,filename):
 result=[]
 for row in read(f'.build/d2prl-{kind}/{filename}')['records']:
  result.append(dict(name=row['name'],padding=row['padding'],inputShape=row['input']['shape'],weights=asset(Path(f'.build/d2prl-{kind}'),row['weights']),bias=asset(Path(f'.build/d2prl-{kind}'),row['bias'])))
 return result
features=layers('convolution','all-reference.json');union=layers('union','reference.json')
bn=[dict(name=r['name'],epsilon=r['epsilon'],params=asset(Path('.build/d2prl-batchnorm'),r['params'])) for r in read('.build/d2prl-batchnorm/reference.json')['records']]
union_bn=[dict(name=r['name'],epsilon=r['epsilon'],params=asset(Path('.build/d2prl-union'),r['params'])) for r in read('.build/d2prl-union/reference.json')['batchnorm']]
dlf={str(k):asset(Path('.build/d2prl-dlf'),next(r['weights'] for r in read('.build/d2prl-dlf/reference.json')['records'] if r['kernel']==k)) for k in (7,9,11)}
graph=read('.build/d2prl-unet-graph/graph.json');graph['parameters']={k:asset(Path('.build/d2prl-unet-graph'),s) for k,s in graph['parameters'].items()}
roles=read('.build/d2prl-model/roles-native-resize-batchnorm-model.json');roles.pop('expected');role_asset=asset(Path('.build/d2prl-model'),dict(file=roles['modelFile'],bytes=roles['modelBytes'],sha256=roles['modelSha256']),dtype='onnx');roles['modelFile']=role_asset['file']
package=dict(schema=1,status='experimental-private-not-a-release',checkpointSha256='2749c7436169ce689deaeb197ce5dae3d1a4533999833928168ec0b0d703df36',side=448,iterations=40,seed=22,referenceThreads=8,features=features,batchnorm=bn,union=union,unionBatchnorm=union_bn,dlfWeights=dlf,graph=graph,roles=roles,layouts={name:read('fixtures/d2prl/'+file) for name,file in [('features','gemm-layout-all.json'),('union','gemm-layout-union.json'),('unet','gemm-layout-unet.json'),('point','point-reduction-layout.json')]},randomState=read('fixtures/d2prl/random.json')['model']['initial'],assets=assets)
package['modelId']='d2prl-448-40-'+sha(json.dumps(package,sort_keys=True,separators=(',',':')).encode())
b=(json.dumps(package,indent=2)+'\n').encode();(out/'model.json').write_bytes(b)
(out/'identity.json').write_text(json.dumps(dict(schema=1,file='model.json',bytes=len(b),sha256=sha(b),modelId=package['modelId'],assets=len(assets),assetBytes=sum(v['bytes'] for v in assets.values()),scope='Private model parameters and configuration only; no native expected images/activations, no distribution permission inferred.'),indent=2)+'\n')
print((out/'identity.json').read_text())
