from pathlib import Path
import sys,json,hashlib
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
import numpy as np,cv2
from PIL import Image
from gui.sherloq_app.core.stereogram import StereoEngine
out=root/'.build/stereo-stream';out.mkdir(exist_ok=True)
refs=json.loads((root/'fixtures/stereo-reference.json').read_text());source=next(c for c in refs['cases'] if c['width']==1024)
rgb=np.fromfile(root/'fixtures'/source['file'],np.uint8).reshape(source['height'],source['width'],3);Image.fromarray(rgb).save(out/'input.jpg',quality=97,subsampling=0)
bgr=cv2.imread(str(out/'input.jpg'));engine=StereoEngine(bgr);offset=engine.search();views=[]
for mode in range(4):views.append(hashlib.sha256(np.ascontiguousarray(engine.compute(mode)[:,:,::-1]).tobytes()).hexdigest())
flow=engine.flow;flow.astype('<f4').tofile(out/'flow.f32');ref=dict(width=source['width'],height=source['height'],offset=offset,differences=engine.difference.tolist(),views=views,flowSha256=hashlib.sha256(flow.tobytes()).hexdigest())
(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n');Image.fromarray(np.full((64,128,3),127,np.uint8)).save(out/'flat.jpg');print({'offset':offset,'flowSha256':ref['flowSha256']})
