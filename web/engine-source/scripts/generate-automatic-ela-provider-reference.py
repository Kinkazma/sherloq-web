"""Real native global ELA preparation plus selected complete-analysis entries."""
from pathlib import Path
import sys,json,hashlib,tempfile,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_biomes import ElaBiomeEngine
from gui.sherloq_app.core.complete_analysis import ela_entries
from gui.sherloq_app.core.automatic_clones import export
cv.setNumThreads(1);w,h=176,160;y,x=np.indices((h,w));rgb=np.stack([(x*3+y*5+((x//32+y//32)%3)*40)%256,(x*7+y*2)%256,(x*2+y*11)%256],axis=-1).astype(np.uint8);image=rgb[:,:,::-1].copy();(root/'tests/data/automatic-ela-provider.rgb').write_bytes(rgb.tobytes())
base=ElaBiomeEngine(image).prepare(16,0,ghost=False,background=True,energy=True,energy_quantiles=(.01,.99))
regions=[[[2.5,1.5],[w-1,12.5],[w-20,h-1],[5,h-4]]];excluded=[[[40,40],[60,40],[60,65],[40,65]]]
entries,selected=ela_entries(base,2,1,regions,excluded,image.shape,energy_thresholds=[2,2])
def sha(a):return hashlib.sha256(a.tobytes()).hexdigest()
def clean(x):
 if isinstance(x,np.ndarray):return x.tolist()
 if isinstance(x,np.generic):return x.item()
 raise TypeError(type(x))
fields={}
for key,a in base.items():
 if not isinstance(a,np.ndarray):continue
 if a.dtype.kind=='b':a=a.astype(np.uint8)
 fields[key]=dict(shape=list(a.shape),dtype=a.dtype.str,sha256=sha(a))
 if key=='content':fields[key]['values']=a.flatten().tolist()
records=[]
for entry in entries:
 e=dict(entry)
 if 'pixel_mask' in e:a=e['pixel_mask'];e['pixel_mask']=dict(width=a.shape[1],height=a.shape[0],sha256=sha(a))
 records.append(e)
def archive_arrays(value):
 with tempfile.TemporaryDirectory(dir=root/'.build') as folder:
  target=Path(folder)/'native.npz';export((str(target),dict(results=dict(ela=value))))
  with np.load(target,allow_pickle=False) as archive:
   return {k:dict(dtype=archive[k].dtype.str,shape=list(archive[k].shape),sha256=sha(archive[k])) for k in archive.files if k!='metadata_json'}
cell_base=ElaBiomeEngine(image).prepare(16,0,ghost=False,background=False,energy=False)
_,cell_selected=ela_entries(cell_base,2,1,regions,excluded,image.shape)
(root/'tests/data/automatic-ela-provider-native.json').write_text(json.dumps(dict(archiveArrays=archive_arrays(selected),cellOnlyArchiveArrays=archive_arrays(cell_selected),decoded_bgr8_sha256=sha(image),width=w,height=h,params=dict(block=16,quality=0,ghost=False,background=True),regions=regions,excluded=excluded,fields=fields,energy_summary=base['energy_summary'],entries=records,labelsSha256=sha(selected['labels']),energyLabelsSha256=sha(selected['energy_labels'])),default=clean,indent=2)+'\n');print(len(fields),'native prepared arrays,',len(entries),'selected entries')
