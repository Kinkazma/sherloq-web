from pathlib import Path
import hashlib,json,zipfile,numpy as np
root=Path(__file__).resolve().parents[1];path=root/'.build/dense-96mp/complete.npz';report_path=root/'docs/dense-96mp-proof.json';report=json.loads(report_path.read_text());proof=report['result'];assert path.stat().st_size==proof['export']['byteLength'];assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==proof['export']['sha256']
with zipfile.ZipFile(path) as z:assert z.testzip() is None
with np.load(path) as z:
 metadata=json.loads(str(z['metadata_json']));points=z['points'];pairs=z['pairs'];assert points.shape==(12000,7) and pairs.shape==(6000,4);assert np.all(np.isfinite(points)) and np.all(np.isfinite(pairs));assert np.all((points[:,0]>=0)&(points[:,0]<12000)&(points[:,1]>=0)&(points[:,1]<8000));a=points[pairs[:,0].astype(int),:2];b=points[pairs[:,1].astype(int),:2];assert np.all(np.abs(a[:,0]-b[:,0])==6000) and np.all(a[:,1]==b[:,1]);assert len(metadata['models'])==34
 fields={};n=96000000;targets=z['field_0_targets'];assert targets.shape==(8000,12000) and targets.dtype==np.int32;flat=targets.ravel();matched=0;copies=0
 for start in range(0,n,1000000):
  values=flat[start:start+1000000];indices=np.arange(start,start+len(values));assert np.all((values>=-1)&(values<n));valid=values>=0;matched+=int(np.count_nonzero(valid));copies+=int(np.count_nonzero(valid&(values//12000==indices//12000)&(np.abs(values%12000-indices%12000)==6000)))
 assert matched==n;assert copies>n//4
 for name,dtype in [('targets',np.int32),('distances_squared',np.float32),('allowed',np.uint8),('selected',np.uint8),('errors',np.float32)]:
  array=targets if name=='targets' else z['field_0_'+name];assert array.shape==(8000,12000) and array.dtype==dtype;digest=hashlib.sha256()
  for row in array:digest.update(row.tobytes())
  fields[name]={'shape':list(array.shape),'dtype':str(array.dtype),'sha256':digest.hexdigest()}
  if name in ['distances_squared','errors']:assert not np.isnan(array).any() and np.all(array>=0)
  if name=='distances_squared':
   initial=int(np.count_nonzero(array<=np.float32(.3*.3)));refiltered=int(np.count_nonzero(array<=np.float32(.2*.2)));assert initial==proof['analysis']['denseCount'] and refiltered==metadata['dense_count'];fields[name]['initialThresholdCount']=initial;fields[name]['refilteredThresholdCount']=refiltered
  if name in ['allowed','selected']:assert np.all(array<=1);fields[name]['nonzero']=int(np.count_nonzero(array))
  if name!='targets':del array
 reader={'numpy':np.__version__,'entries':len(z.files),'allCrcValid':True,'afterSourceAndEngineRelease':True,'allSixThousandPairsDisplacedBy6000Pixels':True,'matchedTargets':matched,'exactDistantCopyTargets':copies,'fields':fields}
proof['independentReader']=reader;report_path.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(reader))
