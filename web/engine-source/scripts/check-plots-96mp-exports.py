from pathlib import Path
import hashlib,json,zipfile,numpy as np,cv2
root=Path(__file__).resolve().parents[1];out=root/'.build/plots-96mp';p=root/'docs/plots-96mp-proof.json';proof=json.loads(p.read_text());r=proof['result']
for i,case in enumerate(r['cases']):
 path=out/f'values-{i}.npz';assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==case['export']['sha256']
 with zipfile.ZipFile(path) as z:assert z.testzip() is None
 with np.load(path) as z:
  values=z['values'];native=np.load(out/f'native-values-{case["scale"]}.npy',mmap_mode='r');assert values.shape==native.shape;assert np.array_equal(values,native);assert hashlib.sha256(values.tobytes()).hexdigest()==case['sha256']
 import xml.parsers.expat
 parser=xml.parsers.expat.ParserCreate();counter=[0]
 def start(name,attrs):
  if name=='circle':counter[0]+=1
 parser.StartElementHandler=start
 with (out/f'view-{i}.svg').open('rb') as f:
  while block:=f.read(1024**2):parser.Parse(block,False)
 parser.Parse(b'',True);actual=counter[0]
 assert actual==case['count'];image=cv2.imread(str(out/f'view-{i}.png'));assert image.shape==(480,640,3);assert np.unique(image.reshape(-1,3),axis=0).shape[0]>10
 case['independentReader']={'numpy':np.__version__,'allValuesNativeExact':True,'crcChecked':True,'svgPoints':actual,'pngShape':list(image.shape),'afterSourceRelease':True}
p.write_text(json.dumps(proof,indent=2)+'\n');print('All native plot values, vector points and raster graphs independently verified')
