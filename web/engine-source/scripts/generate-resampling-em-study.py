"""Offline synthetic EM parity study; results stay in .build, no product activation.

Requires unchanged native reference with NumPy1.26.4/OpenCV4.11.0/Matplotlib3.8.4.
"""
from pathlib import Path
import sys,json,hashlib
import numpy as np,cv2 as cv,matplotlib
root=Path(__file__).resolve().parents[1];native=root.parent/'source';sys.path.insert(0,str(native))
from gui.sherloq_app.core.resampling import ResamplingEngine,normalize_gray
assert (np.__version__,cv.__version__,matplotlib.__version__)==('1.26.4','4.11.0','3.8.4')
out=root/'.build/resampling-em';out.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(240006);y,x=np.mgrid[:32,:32]
images=[('random12',rng.uniform(0,1,(12,17))),('random32',rng.uniform(0,1,(32,32))),('gradient',(x+y)/62),('flat',np.zeros((32,32))),('checker',((x+y)%2).astype(float)),('smooth',((x//8+y//8)/6)),('periodic',(np.sin(x*.7)+np.cos(y*.3)+2)/4)]
for seed in range(4):
 for side in [8,16,33,64,128]:
  image=rng.integers(0,256,(side,side+3),dtype=np.uint8);images.append((f'random-{seed}-{side}',normalize_gray(image)))
y,x=np.mgrid[:48,:57]
base=((x+y)*2).astype(np.uint8)
for amplitude in [0,1,2,4,16,64]:
 a=np.clip(base.astype(int)+rng.integers(-amplitude,amplitude+1,base.shape),0,255).astype(np.uint8);images.append((f'gradient-noise-{amplitude}',normalize_gray(a)))
for sigma in [.5,1,2,4]:
 a=rng.integers(0,256,(48,57),dtype=np.uint8);images.append((f'blur-{sigma}',normalize_gray(cv.GaussianBlur(a,(0,0),sigma))))
for interpolation in [cv.INTER_NEAREST,cv.INTER_LINEAR,cv.INTER_CUBIC,cv.INTER_LANCZOS4]:
 a=rng.integers(0,256,(17,21),dtype=np.uint8);images.append((f'resized-{interpolation}',normalize_gray(cv.resize(a,(57,48),interpolation=interpolation))))
for name in ['synthetic.jpg','odd.jpg','quality-model/raw.png','quality-model/constant.png']:
 images.append((name,normalize_gray(cv.imread(str(root/'fixtures'/name),cv.IMREAD_GRAYSCALE))))
for seed in range(5):
 for shape in [(3,3),(4,4),(5,5),(5,9),(6,8),(7,7),(8,8),(9,9),(3,12),(7,4)]:
  images.append((f'boundary-{seed}-{shape[0]}-{shape[1]}',normalize_gray(rng.integers(0,256,shape,dtype=np.uint8))))
records=[]
for index,(name,image) in enumerate(images):
 file=f'{index}.f64';image.astype('<f8').tofile(out/file);results=[]
 for size in [3,5]:
  record=dict(size=size);steps=[]
  try:
   expected=ResamplingEngine(image).probability([0,0,image.shape[1],image.shape[0]],size,progress=lambda n,t:steps.append(n));output=f'{index}-{size}.f64';expected.astype('<f8').tofile(out/output);rgb=matplotlib.colormaps['gray'](expected,bytes=True)[:,:,:3].copy();rgb.tofile(out/f'{index}-{size}.rgb');record.update(file=output,rgbFile=f'{index}-{size}.rgb',iterations=steps[-1],shape=list(expected.shape))
   record['fourier']=[]
   for j,params in enumerate([('hanning',True,False,'simple',4,True),('radial',False,False,'radial',1,False),('hanning',False,True,'simple',.1,False)]):
    try:spectrum=ResamplingEngine(expected).fourier(expected,'map',params)
    except ValueError as e:
     record['fourier'].append(dict(params=dict(zip(['window','upsample','center','highpass','gamma','rescale'],params)),error=str(e)));continue
    prefix=f'{index}-{size}-fourier-{j}';spectrum.astype('<f8').tofile(out/(prefix+'.f64'));matplotlib.colormaps['gray'](spectrum,bytes=True)[:,:,:3].copy().tofile(out/(prefix+'.rgb'));record['fourier'].append(dict(params=dict(zip(['window','upsample','center','highpass','gamma','rescale'],params)),file=prefix+'.f64',rgbFile=prefix+'.rgb',shape=list(spectrum.shape),peak=int(np.argmax(spectrum))))
  except ValueError as e:record['error']=str(e)
  results.append(record)
 records.append(dict(name=name,file=file,shape=list(image.shape),results=results))
initial={}
for p in [8,24]:
 a=np.random.RandomState(0).rand(p);a/=a.sum();initial[p]=a.tolist()
(out/'reference.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256((native/'gui/sherloq_app/core/resampling.py').read_bytes()).hexdigest(),initial=initial,images=records),indent=2)+'\n')
print(len(records))
