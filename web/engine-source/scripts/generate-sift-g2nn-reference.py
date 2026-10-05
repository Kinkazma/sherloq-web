"""Small native oracle fixtures; writes only M3-owned redistributable inputs."""
from pathlib import Path
import hashlib,json,sys
import numpy as np
import cv2
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.sift_g2nn import match
assert cv2.__version__=='4.11.0' and np.__version__=='1.26.4'
rng=np.random.default_rng(3003)
cases=[]
def add(name,p,d,m,**options):
    params=dict(radius=1000.,minimum=2.,ratio=.7,compare=False)
    params.update(options)
    # Independent search contexts preserve each ROI's evidence in the new API.
    expected=[];owners=[];evaluated=0
    if params['compare']:
        pairs,evaluated=match(p,d,m,cancel=lambda:False,progress=lambda *x:None,**params)
        expected=pairs.tolist();owners=[-1]*len(pairs)
    else:
        for zone in range(m.shape[1]):
            settings=dict(params)
            if settings.get('radii') is not None:settings['radii']=[settings['radii'][zone]]
            pairs,n=match(p,d,m[:,zone:zone+1],cancel=lambda:False,progress=lambda *x:None,**settings)
            expected.extend(pairs.tolist());owners.extend([zone]*len(pairs));evaluated+=n
    params={k:v.tolist() if isinstance(v,np.ndarray) else v for k,v in params.items()}
    if params.get('axes') is not None:params['axes']=[x.tolist() for x in params['axes']]
    cases.append(dict(name=name,points=p.tolist(),descriptors=d.tolist(),members=m.astype(int).tolist(),options=params,
                      expected=expected,owners=owners,evaluated=evaluated))
p=np.zeros((20,7),np.float32);p[:,:2]=rng.uniform(0,100,(20,2));p[:,2]=3
# Several exact and near copies, with independent ratio competition.
d=rng.integers(0,160,(20,128)).astype(np.float32)
for a,b in [(0,8),(1,9),(2,10),(3,11),(4,12)]:d[b]=d[a]+rng.integers(0,3,128)
m=np.ones((20,1),bool)
add('global',p,d,m)
add('spatial-before-neighbours',p,d,m,minimum=35.,radius=70.)
regions=np.ones((20,3),bool);regions[10:,0]=False;regions[:8,1]=False
add('overlapping-contexts',p,d,regions,radii=[40.,90.,120.])
compare=np.zeros((20,2),bool);compare[:10,0]=True;compare[10:,1]=True
add('compare-gap',p,d,compare,compare=True,gap=(20.,-10.))
add('reflection-cross-frame',p,d,m,variants=np.arange(20)>=10)
add('compact-coordinates',p,d,m,axes=(np.repeat(np.arange(51,dtype=np.float32),2),np.arange(101,dtype=np.float32)),radius=60.)
ties=np.zeros((6,128),np.float32);ties[:,0]=[0,1,1,2,10,12]
add('stable-ties',p[:6],ties,np.ones((6,1),bool))
add('empty',p[:0],d[:0],m[:0])
add('one-neighbour',p[:2],d[:2],m[:2])
# Real native SIFT representations, generated texture and a translated copy.
image=rng.integers(0,256,(64,96),dtype=np.uint8);image[:,48:]=image[:,:48]
kp,desc=cv2.SIFT_create(contrastThreshold=.001).detectAndCompute(image,None)
points=np.array([[*k.pt,k.size,k.angle,k.response,k.octave,k.class_id] for k in kp],np.float32)
add('native-sift-texture',points,desc,np.ones((len(kp),1),bool))
out=root/'tests/m3-data/g2nn-reference.json'
out.write_text(json.dumps({'opencv':cv2.__version__,'numpy':np.__version__,
 'nativeSha256':hashlib.sha256((root.parent/'source/gui/sherloq_app/core/sift_g2nn.py').read_bytes()).hexdigest(),'cases':cases},separators=(',',':'))+'\n')
print(f'{len(cases)} cases -> {out}')
