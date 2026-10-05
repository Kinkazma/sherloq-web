"""Pin each bounded CMSeg conversion as a small manifest plus two real graphs."""
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
records=[]
for variant in ['generalization','addnoise']:
    base=root/'.build/segmentation-models'/('cmseg-'+variant)
    reference=json.loads((base/'split-reference.json').read_text());converted=json.loads((base/'native-mean-bn.json').read_text())
    graphs=[]
    for name in ['encoder','decoder']:
        spec=converted['graphs'][name];data=(base/spec['file']).read_bytes()
        assert len(data)==spec['bytes'] and hashlib.sha256(data).hexdigest()==spec['sha256']
        graphs.append(dict(id=name,**{key:spec[key] for key in ['file','bytes','sha256']}))
    manifest=dict(schema=1,id='cmseg-'+variant+'-native512-bounded-v1',variant='cmseg-'+variant,side=512,kind='sigmoid',weights=reference['weights'],graphs=graphs,correlation=reference['correlation'])
    data=(json.dumps(manifest,indent=2)+'\n').encode();(base/'bundle.json').write_bytes(data)
    records.append(dict(variant=manifest['variant'],id=manifest['id'],bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),assetBytes=sum(g['bytes'] for g in graphs),checkpointSha256=next(iter(reference['weights'].values())),correlation=manifest['correlation']))
(root/'.build/cmseg-model-identities.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(records),flush=True)
