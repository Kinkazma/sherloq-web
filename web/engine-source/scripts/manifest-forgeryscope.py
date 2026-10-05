"""Create only small metadata; weights/graphs remain external to Git."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];base=root/'.build/forgeryscope'
read=lambda n:json.loads((base/n).read_text())
assets={}
for m in read('embeddings-reference.json')['models']+read('yolo-reference.json')['models']:
    assets[m['id']]={k:v for k,v in m.items() if k!='cases'}
for name in ['aliked-blot-dense','lightglue-blot','similarity','rootsift']:
    reference=name+'-unfused-reference.json' if name=='aliked-blot-dense' else name+'-reference.json'
    assets[name]={k:v for k,v in read(reference).items() if k not in ('schema','cases')}
for name,m in read('aliked-heads-reference.json')['graphs'].items():assets['aliked-blot-'+name]=m
for m in read('micro/reference.json')['graphs']:
    assets['micro/'+m['id']]={**m,'file':'micro/'+m['file']}
(base/'manifest.json').write_text(json.dumps(dict(schema=1,assets=assets),indent=2)+'\n')
print(len(assets),'graphs')
