"""Generated native weak/strong-mask and class-colour oracle. No private inputs."""
from pathlib import Path
import sys,json,gzip,hashlib,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_energy import segment_energy,energy_color
out=root/'fixtures/ela-energy';payload=bytearray();cases=[]
def put(data):
 while len(payload)%4:payload.append(0)
 raw=data.tobytes();part=dict(offset=len(payload),length=len(raw));payload.extend(raw);return part
def record(name,base,thresholds,minimum,offset=0):
 h,w=base['energy_scope'].shape;labels,regions=segment_energy(base,0,minimum,offset=offset,energy_thresholds=thresholds)
 row=dict(name=name,width=w,height=h,block=base['metadata']['block'],thresholds=thresholds,minimum=minimum,offset=offset,summary=base['energy_summary'],regions=regions,labels=put(labels.astype('<i4')))
 for key in ['energy_scope','energy_low_score','energy_high_score','energy_allowed']:
  if key in base:row[key]=put(base[key].astype('<i4' if key=='energy_scope' else 'u1' if key=='energy_allowed' else '<f4'))
 cases.append(row)
ref=json.loads((out/'preparation.json').read_text());original=gzip.decompress((out/ref['payload']['file']).read_bytes())
for ri,row in enumerate(ref['cases']):
 base={'energy_summary':row['summary'],'metadata':{'block':[1,2,8,16][ri%4]}}
 for key in ['energy_scope','energy_low_score','energy_high_score']:
  part=row[key];base[key]=np.frombuffer(original,offset=part['offset'],count=part['length']//4,dtype='<i4' if key=='energy_scope' else '<f4').reshape(row['height'],row['width'])
 for ts in [[0,0],[1,2],[5,5],[50,50]]:record('prepared-'+row['name']+'-'+str(ts),base,ts,1,ri%3)
rng=np.random.default_rng(280009)
for shape in [(3,7),(17,19),(32,35),(129,131)]:
 h,w=shape;y,x=np.indices(shape);scope=np.ones(shape,np.int32);scope[:,w//2]=0;scope[:,w//2+1:]=2
 summary=[dict(id=1,bbox=[0,0,w//2,h]),dict(id=2,bbox=[w//2+1,0,w,h])]
 for pattern in ['islands','diagonal','holes','boundary','noise','overlap']:
  low=np.zeros(shape,np.float32);high=np.zeros(shape,np.float32)
  if pattern=='islands':low[(x%8<3)&(y%8<3)]=6;low[(x%8<4)&(y%8<4)&(low==0)]=3;high[(x%8>=5)&(y%8>=5)]=9
  elif pattern=='diagonal':low[x%h==y]=5;high[(x+2)%h==y]=5
  elif pattern=='holes':low[:]=5;low[(x%5==2)&(y%5==2)]=0;high[(x+y)%3==0]=8
  elif pattern=='boundary':
   values=np.asarray([0,np.nextafter(np.float32(0),np.float32(1)),np.nextafter(np.float32(2.55),np.float32(0)),np.float32(2.55),np.nextafter(np.float32(2.55),np.float32(3)),np.nextafter(np.float32(5.1),np.float32(0)),np.float32(5.1),np.nextafter(np.float32(5.1),np.float32(6))],np.float32)
   low[:]=values[(x+y)%len(values)];high[:]=values[(x+3*y)%len(values)]
  elif pattern=='noise':low[:]=rng.uniform(0,10,shape).astype(np.float32);high[:]=rng.uniform(0,10,shape).astype(np.float32)
  else:low[:]=5;high[:]=6
  for block in [1,2,4]:
   base=dict(energy_low_score=low,energy_high_score=high,energy_scope=scope,energy_summary=summary,metadata=dict(block=block))
   if pattern in ['holes','overlap']:base['energy_allowed']=((x%7!=3)|(y%7!=3))
   for ts,minimum in [([0,0],1),([5.1,5.1],1),([5,6],2.5),([10,0],0)]:record(f'{pattern}-{w}-{h}-{block}-{ts}-{minimum}',base,ts,minimum,offset=7)
colors=[dict(region=dict(energy_region=i,kind=kind),rgb=list(energy_color(dict(energy_region=i,kind=kind)))[::-1]) for i in range(1,257) for kind in ['low','high']]
compressed=gzip.compress(payload,compresslevel=9,mtime=0);file='segmentation.bin.gz';(out/file).write_bytes(compressed);sha=lambda b:hashlib.sha256(b).hexdigest()
report=dict(schema=1,scope='Prepared synthetic scores and constructed mask-boundary cases; segmentation only, not full codec-to-mask API',seed=280009,opencv=cv.__version__,numpy=np.__version__,nativeSha256=sha((root.parent/'source/gui/sherloq_app/core/ela_energy.py').read_bytes()),payload=dict(file=file,bytes=len(payload),compressedBytes=len(compressed),sha256=sha(payload),compressedSha256=sha(compressed)),cases=cases,colors=colors)
(out/'segmentation.json').write_text(json.dumps(report,indent=2)+'\n');print(len(cases),'cases,',len(colors),'colours,',len(compressed),'compressed bytes')
