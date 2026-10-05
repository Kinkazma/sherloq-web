"""A useful full-source JPEG curve fixture, with one native worker."""
from pathlib import Path
import json,sys,types
sys.dont_write_bytecode=True
import cv2 as cv
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'tests/data';cv.setNumThreads(1)
package=types.ModuleType('m5curve');package.__path__=[str(ROOT.parent/'source/gui/sherloq_app/core')];sys.modules[package.__name__]=package
from m5curve.jpeg_curve import RecompressionCurve
parallel='--parallel' in sys.argv
w,h=1600,2200 if parallel else 1100;y,x=np.indices((h,w));image=np.stack([(x*3+y*5)%256,(x*17+y*7)%256,((x//3+y//5)%2)*240],axis=2).astype(np.uint8)
name='recompression-segmented-parallel' if parallel else 'recompression-segmented'
file=name+'.jpg';cv.imwrite(str(OUT/file),image,[cv.IMWRITE_JPEG_QUALITY,85]);decoded=cv.imread(str(OUT/file));raw=RecompressionCurve(decoded,qualities=range(101),workers=1).compute()
(OUT/(name+'-native.json')).write_text(json.dumps(dict(file=file,width=w,height=h,raw=raw.tolist(),opencv=cv.__version__),separators=(',',':'))+'\n')
print(file,(OUT/file).stat().st_size,'101 native losses')
