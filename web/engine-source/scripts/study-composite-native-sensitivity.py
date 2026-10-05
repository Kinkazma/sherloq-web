"""Development-only: unchanged native statistics under BLAS thread settings.

No perturbation, reference injection, model change or product calibration. Reads
existing fixtures and native sources; writes only this worktree's proof.
"""
import os
os.environ.setdefault('PYTHONDONTWRITEBYTECODE', '1')
from pathlib import Path
import sys,json,time,hashlib
import numpy as np
from threadpoolctl import threadpool_limits,threadpool_info
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root.parent/'source/gui'))
from noiseprint.post_em import getSpamFromNoiseprint,EMgu_img
from noiseprint.noiseprint_blind import genMappUint8
import scipy,cv2 as cv

def errors(a,b):
    d=np.abs(a.astype(np.float64)-b.astype(np.float64))
    return dict(max=float(d.max()),mean=float(d.mean()),different=int(np.count_nonzero(d)))

records=[]
for directory,filename in [('composite-small-singular','reference.json'),('composite','chain-reference.json'),('composite','reference.json')]:
    base=root/'.build'/directory;ref=json.loads((base/filename).read_text())
    def read(name):
        f=ref['files'][name]
        return np.fromfile(base/f['file'],dtype=f['dtype']).reshape(f['shape'])
    gray=read('gray') if 'gray' in ref['files'] else cv.cvtColor(read('rgb'),cv.COLOR_RGB2GRAY).astype(np.float32)/255
    noise=read('noise');spam,valid,r0,r1,imgsize=getSpamFromNoiseprint(noise,gray)
    expectedMap,expectedRaster=read('map'),read('raster');first=None;runs=[]
    for threads in [1,2,4]:
        start=time.perf_counter()
        with threadpool_limits(limits=threads,user_api='blas'):
            m,other=EMgu_img(spam,valid,extFeat=range(32),seed=0,maxIter=100,replicates=10,outliersNlogl=42,workers=1)
            raster=genMappUint8(m,valid,r0,r1,imgsize)
        row=dict(threads=threads,seconds=time.perf_counter()-start,mapVsStored=errors(m,expectedMap),rasterVsStored=errors(raster,expectedRaster),mapSha256=hashlib.sha256(m.tobytes()).hexdigest(),rasterSha256=hashlib.sha256(raster.tobytes()).hexdigest())
        if first is None:first=(m,raster,other)
        else:
            row['mapVsOneThread']=errors(m,first[0]);row['rasterVsOneThread']=errors(raster,first[1]);row['sigmaVsOneThread']=errors(other['Sigma'],first[2]['Sigma'])
        runs.append(row);print(directory,filename,row,flush=True)
    records.append(dict(case=directory+'/'+filename,shape=list(spam.shape),valid=int(valid.sum()),runs=runs))
report=dict(numpy=np.__version__,scipy=scipy.__version__,blas=threadpool_info(),records=records,scope='Unchanged native EMgu_img and exact native residual, only BLAS thread count varies. Same seed, 32 PCA components, ten replicates, regularizer and max iterations. Numerical sensitivity, not a browser parity claim.')
report['nativeSources']={name:hashlib.sha256((root.parent/'source/gui/noiseprint'/name).read_bytes()).hexdigest() for name in ['post_em.py','utility/gaussianMixture.py','noiseprint_blind.py']}
report['passed']=all(r['runs'][1]['mapVsStored']['max']==0 and r['runs'][1]['rasterVsStored']['max']==0 for r in records) and all(r['runs'][0]['rasterVsStored']['max']>0 for r in records[:2]) and all(r['rasterVsStored']['max']==0 for r in records[2]['runs'])
report['passMeaning']='Native reference reproduced exactly at two BLAS threads; native thread sensitivity established for both ill-conditioned cases, stable displayed control. Not browser parity or a change to regularization.'
(root/'docs/composite-native-sensitivity-proof.json').write_text(json.dumps(report,indent=2)+'\n')
