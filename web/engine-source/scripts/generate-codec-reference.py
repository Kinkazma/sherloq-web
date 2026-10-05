from pathlib import Path
import cv2 as cv,numpy as np,json,hashlib
out=Path(__file__).resolve().parents[1]/'fixtures';fixtures=[]
for name,h,w,gray,progressive in [('one',1,1,False,False),('odd',17,31,False,False),('gray',19,23,True,False),('progressive',33,27,False,True),('large-pattern',128,160,False,False),('bench-512',512,512,False,False),('bench-1024',1024,1024,False,False)]:
 y,x=np.indices((h,w));rgb=np.stack(((x*17+y*3)%256,(x*5+y*23)%256,((x//8+y//8)%2)*220+17),axis=2).astype(np.uint8);im=rgb[:,:,::-1]
 if gray:im=cv.cvtColor(im,cv.COLOR_BGR2GRAY)
 _,j=cv.imencode('.jpg',im,[cv.IMWRITE_JPEG_QUALITY,91,cv.IMWRITE_JPEG_PROGRESSIVE,int(progressive)])
 im=cv.imdecode(j,cv.IMREAD_COLOR);(out/(name+'.jpg')).write_bytes(j.tobytes())
 sha=lambda a:hashlib.sha256(np.ascontiguousarray(a[:,:,::-1]).tobytes()).hexdigest()
 records=[]
 for q in (1,25,50,75,95,96,99,100):
  _,rec=cv.imencode('.jpg',im,[cv.IMWRITE_JPEG_QUALITY,q]);records.append(dict(quality=q,sha256=sha(cv.imdecode(rec,1))))
 fixtures.append(dict(file=name+'.jpg',width=w,height=h,decodedSha256=sha(im),recompressed=records))
(out/'codec-reference.json').write_text(json.dumps(dict(opencv=cv.__version__,cases=fixtures),indent=2)+'\n')
print(len(fixtures),'JPEG fixtures;',sum(len(f['recompressed']) for f in fixtures),'recompressions')
