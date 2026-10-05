"""Native ROI bounds and source crops only; no model output is simulated."""
from pathlib import Path
import sys,json,hashlib,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.clone_detectors import boxes_for
def rect(x,y,r,b):return [[x,y],[r,y],[r,b],[x,b]]
w,h=41,37;y,x,c=np.indices((h,w,3));rgb=((x*17+y*31+c*43)%256).astype(np.uint8)
cases=[]
for name,regions,excluded in [('whole',[],[]),('fractional',[rect(3.2,2.4,32.1,29.8)],[rect(5.2,4.2,13.5,16.1)]),('clipped',[rect(-10,-20,50,60)],[rect(-1,-1,8,9),rect(30,29,80,80)]),('reordered',[[[32,2],[3,29],[3,2],[32,29]]],[rect(32,2,40,30)]),('touching',[rect(2,2,21,21)],[rect(22,2,35,20)]),('invalid-rotated',[[[0,3],[3,0],[10,3],[3,10]]],[]),('too-small',[rect(1,1,7,7)],[])]:
 row=dict(name=name,width=w,height=h,regions=regions,excluded=excluded)
 try:
  boxes=boxes_for(rgb.shape,regions);ex=boxes_for(rgb.shape,excluded) if excluded else [];crops=[]
  for x0,y0,x1,y1 in boxes:
   local=[(max(a,x0)-x0,max(b,y0)-y0,min(c,x1)-x0,min(d,y1)-y0) for a,b,c,d in ex if min(c,x1)>max(a,x0) and min(d,y1)>max(b,y0)]
   crop=rgb[y0:y1,x0:x1].copy()
   for a,b,c,d in local:crop[b:d,a:c]=0
   crops.append(dict(local=local,sha256=hashlib.sha256(crop.tobytes()).hexdigest()))
  row.update(boxes=boxes,excludedBoxes=ex,crops=crops)
 except ValueError:row['invalid']=True
 cases.append(row)
(root/'tests/data/automatic-ai-native.json').write_text(json.dumps(dict(native='clone_detectors.boxes_for + native black crop exclusion policy',cases=cases),indent=2)+'\n')
print(len(cases),'ROI cases')
