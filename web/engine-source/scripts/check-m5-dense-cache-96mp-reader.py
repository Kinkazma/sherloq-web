"""Independent streaming ZIP64/NumPy read of every field of the full-resolution duo."""
from pathlib import Path
import hashlib,json,zipfile,os,numpy as np
variant=os.environ.get('M5_DENSE_CACHE_VARIANT','initial');assert variant in ('initial','phase')
root=Path(__file__).resolve().parents[1];stem='dense-cache-phase-96mp' if variant=='phase' else 'dense-cache-96mp'
archive=root/'.build/integration'/stem/'complete.npz';path=root/'docs'/('m5-'+stem+'-proof.json');report=json.loads(path.read_text());proof=report['result']
assert archive.stat().st_size==proof['export']['byteLength']>0x7fffffff
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==proof['export']['sha256']
with archive.open('rb') as f:f.seek(-1024,2);assert b'PK\x06\x06' in f.read()
scheduling=root/'.build/integration'/stem/'storage-scheduling.json'
if scheduling.exists():
 record=json.loads(scheduling.read_text());assert record['state']=='resumed';proof['developmentScheduling']={k:record[k] for k in ['reason','pausedSeconds']}
fields=[]
with zipfile.ZipFile(archive) as z,np.load(archive) as arrays:
 metadata=json.loads(str(arrays['metadata_json']));provenance=json.loads(str(arrays['browser_provenance_json']));assert provenance['sha256']==proof['source']['sha256']=='26b0892c49a53583fe01b15bc2407844a216f00bc14dd4a6faebbe9467c65c36';maps=metadata['maps'];assert len(maps)==2 and metadata['extension_bins']==[]
 assert metadata['coordinates']=='original-source-pixels' and metadata['mirror_policy'] is None
 assert [m['pass']['method'] for m in maps]==[0,1]
 assert [m['pass']['stage'] for m in maps]==['base','base']
 assert [m['pass']['targetPatch'] for m in maps]==[3,3]
 assert [m['pass']['reflection'] for m in maps]==[False,False]
 assert [m['pass']['quarterTurn'] for m in maps]==[False,False]
 points=arrays['points'];pairs=arrays['pairs'];assert points.shape[1]==7 and pairs.shape[1]==4 and len(pairs)>0
 assert np.isfinite(points).all() and np.isfinite(pairs).all();assert np.all((points[:,0]>=0)&(points[:,0]<12000)&(points[:,1]>=0)&(points[:,1]<8000))
 assert np.all((pairs[:,:2]>=0)&(pairs[:,:2]<len(points)));assert arrays['pair_search_regions'].shape==(len(pairs),) and arrays['pair_algorithms'].shape==(len(pairs),)
 a=points[pairs[:,0].astype(int),:2];b=points[pairs[:,1].astype(int),:2];known_pairs=int(np.count_nonzero((np.abs(a[:,0]-b[:,0])==6000)&(a[:,1]==b[:,1])));assert known_pairs>0
 for m in maps:
  assert m['context']['id']=='global:0' and m['context']['origin']==[0,0];n=m['width']*m['height'];assert n>=94000000;record={'pass':m['pass'],'shape':[m['height'],m['width']],'arrays':{}}
  for name,dtype in [('targets','<i4'),('distances_squared','<f4'),('allowed','|u1'),('selected','|u1'),('errors','<f4')]:
   key=m['prefix']+name
   with z.open(key+'.npy') as f:
    version=np.lib.format.read_magic(f);shape,fortran,dt=np.lib.format._read_array_header(f,version);assert shape==(m['height'],m['width']) and not fortran and dt==np.dtype(dtype)
    sha=hashlib.sha256();offset=0;matched=0;copies=0;below=0;nonzero=0
    while offset<n:
     count=min(1048576,n-offset);data=f.read(count*dt.itemsize);assert len(data)==count*dt.itemsize;sha.update(data);values=np.frombuffer(data,dtype=dt)
     if name=='targets':
      assert np.all((values>=-1)&(values<n));valid=values>=0;matched+=int(np.count_nonzero(valid))
      if m['pass']['method'] in (0,1):
       indices=np.arange(offset,offset+count);copies+=int(np.count_nonzero(valid&(values//m['width']==indices//m['width'])&(np.abs(values%m['width']-indices%m['width'])==6000)))
     elif name in ['allowed','selected']:assert np.all(values<=1);nonzero+=int(np.count_nonzero(values))
     else:
      assert not np.isnan(values).any() and np.all(values>=0)
      if name=='distances_squared':below+=int(np.count_nonzero(values<=np.float32(.2*.2)))
     offset+=count
    assert not f.read(1)
   record['arrays'][name]={'sha256':sha.hexdigest(),'dtype':dtype,'elements':n}
   if name=='targets':
    record['matchedTargets']=matched
    if m['pass']['method'] in (0,1):assert copies>n//4;record['exactDistantCopyTargets']=copies
   elif name=='distances_squared':assert below==m['denseCount'];record['thresholdCount']=below
   elif name in ['allowed','selected']:record[name+'Count']=nonzero
  fields.append(record);print('Read full pass',m['pass']['id'],flush=True)
 # All remaining small arrays and metadata are read too, so their CRCs are checked.
 checked={m['prefix']+name+'.npy' for m in maps for name in ['targets','distances_squared','allowed','selected','errors']}
 for entry in z.infolist():
  if entry.filename not in checked:
   with z.open(entry) as f:
    while f.read(1048576):pass
reference=json.loads((root/'docs/dense-sift-96mp-proof.json').read_text())['result']['independentReader']['fields']
for actual,expected in zip(fields,reference):
 assert actual['arrays']==expected['arrays'], 'Adaptive cache changed a full96MP field'
proof['baseline96MpFieldsExact']=True
proof['independentReader']={'numpy':np.__version__,'zip64':True,'allEntriesCrcChecked':True,'afterSourceAndEngineRelease':True,'knownDistantCopyPairs':known_pairs,'fields':fields,'native96MpBitExactClaim':False}
path.write_text(json.dumps(report,indent=2)+'\n');print('Complete two-pass archive verified')
