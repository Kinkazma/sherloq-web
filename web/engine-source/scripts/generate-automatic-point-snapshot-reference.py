"""Real native export of saved native point results and deterministic dense fields."""
from pathlib import Path
import sys,json,hashlib,tempfile,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import export
from gui.sherloq_app.core.cloning2 import palette
points=json.loads((root/'tests/data/automatic-points-native.json').read_text())['cases']
params=json.loads((root/'tests/data/automatic-plan-native.json').read_text())['cases'][0]['native']
results={};inputs={};h,w=263,257;i=np.arange(h*w).reshape(h,w)
for kind,case in [('sift',points[2]),('patchmatch',points[-1])]:
    saved=case['result'];r={**saved,'params':params[kind]}
    r['points']=np.asarray(r['points'],dtype=case['pointType']);r['pairs']=np.asarray(r['pairs'],dtype=np.float64)
    r['groups']=tuple(np.asarray(g,dtype=np.int64) for g in r['groups']);r['pair_search_regions']=np.asarray(r['pair_search_regions'],dtype=np.int32)
    r['colors'],r['bases']=palette(r['groups'],r['pairs'],.3)
    if kind=='patchmatch':
        r['pair_algorithms']=np.asarray(np.arange(len(r['pairs']))%2,np.uint8)
        r['dense_maps']=[dict(consistent_mask=i%3==0,coherence_error=((i%71)/8).astype(np.float32) if k==0 else None,origin=[7,11],shift=12,targets=(i%53-1).astype(np.int32),distances_squared=((i%37)/16).astype(np.float32),zone=2,algorithm='PatchMatch SIFT',**(dict(variant='reflection',descriptor_frame='quarter_turn/bin=10',source_bin=8,target_bin=10) if k else {})) for k in range(2)]
        r['group_variants']=['normal'];r['group_frames']=['normal']
    results[kind]=r
    inputs[kind]={**saved,'params':params[kind],'colors':r['colors'].tolist(),'bases':r['bases'],'pointType':case['pointType']}
with tempfile.TemporaryDirectory(dir=root/'.build') as folder:
    target=Path(folder)/'native.npz';export((str(target),dict(results=results)))
    with np.load(target,allow_pickle=False) as archive:
        records={k:dict(dtype=archive[k].dtype.str,shape=list(archive[k].shape),sha256=hashlib.sha256(archive[k].tobytes()).hexdigest()) for k in archive.files if k!='metadata_json'}
        metadata=json.loads(str(archive['metadata_json']))
(root/'tests/data/automatic-point-snapshot-native.json').write_text(json.dumps(dict(width=w,height=h,inputs=inputs,arrays=records,metadata=metadata),separators=(',',':'))+'\n')
print(len(records),'native classical scientific arrays; no new detector run')
