from pathlib import Path
import argparse,sys,json
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--native-gui',type=Path,required=True);args=p.parse_args();sys.dont_write_bytecode=True;sys.path[:0]=[str(args.native_gui),str(args.native_gui.parent)]
from sherloq_app.core import dense_copy
from sherloq_app.core.dense_links import sample_unique_links
out=Path(__file__).resolve().parents[1]/'.build/dense-correspondences-reference';out.mkdir(parents=True,exist_ok=True)
w,h=120,96;image=np.zeros((h,w,3),np.uint8);captured=[]
def features(image,method,patch,flip):
 height,width=image.shape[:2];border=3*patch if method else 0;a=np.zeros((height-border,width-border,128 if method else 12),np.float32);return a,a,1.5*patch if method else 0.
def field(first,second,mask,radius,minimum,iterations=8,compare=False,**kwargs):
 shape=mask.shape;ids=np.flatnonzero(mask);target=np.full(mask.size,-1,np.int32);squared=np.full(mask.size,np.inf,np.float32)
 for i,index in enumerate(ids):
  candidates=np.flatnonzero(mask.ravel()&(2 if mask.ravel()[index]&1 else 1)) if compare else ids
  if len(candidates):target[index]=candidates[(i+len(candidates)//3)%len(candidates)];squared[index]=.002+(int(index)%17)*.0002
 captured.append(mask.copy());return target.reshape(shape),squared.reshape(shape),len(ids)*13
dense_copy.features=features;dense_copy.field=field
poly=lambda a,b,c,d:((a,b),(c,b),(c,d),(a,d))
records=[]
for method in [0,1]:
 for name,regions,compare,guides,gap in [('global',(),False,(),(0.,0.)),('overlap',(poly(9,10,52,66),)*2,False,(),(0.,0.)),('compare',(poly(5,8,40,66),poly(66,8,110,66)),True,(),(25.25,-.5)),('compact',(),False,(poly(5,3,42,86),poly(70,3,113,86)),(0.,0.))]:
  captured.clear();algorithm=dense_copy.METHODS[method];engine=dense_copy.DenseCopyEngine(image);jobs=1 if compare or not regions else len(regions)
  result=engine.analyze(algorithm,101,600.,2.,.3,regions,compare,(5,1,False,0.),lambda:False,lambda *args:None,gap=gap,guides=guides,storage_modes=['ram']*jobs)
  stem=f'{method}-{name}';expected={}
  for key in ['points','pairs','members']:
   a=result[key].astype(np.uint8) if key=='members' else result[key];a.tofile(out/f'{stem}-{key}');expected[key]=dict(file=f'{stem}-{key}',shape=a.shape,dtype=str(a.dtype))
  fields=[]
  for i,m in enumerate(result['dense_maps']):
   allowed=captured[min(i,len(captured)-1)]
   files={};rows,total=sample_unique_links(m['targets'],m['distances_squared'],m['consistent_mask'],max(1,101//jobs))
   for key,array in [('targets',m['targets']),('distancesSquared',m['distances_squared']),('allowed',allowed),('selected',m['consistent_mask'].astype(np.uint8)),('displayRows',rows.astype(np.int32))]:
    file=f'{stem}-{i}-{key}';array.tofile(out/file);files[key]=file
   fields.append(dict(width=m['targets'].shape[1],height=m['targets'].shape[0],shift=m['shift'],origin=m['origin'],uniqueLinks=total,comparisons=int((allowed>0).sum())*13,files=files))
  records.append(dict(method=method,name=name,width=w,height=h,regions=regions,compare=compare,guides=guides,gap=gap,fields=fields,expected=expected,denseCount=result['dense_count'],consistentCount=result['dense_consistent_count']))
(out/'manifest.json').write_text(json.dumps(records)+'\n');print(len(records),'native correspondence recipes')
