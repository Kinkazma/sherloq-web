from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.zero import analyze,jpeg99
OUT=ROOT/'web-engine/fixtures';rng=np.random.default_rng(33498);cases=[]
def digest(a):return hashlib.sha256(a.tobytes()).hexdigest()
def jpg(a,q):return cv.imdecode(cv.imencode('.jpg',a,[cv.IMWRITE_JPEG_QUALITY,q])[1],cv.IMREAD_COLOR)
configs=[('flat',16,16),('random',33,35),('gradient',64,48),('jpeg',128,128),('shifted',129,137),('spliced',192,160),('missing',192,160),('rgb-ties',31,33),('black',17,16),('white',16,17),('checker',65,63),('narrow',16,129)]
configs += [('phase-%d-%d'%(x,y),81,79) for x in range(8) for y in range(8)]
for name,w,h in configs:
 a=rng.integers(0,256,(h,w,3),np.uint8)
 if name in ['flat','black','white']:a.fill({'flat':127,'black':0,'white':255}[name])
 if name=='checker':a=np.repeat((np.indices((h,w)).sum(0)%2*255).astype(np.uint8)[:,:,None],3,2)
 if name.startswith('phase-'):
  _,x,y=name.split('-');a=np.roll(jpg(a,30),(int(y),int(x)),(0,1))
 if name=='gradient':a=(np.indices((h,w))[1][:,:,None]*np.array([1,2,3],np.uint8)).astype(np.uint8)
 if name in ['jpeg','shifted','spliced','missing']:a=jpg(a,40)
 if name=='shifted':a=np.roll(a,(3,7),(0,1))
 if name=='spliced':a[20:136,25:152]=np.roll(a,(3,5),(0,1))[20:136,25:152]
 if name=='missing':a[20:136,25:152]=rng.integers(0,256,(116,127,3),np.uint8)
 if name=='rgb-ties':
  palette=np.array([[0,0,250],[1,23,0],[255,255,255],[12,92,122],[250,0,0],[0,250,0]],np.uint8);a=palette[np.indices((h,w)).sum(0)%len(palette)]
 file='zero-'+name+'.rgb';(OUT/file).write_bytes(a[:,:,::-1].copy().tobytes());companion,encoded=jpeg99(a);companionFile='zero-'+name+'-jpeg99.rgb';(OUT/companionFile).write_bytes(companion[:,:,::-1].copy().tobytes());expected=[]
 for missing in [False,True]:
  result=analyze(a,companion if missing else None);serial=analyze(a,companion if missing else None,reference=True)
  arrays={}
  for key,value in result.items():
   if isinstance(value,np.ndarray):
    assert np.array_equal(value,serial[key]),(name,key,'native serial/parallel mismatch');arrays[key]=dict(dtype=str(value.dtype),sha256=digest(value),values=value.ravel().tolist() if key=='grid_log10_nfa' else None)
  from gui.sherloq_app.tools.jpeg.zero import display
  views=[hashlib.sha256(display((result,mode))[:,:,::-1].copy().tobytes()).hexdigest() for mode in range(5)]
  expected.append(dict(missing=missing,arrays=arrays,metadata=result['metadata'],views=views))
  print(name,missing,result['metadata']['main_grid'],len(result['metadata']['foreign_regions']),len(result['metadata']['missing_regions']),flush=True)
 cases.append(dict(name=name,width=w,height=h,file=file,companion=companionFile,expected=expected))
(OUT/'zero-reference.json').write_text(json.dumps(dict(schema=1,sourceSha256=hashlib.sha256((ROOT/'source/gui/sherloq_app/vendor/zero/zero.c').read_bytes()).hexdigest(),cases=cases),indent=2)+'\n')
