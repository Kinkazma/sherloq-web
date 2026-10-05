"""Native source-coordinate maps/masks for existing generated model references."""
from pathlib import Path
import argparse,json,hashlib
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];parser=argparse.ArgumentParser();parser.add_argument('--case',choices=['jpeg','flat']);args=parser.parse_args();base=root/('.build/d2prl-additional/'+args.case if args.case else '.build/d2prl-model');ref=json.loads((base/'reference.json').read_text());masks=json.loads((base/'masks-reference.json').read_text());h,w=ref['source']['shape'][:2]
def save(name,a):
 b=a.tobytes();file=name+'.bin';(base/file).write_bytes(b);return dict(file=file,shape=list(a.shape),bytes=len(b),sha256=hashlib.sha256(b).hexdigest())
raw=np.fromfile(base/ref['raw'][0]['file'],np.float32).reshape(448,448);report=dict(schema=1,width=w,height=h,map=save('source-map',cv.resize(raw,(w,h),interpolation=cv.INTER_LINEAR)),masks=[])
for row in masks['records']:
 values=np.fromfile(base/row['file'],np.float32).reshape(3,448,448);resized=np.stack([cv.resize(v,(w,h),interpolation=cv.INTER_NEAREST) for v in values]);report['masks'].append(dict(minimum=row['minimum'],**save('source-masks-'+str(row['minimum']),resized)))
(base/'source-return-reference.json').write_text(json.dumps(report,indent=2)+'\n');print('Generated return reference',args.case or 'initial')
