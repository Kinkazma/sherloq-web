"""Small public regression for NumPy's8192-element float32 reduction batches."""
from pathlib import Path
import hashlib,json,sys
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.contrast import ContrastEngine
cv2.setNumThreads(1)
source=root/'.build/echo-4099x3077.jpg';identity='6e1f7631beac461679fa598731c5cc635e8ff112c9912db8a4f25dcb8e083eb0';assert hashlib.sha256(source.read_bytes()).hexdigest()==identity
image=cv2.imread(str(source))[:257,:257].copy();engine=ContrastEngine(image);maps=engine.analyze(256);values=np.stack(maps,axis=-1);file='contrast-buffered-mean-input.rgb';data=image[:,:,::-1].copy().tobytes();(root/'fixtures'/file).write_bytes(data)
expected=dict(block=256,shape=list(values.shape),values=values.ravel().tolist(),sha256=hashlib.sha256(values.tobytes()).hexdigest(),views=[hashlib.sha256(engine.render(256,mode,maps)[:,:,::-1].copy().tobytes()).hexdigest() for mode in range(3)])
_,tri,avg=engine.prepare(256)
proof={}
for name,a in [('tri',tri),('avg',avg)]:
 flat=a[:256,:256].copy().reshape(-1);total=np.float32(0)
 for offset in range(0,len(flat),np.getbufsize()):total=np.float32(total+np.sum(flat[offset:offset+np.getbufsize()]))
 proof[name]=dict(nativeMean=float(np.mean(a[:256,:256])),bufferedMean=float(np.float32(total/np.float32(len(flat)))))
native='source/gui/sherloq_app/core/contrast.py'
record=dict(schema=1,scope='Public257x257 crop preserves the first full256x256 block and its actual neighbor halo from the public JPEG.',sourceSha256=identity,crop=dict(x=0,y=0,width=257,height=257),numpy=np.__version__,bufferElements=np.getbufsize(),means=proof,nativeSources={native:hashlib.sha256((root.parent/native).read_bytes()).hexdigest()},cases=[dict(name='buffered-mean',file=file,width=257,height=257,inputSha256=hashlib.sha256(data).hexdigest(),expected=[expected])])
(root/'fixtures/contrast-reduction-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(proof))
