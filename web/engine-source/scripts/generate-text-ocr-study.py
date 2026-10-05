from pathlib import Path
import subprocess,json,sys
import cv2 as cv,numpy as np
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.text_regions import parse_boxes,supported_boxes,detect_text
image=np.full((220,1800,3),255,np.uint8)
cv.putText(image,'Panel A - SAMPLE 123',(20,65),cv.FONT_HERSHEY_SIMPLEX,1.1,(0,0,0),2,cv.LINE_AA)
cv.putText(image,'Control group',(30,150),cv.FONT_HERSHEY_SIMPLEX,1.2,(0,0,0),2,cv.LINE_AA)
cv.putText(image,'Panel B - TEST 456',(1250,65),cv.FONT_HERSHEY_SIMPLEX,1.1,(0,0,0),2,cv.LINE_AA)
cv.imwrite(str(out/'ocr.png'),image);image[:,:,::-1].tofile(out/'ocr.rgb')
subprocess.run(['tesseract',str(out/'ocr.png'),str(out/'ocr-native'),'-l','eng','--psm','11','tsv'],check=True,capture_output=True)
tsv=(out/'ocr-native.tsv').read_text();boxes=detect_text(image)
(out/'ocr-native.json').write_text(json.dumps(dict(width=1800,height=220,boxes=boxes)))
