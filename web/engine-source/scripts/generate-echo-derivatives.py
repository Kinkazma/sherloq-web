"""Native intermediate hashes justify exact float32 storage before float64 normalization."""
from pathlib import Path
import hashlib,json
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];cv2.setNumThreads(1);reference=json.loads((root/'fixtures/opencv-reference.json').read_text());cases=[]
for f in reference['cases']:
 rgb=np.frombuffer((root/'fixtures'/f['file']).read_bytes(),np.uint8).reshape(f['height'],f['width'],3);expected=[]
 for radius in range(1,16):
  original=np.stack([np.abs(cv2.Laplacian(rgb[:,:,c].copy(),cv2.CV_64F,ksize=radius*2+1)) for c in range(3)],axis=2)
  values=original.astype(np.float32);exact=bool(np.array_equal(values.astype(np.float64),original));assert exact,(f['name'],radius)
  expected.append(dict(radius=radius,float32StorageExact=exact,sha256=hashlib.sha256(values.tobytes()).hexdigest(),limits=[v for c in range(3) for v in (float(original[:,:,c].min()),float(original[:,:,c].max()))]))
 cases.append(dict(name=f['name'],file=f['file'],width=f['width'],height=f['height'],expected=expected))
record=dict(schema=1,reference='OpenCV4.11 cv.Laplacian CV_64F, CPU, absolute value before normalization',numpy=np.__version__,opencv=cv2.__version__,cases=cases)
(root/'fixtures/echo-derivatives-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(images=len(cases),radii=15,exactFloat32Intermediates=True)))
