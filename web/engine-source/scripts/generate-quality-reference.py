"""Native JPEG quality curves and tables on synthetic fixtures."""
from pathlib import Path
import json,sys,hashlib
import cv2 as cv
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'source'))
from gui.sherloq_app.core.jpeg_quality import QualityEngine
OUT=ROOT/'web-engine/fixtures';cases=[]
for name in ('synthetic.jpg','one.jpg','odd.jpg','gray.jpg','progressive.jpg','exif-6-le.jpg'):
 image=cv.imread(str(OUT/name));engine=QualityEngine(str(OUT/name),image,workers=1);r=engine.compute();tables,components=r['quantization'];quality,deviation,distance=r['estimate']
 cases.append(dict(file=name,width=image.shape[1],height=image.shape[0],raw=[engine.raw[q] for q in range(1,101)],curve=r['curve'].tolist(),minimum=r['minimum'],quantization=dict(tables={k:v.flatten().tolist()for k,v in tables.items()},components=components),estimate=dict(quality=quality,deviation=deviation,distance=distance.tolist())))
(OUT/'quality-reference.json').write_text(json.dumps(dict(schema=1,source='synthetic JPEG fixtures',opencv=cv.__version__,cases=cases),indent=2)+'\n');print(len(cases),'JPEG quality references')
