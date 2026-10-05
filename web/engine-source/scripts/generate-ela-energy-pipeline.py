"""Actual native ELA engine followed by energy-only segmentation on generated originals."""
from pathlib import Path
import sys,json,gzip,hashlib,numpy as np,cv2 as cv
from PIL import Image
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_biomes import ElaBiomeEngine
from gui.sherloq_app.core.ela_energy import segment_energy
cv.setNumThreads(2)
out=root/'fixtures/ela-energy';originals=out/'originals';originals.mkdir(exist_ok=True);rng=np.random.default_rng(280011);payload=bytearray();cases=[];sources=[]
def put(data):
 while len(payload)%4:payload.append(0)
 raw=data.tobytes();part=dict(offset=len(payload),length=len(raw));payload.extend(raw);return part
specs=[('flat',160,160,'png'),('noise',161,163,'jpeg'),('composite',259,193,'png'),('panels',513,385,'jpeg'),('noise-alpha',257,193,'png'),('gradient16',257,193,'tiff'),('oriented',257,193,'jpeg'),('custom-tables',259,193,'jpeg'),('large-panels',1031,1024,'png')]
for kind,w,h,format in specs:
 a=rng.integers(0,256,(h,w,3),dtype=np.uint8)
 if kind=='flat':a[:]=128
 if kind in ['composite','panels','large-panels']:
  a[:,w//3:2*w//3]=cv.GaussianBlur(a[:,w//3:2*w//3],(7,7),0);a[h//3:2*h//3,:w//3]=100
 if 'panels' in kind:a[:5]=255;a[-5:]=255;a[:,:5]=255;a[:,-5:]=255;a[:,w//2-3:w//2+3]=255
 name=kind+('.jpg' if format=='jpeg' else '.tif' if format=='tiff' else '.png');path=originals/name
 if kind=='noise-alpha':cv.imwrite(str(path),np.concatenate([a,rng.integers(0,256,(h,w,1),dtype=np.uint8)],axis=2))
 elif kind=='gradient16':cv.imwrite(str(path),(a.astype(np.uint32)*257+np.arange(w,dtype=np.uint32)[None,:,None]).astype(np.uint16))
 elif kind in ['oriented','custom-tables']:
  im=Image.fromarray(cv.cvtColor(a,cv.COLOR_BGR2RGB));kw=dict(quality=83,subsampling=2)
  if kind=='oriented':exif=Image.Exif();exif[274]=6;kw['exif']=exif
  else:
   temporary=root/'.build/ela-energy-custom-table.jpg';im.save(temporary,**kw);tables=Image.open(temporary).quantization;kw.pop('quality');kw['qtables']={key:[min(255,x+(2 if i%7==0 else 0)) for i,x in enumerate(value)] for key,value in tables.items()}
  im.save(path,**kw)
 else:cv.imwrite(str(path),a,[cv.IMWRITE_JPEG_QUALITY,83,cv.IMWRITE_JPEG_PROGRESSIVE,1] if format=='jpeg' else [])
 image=cv.imread(str(path),cv.IMREAD_COLOR);h,w=image.shape[:2];engine=ElaBiomeEngine(image,str(path));source=dict(name=kind,file='originals/'+name,width=w,height=h,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),pixels=put(cv.cvtColor(image,cv.COLOR_BGR2RGB)));sources.append(source)
 params=[dict(profile='standard',block=16,quality=0,minimum=3),dict(profile='manual',block=16,quality=75,minimum=1,histogramLow=100,histogramHigh=900,shadow=20,highlight=20),dict(profile='manual',block=16,quality=1,minimum=1,histogramLow=500,histogramHigh=500,shadow=0,highlight=0),dict(profile='manual',block=16,quality=100,minimum=1,histogramLow=0,histogramHigh=1000,shadow=1,highlight=200),dict(profile='sensitive',block=32,quality=75,minimum=1),dict(profile='conservative',block=32,quality=0,minimum=1)]
 if kind=='large-panels':params=params[:2]+params[-1:]
 for index,p in enumerate(params):
  default=dict(quality=0,block=32,minimum=3,profile='standard',histogramLow=10,histogramHigh=990,shadow=50,highlight=50);default.update(p);p=default;adaptive=p['profile'] in ['sensitive','conservative'];quantiles=[p['histogramLow']/1000,p['histogramHigh']/1000]
  base=engine.prepare(p['block'],p['quality'],energy=True,energy_quantiles=quantiles,energy_auto=adaptive,energy_auto_profile=p['profile'] if adaptive else 'sensitive')
  energy=base['metadata']['energy'];thresholds=energy['automatic']['thresholds'] if adaptive else [p['shadow']/10,p['highlight']/10];labels,regions=segment_energy(base,0,p['minimum'],energy_thresholds=thresholds)
  row=dict(name=kind+'-'+str(index),source=kind,params=p,summary=base['energy_summary'],regions=regions,metadata={key:base['metadata'][key] for key in ['quality','quality_origin','table_deviation','qualities','requested_block','block','image_shape','valid_shape']},automatic=energy['automatic'],quantiles=energy['quantiles'],thresholds=thresholds,energy_labels=put(labels.astype('<i4')))
  for key in ['energy_planes','energy_low_score','energy_high_score','energy_scope']:row[key]=put(base[key].astype('<i4' if key=='energy_scope' else '<f4'))
  cases.append(row);print(row['name'],len(regions),'regions',flush=True)
compressed=gzip.compress(payload,compresslevel=9,mtime=0);file='pipeline.bin.gz';(out/file).write_bytes(compressed);sha=lambda b:hashlib.sha256(b).hexdigest();native={name:sha((root.parent/'source/gui/sherloq_app/core'/name).read_bytes()) for name in ['ela_biomes.py','ela_energy.py','ela_energy_auto.py','jpeg.py']};report=dict(schema=1,scope='Full original decoding and native ElaBiomeEngine.prepare energy path, then energy-only segmentation without legacy region-id offset. Generated originals only.',seed=280011,opencv=cv.__version__,numpy=np.__version__,native=native,payload=dict(file=file,bytes=len(payload),compressedBytes=len(compressed),sha256=sha(payload),compressedSha256=sha(compressed)),sources=sources,cases=cases)
(out/'pipeline.json').write_text(json.dumps(report,indent=2)+'\n');print(len(cases),'full native cases,',len(compressed),'compressed bytes')
