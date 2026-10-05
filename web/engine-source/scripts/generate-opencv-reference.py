"""Synthetic output oracle for shared OpenCV primitives, never user images."""
from pathlib import Path
from itertools import product
import hashlib,json,sys
import numpy as np
import cv2 as cv
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.color_spaces import SpaceEngine
from gui.sherloq_app.core.noise import NoiseEngine
from gui.sherloq_app.core.gradient import GradientEngine
from gui.sherloq_app.core.adjust import AdjustEngine
from gui.sherloq_app.core.interactive import EchoEngine
OUT=ROOT/'web-engine/fixtures';inputs=json.loads((OUT/'pixel-reference.json').read_text())['cases'];cases=[]
texture=np.random.default_rng(39356).integers(0,256,(129,137,3),dtype=np.uint8);(OUT/'opencv-texture-input.rgb').write_bytes(texture.tobytes())
inputs.append(dict(name='texture',width=137,height=129,file='opencv-texture-input.rgb'))
for fixture in inputs:
 rgb=np.frombuffer((OUT/fixture['file']).read_bytes(),np.uint8).reshape(fixture['height'],fixture['width'],3);bgr=np.ascontiguousarray(rgb[:,:,::-1]);expected=[];raw=bytearray()
 def output(op,params,value):
  data=np.ascontiguousarray(value[:,:,::-1]).tobytes();expected.append(dict(operation=op,params=params,offset=len(raw),length=len(data),sha256=hashlib.sha256(data).hexdigest()));raw.extend(data)
 e=SpaceEngine(bgr)
 for space,count in [('rgb',3),('cmyk',4),('gray',4),('hsv',3),('hls',3),('ycrcb',3),('xyz',3),('lab',3),('luv',3)]:
  for channel in range(count):output('colors.space',dict(space=space,channel=channel),e.compute((space,channel)))
 e=GradientEngine(bgr)
 for intensity,mode,invert,equalize in product((0,33,95,100),range(4),(False,True),(False,True)):output('detail.gradient',dict(intensity=intensity,mode=mode,invert=invert,equalize=equalize),e.compute((intensity,mode,invert,equalize)))
 e=EchoEngine(bgr,backend='cpu')
 for radius,contrast,gray in product(range(1,16),(0,85,100),(False,True)):output('detail.echo',dict(radius=radius,contrast=contrast,grayscale=gray),e.compute((radius,contrast,gray)))
 e=NoiseEngine(bgr,backend='cpu')
 for mode,radius,gray in product(range(5),(1,2,10),(False,True)):
  for sigma in ((3,50,200) if mode==3 else (3,)):
   for denoised,levels in ((True,32),(False,0),(False,32),(False,255)):
    output('noise.separation',dict(mode=mode,radius=radius,sigma=sigma,grayscale=gray,denoised=denoised,levels=levels),e.compute((mode,radius,sigma,gray,denoised,levels)))
 e=AdjustEngine(bgr);defaults=dict(brightness=0,saturation=0,hue=0,gamma=10,shadows=0,highlights=0,sweep=127,width=255,sharpen=0,threshold=255,equalize=0,invert=False)
 changes=[{}]
 for key,values in [('brightness',(-255,-31,35,255)),('saturation',(-255,-50,70,255)),('hue',(1,90,180)),('gamma',(1,3,11,25,50)),('shadows',(-100,-30,50,100)),('highlights',(-100,-30,50,100)),('sharpen',(4,28,100)),('threshold',(0,127,254)),('equalize',(1,2,3,4,5)),('invert',(True,))]:
  changes.extend({key:value}for value in values)
 changes.extend(dict(sweep=sweep,width=width)for sweep,width in product((0,127,255),(0,1,64,254)))
 changes.extend([dict(brightness=23,saturation=-17,hue=180,gamma=11,shadows=-25,highlights=30,sharpen=20,equalize=3,threshold=127,invert=True),dict(gamma=3,sweep=23,width=77,shadows=12,highlights=-30,sharpen=100)])
 for changed in changes:
  p={**defaults,**changed};output('inspection.adjust',p,e.compute(tuple(p.values())))
 file='opencv-'+fixture['name']+'.rgb';(OUT/file).write_bytes(raw)
 cases.append(dict(name=fixture['name'],width=fixture['width'],height=fixture['height'],file=fixture['file'],outputFile=file,expected=expected))
 print(fixture['name'],len(expected),flush=True)
sources={}
for n in ('color_spaces','noise','gradient','adjust','interactive','utility'):
 p='source/gui/sherloq_app/core/'+n+'.py';sources[p]=hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
(OUT/'opencv-reference.json').write_text(json.dumps(dict(schema=1,source='existing synthetic pixel fixtures',opencv=cv.__version__,sources=sources,cases=cases),separators=(',',':'))+'\n')
