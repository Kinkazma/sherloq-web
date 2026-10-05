"""Regenerate full 1 MP Fourier vectors in .build from a public synthetic JPEG.

The large numerical arrays stay outside the source ZIP; this generator and the
aggregate proof are public. No private image is needed to reproduce them.
"""
from pathlib import Path
import hashlib,json,sys
import cv2 as cv,numpy as np,matplotlib
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT.parent/'source'))
from gui.sherloq_app.core.resampling import ResamplingEngine,normalize_gray
assert (np.__version__,cv.__version__,matplotlib.__version__)==('1.26.4','4.11.0','3.8.4')
out=ROOT/'.build/resampling-large';out.mkdir(parents=True,exist_ok=True)
file='median/median-1024.jpg';gray=cv.imread(str(ROOT/'fixtures'/file),cv.IMREAD_GRAYSCALE);engine=ResamplingEngine(normalize_gray(gray));cases=[]
for i,params in enumerate([('hanning',True,False,'simple',4,True),('radial',False,True,'radial',.1,False),('hanning',False,False,'simple',1,True)]):
 values=engine.fourier(engine.gray,'whole',params);rgb=matplotlib.colormaps['gray'](values,bytes=True)[:,:,:3].copy();values.astype('<f8').tofile(out/f'{i}.f64');rgb.tofile(out/f'{i}.rgb')
 cases.append(dict(params=dict(zip(['window','upsample','center','highpass','gamma','rescale'],params)),shape=list(values.shape),valuesFile=f'{i}.f64',rgbFile=f'{i}.rgb',rgbSha256=hashlib.sha256(rgb.tobytes()).hexdigest(),peak=int(np.argmax(values))))
record=dict(schema=1,file=file,source='Public generated synthetic 1 MP JPEG',originalSha256=hashlib.sha256((ROOT/'fixtures'/file).read_bytes()).hexdigest(),nativeSourceSha256=hashlib.sha256((ROOT.parent/'source/gui/sherloq_app/core/resampling.py').read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv.__version__,matplotlib=matplotlib.__version__,cases=cases)
(out/'reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(cases=len(cases),sourceShape=list(gray.shape))))
