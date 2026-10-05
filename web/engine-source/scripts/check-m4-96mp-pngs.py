from pathlib import Path
import sys,json,hashlib,cv2
root=Path(__file__).resolve().parents[1];family=sys.argv[1];report_path=root/'docs'/f'{family}-96mp-proof.json';report=json.loads(report_path.read_text());proof=report['result']
for index,case in enumerate(proof['cases']):
 path=root/'.build'/f'{family}-96mp'/f'view-{index}.png';assert hashlib.file_digest(path.open('rb'),'sha256').hexdigest()==case['export']['sha256'];image=cv2.imread(str(path));assert list(image.shape)==[case['export']['height'],case['export']['width'],3];h=hashlib.sha256()
 for row in image:h.update(row[:,::-1].tobytes())
 assert h.hexdigest()==case['sha256'];case['independentPngReader']={'opencv':cv2.__version__,'rgbSha256':h.hexdigest(),'allPixelsNativeExact':case.get('allPixelsNativeExact',True),'afterSourceRelease':True}
report_path.write_text(json.dumps(report,indent=2)+'\n');print(family,len(proof['cases']),'complete96MP PNGs independently verified')
