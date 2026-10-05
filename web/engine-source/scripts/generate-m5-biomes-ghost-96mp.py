"""Full native Ghost peer oracle, reusing the previously generated native cell fields."""
from pathlib import Path
import sys,json,hashlib,time,cv2 as cv,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela_biomes import segment
from gui.sherloq_app.core.ela_ghosts import GhostBiomeEngine
cv.setNumThreads(1);folder=root/'.build/integration/large-biomes';ref=json.loads((folder/'reference.json').read_text());payload=(folder/'reference.bin').read_bytes();rows,cols=ref['rows'],ref['cols'];n=rows*cols;base={}
for key,f in ref['fields'].items():
 a=np.frombuffer(payload,dtype=f['dtype'],count=f['bytes']//np.dtype(f['dtype']).itemsize,offset=f['offset']).copy();shape=(rows,cols) if a.size==n else (rows,cols,3,5) if key in ['profiles','signed_scores'] else (rows,cols,a.size//n);base[key]=a.reshape(shape)
base['supported']=base['supported'].astype(bool);base['background_supported']=base['background_supported'].astype(bool);base['metadata']=dict(block=ref['block']);image=cv.imread(str(root/ref['file']));start=time.perf_counter();values=GhostBiomeEngine(image).compute(base)
base={**base,**values,'ela_score':base['pre_background_score'],'pre_background_score':np.maximum(base['pre_background_score'],values['ghost_score']),'score':np.maximum(base['score'],values['ghost_score'])}
result=segment(base,2,3);base['labels']=result['labels'];output=bytearray();fields={}
for key,a in base.items():
 if not isinstance(a,np.ndarray):continue
 kind='u1' if a.dtype.kind=='b' or key=='ghost_phase' else '<i2' if key=='ghost_quality' else '<i4' if a.dtype.kind in 'iu' else '<f4'
 while len(output)%4:output.append(0)
 raw=a.astype(kind).tobytes();fields[key]=dict(offset=len(output),bytes=len(raw),dtype=kind,sha256=hashlib.sha256(raw).hexdigest());output.extend(raw)
(folder/'ghost-reference.bin').write_bytes(output);ref.update(fields=fields,regions=result['metadata']['regions'],params={**ref['params'],'ghost':True},nativeMs=(time.perf_counter()-start)*1000,payloadSha256=hashlib.sha256(output).hexdigest());(folder/'ghost-reference.json').write_text(json.dumps(ref,indent=2)+'\n');print('done',ref['nativeMs'],len(ref['regions']),flush=True)
