"""Exercise the real native automatic_clones.export, then record array contracts."""
from pathlib import Path
import sys,json,hashlib,tempfile,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import export
shapes={'bool':[257,257],'uint8':[257,257],'int8':[37],'uint16':[331,197],'int16':[331,197],'uint32':[331,197],'int32':[331,197],'uint64':[19],'int64':[19],'float32':[3,331,197],'float64':[331,197]}
arrays={}
for name,shape in shapes.items():
 count=int(np.prod(shape));i=np.arange(count,dtype=np.int64)
 if name=='bool': a=i%3==0
 elif name=='uint64':a=(i.astype(np.uint64)+(1<<63))
 elif name=='int64':a=i-(1<<62)
 elif name.startswith('float'):a=(i%101-50)/8
 elif name.startswith('uint'):a=i%127
 else:a=i%127-63
 arrays[name]=a.astype(name).reshape(shape)
snapshot=dict(version=1,method='complete_automatic_analysis',configuration=dict(regions=[[[0,0],[11,0],[11,7],[0,7]]],d2_minimum=500),results=arrays,ela_profile=dict(empty=np.empty((0,3),np.float32),scalar=np.asarray(2.5,np.float64)),states={'ELA':'done'},errors={},biomes=[],display=dict(source=None,maximum_length_px=float('inf'),negative_zero=-0.,large_integer=9007199254740997,nan=float('nan'),negative_infinity=-float('inf')),image_shape=[257,257,3],decoded_bgr8_sha256='fixture',**{'énergie 🧪':np.asarray([1,2,3],np.int16)})
with tempfile.TemporaryDirectory(dir=root/'.build') as folder:
 target=Path(folder)/'native.npz';export((str(target),snapshot))
 with np.load(target,allow_pickle=False) as archive:
  records={k:dict(dtype=archive[k].dtype.str,shape=list(archive[k].shape),sha256=hashlib.sha256(archive[k].tobytes()).hexdigest()) for k in archive.files if k!='metadata_json'}
  metadata=json.dumps(json.loads(str(archive['metadata_json'])),ensure_ascii=False,separators=(',',':'))
(root/'tests/data/automatic-npz-native.json').write_text(json.dumps(dict(shapes=shapes,arrays=records,metadataText=metadata),ensure_ascii=False,indent=2)+'\n')
print(len(records),'native nested scientific arrays')
