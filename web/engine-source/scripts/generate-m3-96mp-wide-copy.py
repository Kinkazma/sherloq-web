"""Own deterministic wide96 MP fixture, no resize; shared source is read-only."""
from pathlib import Path
import cv2,json,hashlib
root=Path(__file__).resolve().parents[1];out=root/'.build/m3';cv2.setNumThreads(2)
image=cv2.imread(str(root.parent/'web-engine/.build/jpeg-12000x8000.jpg'));assert image.shape==(8000,12000,3)
image=image.reshape(4000,24000,3);image[:,12000:]=image[:,:12000]
file=out/'m3-96mp-wide-copy.jpg';assert cv2.imwrite(str(file),image,[cv2.IMWRITE_JPEG_QUALITY,90])
report=dict(file=file.name,width=24000,height=4000,description='Public deterministic RGB noise seed130014 reshaped without resizing; entire12000x4000 left half copied at dx12000 before JPEG90 encoding.',sha256=hashlib.sha256(file.read_bytes()).hexdigest(),bytes=file.stat().st_size)
file.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
