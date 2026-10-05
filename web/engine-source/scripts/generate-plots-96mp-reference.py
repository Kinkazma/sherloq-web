from pathlib import Path
import sys,json,hashlib,time
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import cv2 as cv,numpy as np
from sherloq_app.core.interactive import PlotEngine
root=Path(__file__).resolve().parents[1];out=root/'.build/plots-96mp';out.mkdir(exist_ok=True);source=root/'.build/dense-96mp/copy-6000.jpg';started=time.monotonic();engine=PlotEngine(cv.imread(str(source)));cases=[]
for scale in [1,2]:
 values=engine.compute(scale);np.save(out/f'native-values-{scale}.npy',values);cases.append({'scale':scale,'count':len(values),'sha256':hashlib.sha256(values.tobytes()).hexdigest()});print(cases[-1],flush=True)
(out/'reference.json').write_text(json.dumps({'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'cases':cases,'nativeSeconds':time.monotonic()-started},indent=2)+'\n')
