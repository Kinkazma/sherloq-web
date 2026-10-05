"""Masks of the pinned synthetic native model source; no image data in proof."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.d2prl import postprocess
base=root/'.build/d2prl-model';ref=json.loads((base/'reference.json').read_text());raw=np.stack([np.fromfile(base/r['file'],np.float32).reshape(448,448) for r in ref['raw']]);rows=[]
for minimum in [0,17,500,5000]:
 a=np.stack(postprocess(raw,minimum)).astype(np.float32);b=a.tobytes();file=f'native-masks-{minimum}.bin';(base/file).write_bytes(b);rows.append(dict(minimum=minimum,file=file,bytes=len(b),shape=list(a.shape),sha256=hashlib.sha256(b).hexdigest()))
(base/'masks-reference.json').write_text(json.dumps(dict(schema=1,scope='Native masks on the existing generated reference source, before resize back to source dimensions',records=rows),indent=2)+'\n');print('Generated',len(rows),'mask references')
