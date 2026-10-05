from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv,pywt
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.wavelet_blocking import WaveletBlockingEngine
OUT=ROOT/'web-engine/fixtures';inputs=[]
for f in json.loads((OUT/'pixel-reference.json').read_text())['cases']:
 inputs.append({k:f[k] for k in ('name','width','height','file')})
inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'))
for ref in ['metadata-reference.json','image-codec-reference.json','quality-reference.json']:
 for f in json.loads((OUT/ref).read_text())['cases']:
  if f.get('nativeError'):continue
  inputs.append(dict(name=f['file'],file=f['file'],encoded=True))
cases=[]
for f in inputs:
 filename=OUT/f['file'];bgr=cv.imread(str(filename)) if f.get('encoded') else np.frombuffer(filename.read_bytes(),np.uint8).reshape(f['height'],f['width'],3)[:,:,::-1].copy()
 f['width'],f['height']=bgr.shape[1],bgr.shape[0];engine=WaveletBlockingEngine(filename,bgr);detail=engine.detail();expected=[]
 for block in range(1,min(100,*detail.shape)+1):
  image,noise=engine.compute(block);expected.append(dict(params=dict(block=block),sha256=hashlib.sha256(image[:,:,::-1].copy().tobytes()).hexdigest(),rows=noise.shape[0],cols=noise.shape[1],noise=noise.ravel().tolist()))
 gray=cv.imread(str(filename),cv.IMREAD_GRAYSCALE) if f.get('encoded') else cv.cvtColor(bgr,cv.COLOR_BGR2GRAY)
 cases.append({**f,'sourceMode':engine.source_mode,'graySha256':hashlib.sha256(gray.tobytes()).hexdigest(),'detailShape':list(detail.shape),'detailSha256':hashlib.sha256(detail.tobytes()).hexdigest(),'expected':expected});print(f['name'],len(expected),flush=True)
p='source/gui/sherloq_app/core/wavelet_blocking.py';(OUT/'blocking-reference.json').write_text(json.dumps(dict(schema=1,source=p,sha256=hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),opencv=cv.__version__,pywavelets=pywt.__version__,cases=cases),separators=(',',':'))+'\n');print(sum(len(f['expected']) for f in cases),'blocking outputs')
