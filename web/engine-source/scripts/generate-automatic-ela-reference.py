"""Native complete_analysis.ela_entries on prepared global scientific fields."""
from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.complete_analysis import ela_entries
cv.setNumThreads(1)
def box(x,y,r,b):return [[x,y],[r,y],[r,b],[x,b]]
def sha(a):return hashlib.sha256(a.tobytes()).hexdigest()
def encode(x):
 if isinstance(x,np.ndarray):return x.tolist()
 if isinstance(x,np.generic):return x.item()
 raise TypeError(type(x))
cases=[]
for name,w,h,b,regions,excluded,energy in [('all',67,73,8,[box(0,0,66,72)],[],True),('fractional',67,73,8,[[[1.5,-10],[66,8.5],[40,70],[3,60]]],[box(22,20,34,35)],True),('disjoint',67,73,8,[box(0,0,31,23),box(35,40,66,72)],[],True),('none',67,73,8,[],[],True),('excluded-all',67,73,8,[box(0,0,66,72)],[box(-10,-10,90,90)],True),('cross-raster-bands',83,517,16,[[[-41,-100],[130,22],[41,800],[20,222],[-20,333]]],[box(33.5,240.5,56.5,274.5)],True),('cell-only',67,73,8,[box(0,0,66,72)],[],False)]:
 rows,cols=h//b,w//b;n=rows*cols;i=np.arange(n).reshape(rows,cols);y,x=np.indices((h,w));score=((i%cols*3+i//cols*2)%9/2).astype(np.float32);ghost=(i%13/3).astype(np.float32);background=(i%11/3).astype(np.float32)
 metadata=dict(block=b,qualities=[70,75,80],image_shape=[h,w],energy=dict(enabled=energy))
 base=dict(score=np.maximum(np.maximum(score,ghost),background),legacy_score=score,ela_score=score,ghost_score=ghost,ghost_supported=np.ones((rows,cols),bool),background_score=background,background_supported=np.ones((rows,cols),bool),supported=i%17!=0,signed_scores=((np.arange(n*15).reshape(rows,cols,3,5)%17-8)/4).astype(np.float32),metadata=metadata)
 if energy:base.update(energy_scope=np.where(x<w//2,1,2).astype(np.int32),energy_low_score=np.where((x+y)%23<=10,((x*3+y*5)%17)/2,0).astype(np.float32),energy_high_score=np.where((x+y)%23>10,((x*7+y*2)%19)/3,0).astype(np.float32),energy_summary=[dict(id=1,bbox=[0,0,w//2,h]),dict(id=2,bbox=[w//2,0,w,h])])
 entries,result=ela_entries(base,2,1,regions,excluded,(h,w,3),energy_thresholds=[2,2]);normalized=[]
 for e in entries:
  record=dict(e)
  if 'pixel_mask' in record:
   mask=record['pixel_mask'];record['pixel_mask']=dict(width=mask.shape[1],height=mask.shape[0],sha256=sha(mask))
  normalized.append(record)
 selected=np.zeros((h,w),np.uint8)
 for p in regions:cv.fillPoly(selected,[np.rint(p).astype(np.int32)],1)
 for p in excluded:cv.fillPoly(selected,[np.rint(p).astype(np.int32)],0)
 cases.append(dict(name=name,width=w,height=h,block=b,regions=regions,excluded=excluded,energy=energy,expected=dict(entries=normalized,metadata=result['metadata'],supported=result['supported'],labelsSha256=sha(result['labels']),scopeSha256=sha(selected),energyLabelsSha256=sha(result['energy_labels']) if energy else None)))
(root/'tests/data/automatic-ela-native.json').write_text(json.dumps(dict(cases=cases),default=encode,separators=(',',':'))+'\n');print(len(cases),'native complete ELA selections')
