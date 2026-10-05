"""Read public browser archives with NumPy and check every exported FOCAL RGB byte."""
from pathlib import Path
import json,sys,time
import numpy as np,cv2
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';cv2.setNumThreads(2)
records=[]
for method in sys.argv[1:] or ['focal','adaifl','safire']:
 start=time.time();archive=np.load(out/f'96mp-{method}.npz',allow_pickle=False)
 metadata=json.loads(str(archive['metadata_json']));assert metadata['image_shape']==[8000,12000]
 arrays={key:{'shape':list(archive[key].shape),'dtype':str(archive[key].dtype)} for key in archive.files}
 shape=metadata['native_shape'];assert list(archive['map'].shape)==shape;assert np.isfinite(archive['map']).all()
 if method=='adaifl':assert np.array_equal(archive['mask'],archive['map']>=.5)
 if method=='safire':
  probs=archive['source_probabilities'];assert np.isfinite(probs).all();assert np.array_equal(archive['source_labels'],probs.argmax(axis=0));assert archive['prompt_clusters'].dtype==np.int64
 record=dict(method=method,arrays=arrays,sourceSize=metadata['image_shape'])
 if method=='focal':
  original=cv2.imread(str(out/'m3-96mp-rich.jpg'));actual=cv2.imread(str(out/'96mp-focal.png'));assert actual.shape==original.shape==(8000,12000,3)
  small=cv2.applyColorMap(np.rint(np.clip(archive['map'],0,1)*np.float32(255)).astype(np.uint8),cv2.COLORMAP_INFERNO)
  columns=np.arange(12000)*small.shape[1]//12000;different=0;maximum=0
  for y in range(0,8000,32):
   rows=np.arange(y,min(y+32,8000))*small.shape[0]//8000;color=small[rows[:,None],columns[None,:]]
   expected=cv2.addWeighted(original[y:y+len(rows)],.5,color,.5,0);diff=np.abs(expected.astype(np.int16)-actual[y:y+len(rows)].astype(np.int16));different+=np.count_nonzero(diff);maximum=max(maximum,int(diff.max()))
  assert different==0,(different,maximum);record['fullResolutionPng']={'comparedBytes':288000000,'differentBytes':int(different),'maximumError':maximum}
 record['seconds']=time.time()-start;records.append(record)
(root/'docs'/('m3-96mp-export-'+ '-'.join(r['method'] for r in records)+'-proof.json')).write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(records))
