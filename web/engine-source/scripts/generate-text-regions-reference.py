from pathlib import Path
import sys,json,hashlib
import numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.text_regions import parse_boxes,supported_boxes,polygons
rng=np.random.default_rng(3100);image=np.full((80,128,3),240,np.uint8)
image[20:60,65:120]=rng.integers(0,256,(40,55,3),dtype=np.uint8)
image[12:15,8:30]=0;image[48:50,6:30]=[150,40,70]
# two separated flat background bands, first wins equal-length tie
image[45:65,32:62]=rng.integers(0,256,(20,30,3),dtype=np.uint8)
image[45:52,32:62]=240;image[58:65,32:62]=240
rows=[(5,4,8,28,12,95,'Label'),(5,69,23,42,28,99,'Texture'),(5,6,43,24,7,91,'A'),
 (5,4,4,3,3,89,'B'),(5,4,4,3,3,95,'a'),(5,4,4,3,3,99,'7'),(5,4,4,3,3,99,'!'),
 (5,5,5,5,5,69,'weak'),(4,0,0,100,20,99,'Line'),(5,35,48,23,14,98,'Bands'),
 (5,50,2,10,25,99,'RoundEven'),(5,50,40,10,0,99,'Zero'),(5,90,60,8,8,95,'É'),(5,100,60,8,8,95,'文字')]
header='level\tleft\ttop\twidth\theight\tconf\ttext'
tsv=header+'\n'+'\n'.join('\t'.join(map(str,row)) for row in rows)
parsed=parse_boxes(tsv,(0,0),image.shape);supported=supported_boxes(image,parsed)
(root/'tests/m3-data/text-regions-reference.json').write_text(json.dumps(dict(width=128,height=80,rgb=image[:,:,::-1].flatten().tolist(),tsv=tsv,parsed=parsed,supported=supported,polygons=polygons(supported),nativeSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/text_regions.py').read_bytes()).hexdigest()),separators=(',',':'))+'\n')
