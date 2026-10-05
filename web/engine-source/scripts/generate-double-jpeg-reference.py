from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.double_jpeg import analyze,histogram_evidence,lattice
OUT=ROOT/'web-engine/fixtures';rng=np.random.default_rng(47821);cases=[]
# Every image is generated here. Include all quality directions, odd/cropped
# dimensions, grayscale, progressive, flat images and stored-coefficient tails.
for name,width,height,mode,qualities,progressive,subsampling in [
 ('single',512,512,'RGB',[90],False,2),('double-up',512,512,'RGB',[55,95],False,2),
 ('double-down',512,512,'RGB',[95,55],False,2),('same',512,512,'RGB',[75,75],False,2),
 ('triple',512,512,'RGB',[50,75,95],False,2),('odd',519,509,'RGB',[45,96],False,0),
 ('progressive',512,512,'RGB',[55,95],True,2),('gray',512,512,'L',[50,95],False,0),
 ('flat',512,512,'RGB',[50,95],False,2),('tiny',7,5,'RGB',[95],False,2),
 ('coarse',259,263,'RGB',[1],False,2),('tails',512,512,'L',[100],False,0),
 ('orientation6',257,129,'RGB',[80],False,2)]:
 shape=(height,width,3) if mode=='RGB' else (height,width);array=rng.integers(0,256,shape,np.uint8)
 if name=='flat':array.fill(127)
 if name=='tails':array=(np.indices(shape).sum(axis=0)%2*255).astype(np.uint8)
 image=Image.fromarray(array,mode);file='double-jpeg-'+name+'.jpg';path=OUT/file
 for quality in qualities:
  opts=dict(quality=quality,subsampling=subsampling,progressive=progressive)
  if name=='orientation6':exif=Image.Exif();exif[274]=6;opts['exif']=exif
  image.save(path,**opts);image=Image.open(path).copy()
 report=analyze(path);report.pop('seconds');cases.append(dict(name=name,file=file,qualities=qualities,expected=report));print(name,report['verdict'],report['supporting_frequencies'],flush=True)
# Independent histogram cases exercise all q2 candidate boundaries and near-threshold
# lattice gap scores, including unsupported/insufficient distributions.
histograms=[]
for q2 in [*range(1,66),128,255]:
 for kind in ['zero','flat','random','lattice','near-threshold']:
  h=np.zeros(256,np.int64) if kind=='zero' else (np.full(256,50,np.int64) if kind=='flat' else rng.integers(0,500,256,dtype=np.int64))
  if kind in ('lattice','near-threshold'):
   q1=max(3,q2*3);allowed=lattice(q1,q2);h[~allowed]=0 if kind=='lattice' else 10
  histograms.append(dict(q2=q2,kind=kind,histogram=h.tolist(),expected=histogram_evidence(h,q2)))
(OUT/'double-jpeg-reference.json').write_text(json.dumps(dict(schema=1,sourceSha256=hashlib.sha256((ROOT/'source/gui/sherloq_app/core/double_jpeg.py').read_bytes()).hexdigest(),cases=cases,histograms=histograms),indent=2)+'\n')
