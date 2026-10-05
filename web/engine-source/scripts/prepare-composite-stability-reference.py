"""Prepare frozen synthetic native references, no neural inference repeated."""
from pathlib import Path
import sys,json,zipfile,hashlib
import numpy as np
root=Path(__file__).resolve().parents[1];out=root/'.build/composite-stability';out.mkdir(exist_ok=True)
lot=Path(sys.argv[1]);native=out/'python';native.mkdir(exist_ok=True)
with zipfile.ZipFile(root/'.build/pyodide/noiseprint-statistics.zip') as z:z.extractall(native)
sys.path.insert(0,str(native))
from noiseprint.post_em import getSpamFromNoiseprint,EMgu_img
from noiseprint.noiseprint_blind import genMappUint8
cases=[]
for name in ['singular-small','singular-chain','well-conditioned']:
 f=np.load(lot/'tests/f32-stability/fixtures'/(name+'.npz'));expected=np.load(lot/'tests/f32-stability/fixtures'/(name+'-stable.npz'));spam,valid,r0,r1,size=getSpamFromNoiseprint(f['noise'],f['gray']);m,meta=EMgu_img(spam,valid,workers=1)
 assert np.array_equal(m,expected['map']),name
 values={**dict(expected), 'gray':f['gray'],'noise':f['noise'],'valid':valid.astype(np.uint8),'range0':r0,'range1':r1};files={}
 for k,a in values.items():
  file=name+'-'+k+'.bin';a.tofile(out/file);files[k]=dict(file=file,shape=list(a.shape),dtype=str(a.dtype))
 cases.append(dict(name=name,height=int(size[0]),width=int(size[1]),files=files,statistics_policy=meta['statistics_policy'],covariance_regularizations=meta['covariance_regularizations'],pca_regularized_components=meta['pca_regularized_components']))
(out/'reference.json').write_text(json.dumps(dict(cases=cases,policy='covariance-floor-v1',source='Frozen public native stability delivery 2026-10-01; 2 BLAS threads'),indent=2)+'\n')
print([(c['name'],c['width'],c['height']) for c in cases])
