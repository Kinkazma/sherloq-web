from pathlib import Path
import cv2,numpy as np,json,hashlib
root=Path(__file__).resolve().parents[1];directory=root/'.build/stereo-96mp';p=root/'docs/stereo-96mp-proof.json';report=json.loads(p.read_text());case=report['result']['cases'][1];reference=json.loads((directory/'reference.json').read_text())
image=cv2.imread(str(directory/'periodic.jpg'));pattern=cv2.absdiff(image[:,192:],image[:,:-192]);pattern=cv2.merge([cv2.normalize(v,None,0,255,cv2.NORM_MINMAX) for v in cv2.split(pattern)]);flow=np.memmap(directory/'flow.f32',dtype='<f4',mode='r',shape=(8000,11808));normal=cv2.normalize(flow,None,0,1,cv2.NORM_MINMAX);shaded=pattern.astype('f4')*normal[:,:,None];native=cv2.normalize(shaded,None,0,255,cv2.NORM_MINMAX).astype('u1');digest=hashlib.sha256()
for row in native:digest.update(row[:,::-1].tobytes())
assert digest.hexdigest()==reference['cases'][1]['sha256'];actual=cv2.imread(str(directory/'view-1.png'));delta=np.abs(actual.astype('i2')-native);maximum=int(delta.max());count=int(np.count_nonzero(delta));assert maximum<=1;assert count<=4
case['nativeErrorMeasurement']={'channels':int(delta.size),'nonidenticalChannels':count,'maximumByteError':maximum,'meanByteError':float(delta.mean()),'nativeSha256':digest.hexdigest(),'unit':'8-bit RGB channel (0..255)','noBinaryMaskOrClassification':'Relative disparity visualization only'}
p.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(case['nativeErrorMeasurement']))
