"""Native ElaEngine outputs; own JSON only, no shared fixture writes."""
from pathlib import Path
import sys,json,hashlib,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.ela import ElaEngine
assert cv.__version__=='4.11.0';cv.setNumThreads(1);cases=[]
parameters=[(75,50,20,False,False),(75,37,59,False,True),(75,1,0,True,False),(75,100,100,True,True),(1,100,0,False,False),(100,20,0,False,True)]
for file in ['fixtures/odd.jpg','fixtures/exif-6-le.jpg','tests/data/digest-downsample.png','tests/data/tiff-stream/tiles-bigtiff.tiff']:
 image=cv.imread(str(root/file));engine=ElaEngine(image);expected=[]
 for values in parameters[:2]if 'tiff-stream' in file else parameters:
  params=dict(zip(['quality','scale','contrast','linear','grayscale'],values));rgb=cv.cvtColor(engine.compute(values),cv.COLOR_BGR2RGB);expected.append(dict(params=params,sha256=hashlib.sha256(memoryview(rgb)).hexdigest()))
 cases.append(dict(file=file,width=image.shape[1],height=image.shape[0],expected=expected));del engine,image
(root/'tests/data/segmented-ela-native.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=cases),indent=2)+'\n')
