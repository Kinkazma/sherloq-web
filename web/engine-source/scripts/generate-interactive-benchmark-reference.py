from pathlib import Path
import sys,json,hashlib,cv2 as cv,numpy as np
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.interactive import WaveletEngine,PlotEngine
from gui.sherloq_app.core.pca import PcaEngine
from gui.sherloq_app.core.wavelet_blocking import WaveletBlockingEngine
OUT=ROOT/'web-engine/fixtures';file=OUT/'bench-1024.jpg';bgr=cv.imread(str(file));cases=[]
hash=lambda a:hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()
for operation in ['detail.wavelets','colors.pca','colors.plots','noise.blocking']:
 engine={'detail.wavelets':WaveletEngine,'colors.pca':PcaEngine,'colors.plots':PlotEngine,'noise.blocking':lambda image:WaveletBlockingEngine(file,image)}[operation](bgr)
 for change in [False,True]:
  if operation=='detail.wavelets':
   params=dict(wavelet='db8',threshold=37 if change else 0,level=2,mode='garrote');result=engine.compute(tuple(params.values()));e=dict(pixels=hash(result[:,:,::-1]))
  elif operation=='colors.pca':
   params=dict(component=2 if change else 0,mode='project',invert=False,equalize=False);result,model=engine.compute(tuple(params.values()));e=dict(pixels=hash(result[:,:,::-1]),model=[hash(a) for a in model])
  elif operation=='colors.plots':
   params=dict(scale=1,x=0 if change else 3,y=1 if change else 4,z=2 if change else 5,colored=True,alpha=.37,kind='3d');r=engine.prepare_plot(tuple(params.values()));e=dict(values=hash(r['data']),positions=hash(r['positions']),colors=hash(r['colors']))
  else:
   params=dict(block=16 if change else 8);image,noise=engine.compute(params['block']);e=dict(pixels=hash(image[:,:,::-1]),noise=hash(noise))
  cases.append(dict(operation=operation,change=change,params=params,expected=e))
(OUT/'interactive-benchmark-reference.json').write_text(json.dumps(dict(schema=1,file=file.name,width=bgr.shape[1],height=bgr.shape[0],cases=cases),indent=2)+'\n');print(len(cases),'1 MP native interactive views')
