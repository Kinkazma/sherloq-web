"""Large synthetic Noisesniffer oracles stored as recipes and checksums."""
from pathlib import Path
import hashlib,json,sys,time
import numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core import noisesniffer as ns
def recipe(w,h):
    rgb=np.empty((h,w,3),np.uint8);state=12929912
    for y in range(h):
        for x in range(w):
            for c in range(3):
                state=(1664525*state+1013904223)&0xffffffff
                rgb[y,x,c]=124+((state>>16)%7) if w*2//5<=x<w//2 and h*2//5<=y<h//2 else 70+(state>>16)%117
    return rgb
def digest(a):return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()
rows=[];rgb=recipe(1024,1024);bgr=np.ascontiguousarray(rgb[:,:,::-1])
for w in [3,8]:
    start=time.perf_counter();stats=ns.statistics(bgr,w);V,S=ns.select(bgr,w,20000,.25,.5,stats)
    all,low=ns.counts(bgr.shape,w,50,V,S);mask,regions=ns.regions(bgr.shape,w,50,.5,all,low);distribution=ns.distribution(bgr,w,V,S)[:,:,::-1]
    overlay=rgb.copy();selected=mask>0;overlay[selected]=(overlay[selected].astype(np.float32)*.55+np.array([255,0,0])*.45).astype(np.uint8)
    row=dict(block=w,parameters=[w,50,20000,.25,.5],statistics={k:digest(a) for k,a in [('valid',stats[0].astype('<u4')),('means',stats[1]),('variance',stats[2])]},arrays={k:digest(a) for k,a in [('selected',V.astype('<u4')),('low_noise',S.astype('<u4')),('all_blocks',all),('low_noise_blocks',low),('mask',mask),('distribution',distribution),('overlay',overlay)]},regions=regions,validCount=len(stats[0]),selectedCount=len(V),lowNoiseCount=len(S),nativeDiagnosticSeconds=time.perf_counter()-start)
    rows.append(row);print(w,row['nativeDiagnosticSeconds'],len(regions),flush=True)
tails=[]
for n in [100000,1000000,10000000]:
    for m in [.01,.1,.3,.5,.9,.99]:
        for k in [int(n*m),min(n,int(n*m)+1),int((n+n*m)/2),n-1,n]:
            v=ns.log_tail(k*9,n*9,3,m);tails.append(dict(K=k*9,N=n*9,w=3,m=m,logTail=v if np.isfinite(v) else '-Infinity'))
report=dict(schema=1,recipe='uint32 LCG1664525+1013904223, high16 modulo117+70; central 10% by 10% patch modulo7+124',seed=12929912,width=1024,height=1024,inputSha256=digest(rgb),cases=rows,tails=tails)
(ROOT/'web-engine/fixtures/noisesniffer-large-reference.json').write_text(json.dumps(report,indent=2)+'\n')
