"""Native archive contract from deterministic fields, not a neural parity test."""
from pathlib import Path
import sys,json,hashlib,tempfile,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import export
h,w=19,23;i=np.arange(h*w).reshape(h,w)
def result(names):
    return {name:((i%37-18)/8).astype(np.float32) if name in ('map','source','target') else ((i+index)%3==0).astype(np.uint8) for index,name in enumerate(names)}
forge=result(['map','mask','candidates','analyzed','geometric','branch_microscopy','branch_blots','branch_lanes'])
d2=result(['map','mask','candidates','analyzed','source','target'])
d2['raw_probabilities']=((np.arange(2*3*448*448)%127-63)/16).astype(np.float32).reshape(2,3,448,448)
forge['metadata']={'variant':'Forgeryscope Auto','boxes':[[0,0,w,h]],'status':'ok'}
d2['metadata']={'variant':'D2PRL','boxes':[[0,0,w,h],[3,2,17,16]],'analysisId':'saved-analysis','resultId':'initial-result','min_component':500}
with tempfile.TemporaryDirectory(dir=root/'.build') as folder:
    target=Path(folder)/'native.npz';export((str(target),dict(results=dict(forgeryscope=forge,d2prl=d2))))
    with np.load(target,allow_pickle=False) as archive:
        records={k:dict(dtype=archive[k].dtype.str,shape=list(archive[k].shape),sha256=hashlib.sha256(archive[k].tobytes()).hexdigest()) for k in archive.files if k!='metadata_json'}
        metadata=json.dumps(json.loads(str(archive['metadata_json'])),ensure_ascii=False,separators=(',',':'))
(root/'tests/data/automatic-ai-snapshot-native.json').write_text(json.dumps(dict(width=w,height=h,arrays=records,metadataText=metadata),indent=2)+'\n')
print(len(records),'native AI scientific array contracts; no inference claim')
