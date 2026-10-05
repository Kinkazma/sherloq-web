from pathlib import Path
import cv2,numpy as np,json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';cv2.setNumThreads(2)
image=cv2.imread(str(root.parent/'web-engine/.build/jpeg-12000x8000.jpg'));assert image.shape==(8000,12000,3);image[:,6000:]=image[:,:6000];file=out/'m3-96mp-noise-copy.jpg';assert cv2.imwrite(str(file),image,[cv2.IMWRITE_JPEG_QUALITY,90])
report=dict(file=file.name,width=12000,height=8000,description='Public deterministic full-resolution RGB noise (seed130014); entire6000x8000 left half copied at dx6000 before JPEG90 encoding.',sha256=hashlib.sha256(file.read_bytes()).hexdigest(),bytes=file.stat().st_size);(out/'m3-96mp-noise-copy.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
