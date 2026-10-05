from pathlib import Path
import sys,json,hashlib
import numpy as np,cv2,torch
root=Path(__file__).resolve().parents[1];out=root/'.build/trufor-segments';native=root.parent/'source/gui/TruFor_main/test_docker';sys.path.insert(0,str(native/'src'))
from config import _C
from models.cmx.builder_np_conf import myEncoderDecoder
torch.set_num_threads(2);cfg=_C.clone();cfg.merge_from_file(str(native/'src/trufor.yaml'));cfg.freeze();model=myEncoderDecoder(cfg=cfg);model.load_state_dict(torch.load(native/'weights/trufor-state.pt',map_location='cpu',weights_only=True)['state_dict']);model.eval()
rgb=np.random.default_rng(34172).integers(0,256,(129,193,3),dtype=np.uint8);file=out/'source-small.jpg';cv2.imwrite(str(file),rgb[:,:,::-1],[cv2.IMWRITE_JPEG_QUALITY,90]);rgb=cv2.imread(str(file))[:,:,::-1].copy();inp=torch.from_numpy(rgb.transpose(2,0,1).copy())[None].float()/256
with torch.inference_mode():pred,conf,det,npp=model(inp)
outputs={}
for name,t in [('map',pred.softmax(1)[:,1:2]),('confidence',conf.sigmoid()),('score',det.sigmoid()),('noiseprint_pp',npp[:,0:1])]:
 p=out/('source-small-'+name+'.f32');t.numpy().astype('<f4').tofile(p);outputs[name]={'file':p.name,'dims':list(t.shape)}
(out/'source-reference.json').write_text(json.dumps({'file':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'width':193,'height':129,'outputs':outputs},indent=2)+'\n')
