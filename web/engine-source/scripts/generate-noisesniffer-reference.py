"""Synthetic, publishable corrected Noisesniffer oracles; no private imagery."""
from pathlib import Path
import hashlib, json, sys
import numpy as np
import scipy, cv2
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core import noisesniffer as ns
OUT=ROOT/'web-engine/fixtures'
rng=np.random.default_rng(29092912)
def store(name,value):
    value=np.ascontiguousarray(value)
    data=value.tobytes();file='noisesniffer-'+name+'.bin';(OUT/file).write_bytes(data)
    return dict(file=file,shape=list(value.shape),dtype=value.dtype.str,sha256=hashlib.sha256(data).hexdigest())
images={
    'tiny':rng.integers(0,256,(8,9,3),np.uint8),
    'random':rng.integers(0,256,(47,53,3),np.uint8),
    'constant':np.full((33,35,3),127,np.uint8),
    'ties':np.fromfunction(lambda y,x,c:50+40*((x+y)%4),(39,41,3)).astype(np.uint8),
    'gradient':np.fromfunction(lambda y,x,c: (x*3+y*2+c*17)%256,(51,57,3)).astype(np.uint8),
    'flat-channel':rng.integers(10,241,(43,49,3),np.uint8),
    'patch':rng.integers(60,191,(131,137,3),np.uint8),
    'stripes':rng.integers(70,181,(101,113,3),np.uint8),
    'small-patch':np.random.default_rng(12929).integers(110,141,(193,197,3),np.uint8),
}
images['flat-channel'][:,:,1]=120
images['patch'][20:110,20:115]=rng.integers(120,131,(90,95,3),np.uint8)
images['stripes'][:,35:78]=rng.integers(122,129,(101,43,3),np.uint8)
images['small-patch'][80:110,80:110]=rng.integers(124,127,(30,30,3),np.uint8)
cases=[]
for name,rgb in images.items():
    bgr=np.ascontiguousarray(rgb[:,:,::-1]);input=store(name+'-rgb',rgb)
    for w in [3,5,7,8]:
        stats=ns.statistics(bgr,w);prefix=name+'-'+str(w)
        row=dict(name=prefix,width=rgb.shape[1],height=rgb.shape[0],block=w,input=input,
                 statistics={k:store(prefix+'-'+k,v) for k,v in zip(['valid','means','variance'],stats)},analyses=[])
        settings=[(w,10,100,.1,.5),(w,17,500,.25,.3),(w,100,20000,.1,.5)]
        if name=='small-patch':settings.extend([(w,20,20000,.25,.5),(w,20,20000,.5,.5),(w,20,20000,1.,.5)])
        for params in settings:
            V,S=ns.select(bgr,w,*params[2:],stats)
            all_blocks,low=ns.counts(bgr.shape,w,params[1],V,S)
            mask,regions=ns.regions(bgr.shape,w,params[1],params[-1],all_blocks,low)
            distribution=ns.distribution(bgr,w,V,S)[:,:,::-1]
            overlay=rgb.copy();selected=mask>0
            overlay[selected]=(overlay[selected].astype(np.float32)*.55+np.array([255,0,0])*.45).astype(np.uint8)
            p=prefix+'-'+str(len(row['analyses']))
            row['analyses'].append(dict(parameters=params,regions=regions,inconclusive=not len(V),
                arrays={k:store(p+'-'+k,v) for k,v in [('selected',V),('low_noise',S),('all_blocks',all_blocks),('low_noise_blocks',low),('mask',mask),('distribution',distribution),('overlay',overlay)]}))
        cases.append(row)
        print(row['name'],len(stats[0]),len(row['analyses'][0]['regions']),flush=True)
sorts=[]
for n in [0,1,7,15,16,17,31,32,33,127,128,129,1024,8191,8192,8193]:
    for mode in ['random','ties','same','sorted','reverse','organ-pipe']:
        a={'random':lambda:rng.normal(size=n),'ties':lambda:rng.integers(0,5,n).astype(np.float64),'same':lambda:np.zeros(n),
           'sorted':lambda:np.arange(n,dtype=np.float64),'reverse':lambda:np.arange(n,dtype=np.float64)[::-1],
           'organ-pipe':lambda:np.minimum(np.arange(n),np.arange(n)[::-1]).astype(np.float64)}[mode]()
        sorts.append(dict(name=f'{mode}-{n}',values=store(f'sort-{mode}-{n}',a),indices=store(f'argsort-{mode}-{n}',np.argsort(a))))
tails=[]
for w in [3,5,7,8]:
    for n in [1,2,10,100,1000,10000]:
        for m in [.01,.1,.3,.5,.9,.99]:
            for k in sorted(set([0,1,n//2,int(n*m),min(n,int(n*m)+1),n,n+1])):
                value=ns.log_tail(k*w*w,n*w*w,w,m)
                tails.append(dict(K=k*w*w,N=n*w*w,w=w,m=m,logTail=value if np.isfinite(value) else '-Infinity'))
sources=['core/noisesniffer.py','vendor/noisesniffer/functions.py']
regional=[]
# Explicit positive, empty-border, seed and growth-order cases, independent of DCT.
for index in range(24):
    shape=(51,73,3);W=10;w=[3,5,7,8][index%4];m=[.1,.3,.5,.7][index%4]
    total=rng.integers(0,1000,(shape[0]//W+1,shape[1]//W+1)).astype(np.float64)
    low=np.floor(total*rng.uniform(0,1,total.shape));low[index%6,(index*3)%8]=total[index%6,(index*3)%8]
    if index%3==0:total[-1]=0;low[-1]=0
    mask,regions=ns.regions(shape,w,W,m,total,low)
    regional.append(dict(name='growth-'+str(index),width=shape[1],height=shape[0],w=w,W=W,m=m,
                         all_blocks=total.tolist(),low_noise_blocks=low.tolist(),mask=store('growth-'+str(index),mask),regions=regions))
report=dict(schema=1,numpy=np.__version__,scipy=scipy.__version__,opencv=cv2.__version__,
            sourceHashes={f:hashlib.sha256((ROOT/'source/gui/sherloq_app'/f).read_bytes()).hexdigest() for f in sources},cases=cases,sorts=sorts,tails=tails,regional=regional)
(OUT/'noisesniffer-reference.json').write_text(json.dumps(report,indent=2)+'\n')
