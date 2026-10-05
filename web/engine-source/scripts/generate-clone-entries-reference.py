"""Actual native entry/region oracles; no model inference is simulated."""
from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import _entry,entries
from gui.sherloq_app.core.d2prl_regions import regions
cv.setNumThreads(1)
def box(x,y,w,h):return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
def encode(value):
 if isinstance(value,np.ndarray):return value.tolist()
 if isinstance(value,np.generic):return value.item()
 raise TypeError(type(value))
items=[]
for source,polygons,provenance in [('PatchMatch SIFT',[box(1.125,2.675,35.5,18.25),box(80,100,30,20)],{'search_context':'roi:test'}),('Forgeryscope Auto',[box(0,0,9,7),box(21,3,7,10)],{'branch':'blots'}),('SIFT + G2NN + RANSAC + Panels + Text',[box(-.0003,-0.,.012,4),box(150.012499,400.9995,7.5005,18.5)],{'search_context':'zone:é😀'}),('other',[box(.00004,.00006,8,12),box(99999999.5,19.1,51.25,80.3)],{}),('PatchMatch Zernike',[[[0,0],[1,1],[2,2]]],{}),('PatchMatch Zernike',[[[0,0],[1,1]]],{})]:
 items.append(dict(source=source,polygons=polygons,count=12,provenance=provenance,expected=_entry(source,polygons,12,provenance)))
# Every decimal neighborhood exercises float32 round-to-three-decimal identity.
rng=np.random.default_rng(319)
for i in range(30):
 x,y=rng.uniform(-10,100,2);polygons=[box(float(x),float(y),15.5005,25.675),box(float(x+90),float(y+100),19.0015,17.0005)]
 items.append(dict(source='PatchMatch SIFT',polygons=polygons,count=i,provenance={'search_context':'roi:'+str(i)},expected=_entry('PatchMatch SIFT',polygons,i,{'search_context':'roi:'+str(i)})))
masks=[]
for name in ['holes','diagonal','sparse','border','all','empty']:
 mask=np.zeros((39,47),np.uint8)
 if name=='holes':mask[2:20,3:24]=1;mask[7:15,8:17]=0;mask[28:35,33:43]=1
 if name=='diagonal':np.fill_diagonal(mask,1)
 if name=='sparse':mask[::4,::4]=1
 if name=='border':mask[0,:]=1;mask[-1,:]=1;mask[:,0]=1;mask[:,-1]=1
 if name=='all':mask[:]=1
 result=dict(mask=mask,metadata=dict(min_component=500,boxes=[(0,0,47,39)]))
 masks.append(dict(name=name,width=47,height=39,mask=mask,metadata=result['metadata'],expected=regions(result,500)))
match=lambda a,b,**extra:dict(polygon0=a,polygon1=b,score=.9,**extra)
forge=dict(metadata=dict(zones=[dict(origin=[11,17],comparisons=[match(box(0,0,10,12),box(25,0,10,12),supported=True,inliers=12,branch='microscopy'),match(box(2,23,15,8),box(39,23,15,8),accepted=True,branch='blots'),match(box(0,0,10,12),box(1,1,10,12),supported=True,inliers=12),match(box(0,0,10,12),box(30,0,10,12),supported=False,accepted=False)],lane_pairs=[match(box(0,40,8,13),box(28,40,8,13),display_polygon0=box(0,40,8,7))]),dict(origin=[11,17],comparisons=[match(box(2,23,15,8),box(39,23,15,8),accepted=True,branch='blots')])]))
forge_cases=[dict(input=forge,low=lo,high=hi,maximumOverlap=over,expected=entries(forgeryscope=forge,low=lo,high=hi,maximum_overlap=over)) for lo,hi,over in [(10,100,.8),(28,38,.8),(0,100,0),(0,100,1)]]
# Add actual native positive network metadata without copying private image/weights.
positive=root.parent/'web-engine-m2/.build/forgeryscope/positive-reference.json'
if positive.exists():
 c=next(x for x in json.loads(positive.read_text())['cases'] if x['id']=='auto');value=dict(metadata=dict(zones=[dict(origin=[23,31],**c['metadata'])]));forge_cases.append(dict(input=value,low=10,high=10000,maximumOverlap=.8,expected=entries(forgeryscope=value)))
mask=np.zeros((1031,1003),np.uint8);mask[10:1000,10:990]=1;mask[30:980,30:970]=0;mask[100:500,100:500]=1;mask[150:400,150:400]=0;mask[550:750,550:900]=1;mask[600:650,600:850]=0;mask[1029,:]=1
result=dict(mask=mask,metadata=dict(min_component=500,boxes=[(0,0,1003,1031)]))
large=[]
for entry in regions(result):
 value=dict(entry);p=value.pop('pixel_mask');value['pixel_mask']=dict(width=p.shape[1],height=p.shape[0],sha256=hashlib.sha256(p.tobytes()).hexdigest());large.append(value)
output=dict(opencv=cv.__version__,entries=items,masks=masks,forgeryscope=forge_cases,large=dict(width=1003,height=1031,metadata=result['metadata'],expected=large))
(root/'tests/data/clone-entries-native.json').write_text(json.dumps(output,default=encode,separators=(',',':'))+'\n');print(len(items),'hull identities,',len(masks),'masks,',len(forge_cases),'Forgeryscope filters')
