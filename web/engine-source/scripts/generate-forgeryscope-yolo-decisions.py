"""Native synthetic NMS/postprocess references; no neural model is run here."""
from pathlib import Path
import json,os,sys,hashlib
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope'
(out/'yolo-config/Ultralytics').mkdir(parents=True,exist_ok=True)
os.environ.update(YOLO_CONFIG_DIR=str(out/'yolo-config'),YOLO_AUTOINSTALL='false',YOLO_OFFLINE='true')
import torch,torchvision,numpy as np
from ultralytics.utils.nms import non_max_suppression
from ultralytics.utils.ops import scale_boxes
from ultralytics.data.augment import LetterBox
torch.set_num_threads(1)
rng=np.random.default_rng(135799)
records=[]
for kind,threshold,iou in [('panels',.7,.4),('lanes',.3,.1)]:
 for width,height in [(401,257),(128,320),(319,643)]:
  cls=5 if kind=='panels' else 1
  raw=np.zeros((1,4+cls,80),np.float32)
  raw[0,:2]=rng.uniform(20,620,(2,80));raw[0,2:4]=rng.uniform(20,320,(2,80));raw[0,4:]=rng.uniform(0,1,(cls,80))
  # Exact confidence ties, duplicate boxes, same position different class.
  raw[0,:,1]=raw[0,:,0];raw[0,4:,0:2]=0;raw[0,4,0:2]=.95
  raw[0,:,2]=raw[0,:,0];raw[0,4:,2]=0;raw[0,-1,2]=.94
  raw[0,4:,3]=np.float32(threshold)
  shape=LetterBox((640,640),auto=True,stride=32)(image=np.zeros((height,width,3),np.uint8)).shape[:2]
  pred=torch.from_numpy(raw.copy());boxes=non_max_suppression(pred,threshold,iou)[0]
  boxes[:,:4]=scale_boxes(shape,boxes[:,:4],(height,width))
  records.append(dict(kind=kind,width=width,height=height,inputWidth=shape[1],inputHeight=shape[0],classes=cls,anchors=80,predictions=raw.flatten().tolist(),boxes=boxes.tolist()))
import inspect
report=dict(scope='synthetic NMS/coordinate decisions only',torch=torch.__version__,sources={n:hashlib.sha256(Path(inspect.getfile(f)).read_bytes()).hexdigest() for n,f in [('ultralytics/utils/nms.py',non_max_suppression),('ultralytics/utils/ops.py',scale_boxes)]},cases=records)
(root/'tests/data/forgeryscope/yolo-decisions.json').write_text(json.dumps(report,separators=(',',':'))+'\n')
print(len(records),'native NMS cases')
