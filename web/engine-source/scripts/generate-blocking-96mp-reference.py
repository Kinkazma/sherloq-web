from pathlib import Path
import sys,json,hashlib,time
sys.dont_write_bytecode=True
sys.path[:0]=['/Users/gaeldauchy/SHERLOQ/source/gui','/Users/gaeldauchy/SHERLOQ/source']
import cv2,numpy as np
from sherloq_app.core.wavelet_blocking import WaveletBlockingEngine
root=Path(__file__).resolve().parents[1];source=root/'.build/dense-96mp/copy-6000.jpg';out=root/'.build/blocking-96mp';out.mkdir(exist_ok=True);image=cv2.imread(str(source));engine=WaveletBlockingEngine(source,image);started=time.monotonic();cases=[]
for block in [8,16]:
 display,noise=engine.compute(block);digest=hashlib.sha256()
 for row in display:digest.update(row[:,::-1].tobytes())
 cases.append({'params':{'block':block},'sha256':digest.hexdigest(),'noiseSha256':hashlib.sha256(noise.astype('<f8').tobytes()).hexdigest(),'noiseShape':list(noise.shape),'minimum':float(noise.min()),'maximum':float(noise.max())});print(block,cases[-1],flush=True)
ref={'sourceSha256':hashlib.file_digest(source.open('rb'),'sha256').hexdigest(),'width':12000,'height':8000,'sourceMode':engine.source_mode,'cases':cases,'nativeSeconds':time.monotonic()-started};(out/'reference.json').write_text(json.dumps(ref,indent=2)+'\n')
