"""Historical 101-quality curves from native code, with generated PNG inputs."""
from pathlib import Path
import os,sys,types,json
sys.dont_write_bytecode=True
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];out=root/'tests/data';out.mkdir(exist_ok=True)
package=types.ModuleType('m5jpeg');package.__path__=[os.environ['SHERLOQ_NATIVE_CORE']];sys.modules[package.__name__]=package
from m5jpeg.jpeg_curve import RecompressionCurve
cases=[]
for index,(w,h) in enumerate([(16,17),(65,49),(384,320)]):
 y,x=np.indices((h,w));image=np.stack([(x*3+y*5)%256,(x*17+y*7)%256,((x//3+y//5)%2)*240],axis=2).astype(np.uint8)
 if index==0:image[:]=[40,170,230]
 file=f'recompression-{index}.png';cv.imwrite(str(out/file),image)
 raw=RecompressionCurve(image,qualities=range(101),workers=1).compute()
 cases.append(dict(file=file,width=w,height=h,raw=raw.tolist()))
(out/'recompression-native.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=cases),separators=(',',':'))+'\n')
