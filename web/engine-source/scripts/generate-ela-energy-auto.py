"""Public generated oracles for scientific tail/Otsu profiles and decimal snapshots."""
from pathlib import Path
import sys,json,gzip,hashlib,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_energy_auto import estimate,deviations
from gui.sherloq_app.core.ela_energy import prepare_energy
out=root/'fixtures/ela-energy';payload=bytearray();estimates=[];deviation_cases=[];profiles=[];rng=np.random.default_rng(280010)
def put(data):
 while len(payload)%4:payload.append(0)
 raw=data.tobytes();part=dict(offset=len(payload),length=len(raw));payload.extend(raw);return part
def add_estimate(name,planes,scope,summary):
 base=dict(energy_planes=planes,energy_scope=scope,energy_summary=summary);result=estimate(base)
 estimates.append(dict(name=name,count=scope.size,planes=put(planes.astype('<f4')),scope=put(scope.astype('<i4')),summary=summary,result=result));return result
def add_deviations(name,low,high):
 result=deviations(dict(energy_low_score=low,energy_high_score=high));deviation_cases.append(dict(name=name,count=low.size,low=put(low.astype('<f4')),high=put(high.astype('<f4')),result=result));return result
ref=json.loads((out/'preparation.json').read_text());data=gzip.decompress((out/ref['payload']['file']).read_bytes())
def get(row,key,dtype):
 part=row[key];return np.frombuffer(data,dtype=dtype,count=part['length']//np.dtype(dtype).itemsize,offset=part['offset'])
for row in ref['cases']:
 if row['quantiles']!=[.1,.9]:continue
 h,w=row['height'],row['width'];planes=get(row,'planes','<f4').reshape(3,h,w);scope=get(row,'energy_scope','<i4').reshape(h,w)
 auto=add_estimate(row['name'],planes,scope,row['summary']);rgb=get(row,'image','u1').reshape(h,w,3);proposal=prepare_energy(np.ascontiguousarray(rgb[:,:,::-1]),planes,quantiles=auto['quantiles']);auto={**auto,'thresholds':add_deviations(row['name'],proposal['energy_low_score'],proposal['energy_high_score'])}
 for profile in ['sensitive','conservative']:
  qs=auto['quantiles'];ts=auto['thresholds'];calibration=None
  if profile=='conservative':qs=[round(qs[0]*.2,3),round(1-(1-qs[1])*.2,3)];ts=[round(min(20,x*g),1) for x,g in zip(ts,[2.05,2.47])];calibration=dict(tail_factor=.2,shadow_gain=2.05,highlight_gain=2.47)
  profiles.append(dict(input=auto,profile=profile,result={**auto,'quantiles':qs,'thresholds':ts,'profile':profile,'calibration':calibration,'method':'quantile_tail_knees_one_sided_otsu_v1'}))
for n in [16,31,32,255,256,1023,131071,131072,131073,262145]:
 for pattern in ['flat','lognormal','uniform']:
  plane=np.full(n,10,np.float32) if pattern=='flat' else np.minimum(255,rng.lognormal(1,1.5,n)).astype(np.float32) if pattern=='lognormal' else rng.uniform(0,255,n).astype(np.float32)
  scope=np.ones((1,n),np.int32);scope[:,n//2:]=2;scope[:,::17]=0;planes=np.stack([plane,plane,plane]).reshape(3,1,n);add_estimate(f'{pattern}-{n}',planes,scope,[dict(id=1),dict(id=2)])
for n in [255,256,257,1024,131073]:
 for index in range(12):
  a=rng.uniform(0,.25+index*1.5,n).astype(np.float32);b=np.minimum(30,rng.lognormal(-1+index*.3,1.5,n)).astype(np.float32)
  if index==0:a[:]=1;b[:]=8.05
  if index==1:a[:]=0;b[:]=.99
  if index==2:a[::2]=0;b[::3]=0
  add_deviations(f'distribution-{n}-{index}',a,b)
rounding=[dict(value=float(x),digits=d,result=round(float(x),d)) for x in np.concatenate([np.linspace(0,20,401),np.linspace(0,1,10001)]) for d in [1,3]]
compressed=gzip.compress(payload,compresslevel=9,mtime=0);file='automatic.bin.gz';(out/file).write_bytes(compressed);sha=lambda b:hashlib.sha256(b).hexdigest();report=dict(schema=1,scope='Scientific profile parameters only, generated inputs, no performance calibration',seed=280010,numpy=np.__version__,nativeSha256=sha((root.parent/'source/gui/sherloq_app/core/ela_energy_auto.py').read_bytes()),payload=dict(file=file,bytes=len(payload),compressedBytes=len(compressed),sha256=sha(payload),compressedSha256=sha(compressed)),estimates=estimates,deviations=deviation_cases,profiles=profiles,rounding=rounding)
(out/'automatic.json').write_text(json.dumps(report,indent=2)+'\n');print(len(estimates),'estimates,',len(deviation_cases),'Otsu cases,',len(profiles),'profiles,',len(rounding),'decimal cases,',len(compressed),'compressed bytes')
