"""Public synthetic96MP JPEG and independent full native defect evidence.

No private image input. Byte orientation is explicit EXIF6 for one case.
"""
from pathlib import Path
import hashlib,json,sys,gc,struct
import cv2,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.defect_pixels import DefectEngine,export_csv
build=root/'.build';build.mkdir(exist_ok=True)
w,h=12000,8000
image=np.full((h,w,3),100,np.uint8)
image[8::32,8::32]=[240,10,100]
image[16::32,16::32]=[0,0,0]
image[24::32,24::32]=[255,255,255]
image[0,4::32]=[255,0,255]
image[-1,20::32]=[0,255,0]
file=build/'defects-12000x8000.jpg';assert cv2.imwrite(str(file),image,[cv2.IMWRITE_JPEG_QUALITY,95])
encoded=file.read_bytes();exif=b'Exif\x00\x00II'+struct.pack('<H',42)+struct.pack('<I',8)+struct.pack('<H',1)+struct.pack('<HHI',274,3,1)+struct.pack('<H',6)+b'\x00\x00'+struct.pack('<I',0)
rotated=encoded[:2]+b'\xff\xe1'+struct.pack('>H',len(exif)+2)+exif+encoded[2:]
(build/'defects-12000x8000-exif6.jpg').write_bytes(rotated)
del image
raw=cv2.imdecode(np.frombuffer(encoded,np.uint8),cv2.IMREAD_COLOR);cases=[]
variants=[(1,32,32,0,0,1),(2,32,64,1,1,1),(2,32,64,2,2,1),(1,16,96,0,2,1),(2,32,64,0,0,6)]
for radius,threshold,spread,kind,mode,orientation in variants:
 image=raw if orientation==1 else np.ascontiguousarray(np.rot90(raw,3));height,width=image.shape[:2]
 settings=(radius,threshold,spread,kind,True);engine=DefectEngine(image);output,flags,count,median=engine._compute((settings,mode))
 hashes={key:hashlib.sha256() for key in ['rgb','flags','mask']}
 for y in range(0,height,64):
  for key,value in [('rgb',output),('flags',flags)]:hashes[key].update(np.ascontiguousarray(value[y:y+64,:,::-1]).tobytes())
  hashes['mask'].update(np.bitwise_or.reduce(flags[y:y+64],axis=2).tobytes())
 csv_path=build/'defects-reference.csv';export_csv(csv_path,settings,image,flags,median)
 csv_hash=hashlib.sha256();csv_bytes=0
 with csv_path.open('rb') as stream:
  while part:=stream.read(1024**2):csv_hash.update(part);csv_bytes+=len(part)
 table_hash=hashlib.sha256();candidate_count=0;first=[];last=[]
 for y in range(height):
  xs,cs=np.nonzero(flags[y]);length=len(xs);candidate_count+=length
  if not length:continue
  rows=np.column_stack((xs,np.full(length,y),2-cs,flags[y,xs,cs],image[y,xs,cs],median[y,xs,cs])).astype('<u4');table_hash.update(rows.tobytes())
  if len(first)<5:first.extend(rows[:5-len(first)].tolist())
  last=(last+rows[-5:].tolist())[-5:]
 regions=[dict(x=0,y=0,width=37,height=35),dict(x=7,y=7,width=39,height=43),dict(x=width//2-19,y=height//2-11,width=41,height=37),dict(x=width-43,y=height-39,width=43,height=39)]
 windows=[]
 for rect in regions:
  x,y,rw,rh=[rect[k] for k in ['x','y','width','height']];views={'rgb':np.ascontiguousarray(output[y:y+rh,x:x+rw,::-1]),'flags':np.ascontiguousarray(flags[y:y+rh,x:x+rw,::-1]),'mask':np.bitwise_or.reduce(flags[y:y+rh,x:x+rw],axis=2)}
  windows.append(dict(rect=rect,sha256={key:hashlib.sha256(v.tobytes()).hexdigest() for key,v in views.items()}))
 case=dict(params=dict(radius=radius,threshold=threshold,spread=spread,kind=kind,mode=mode),orientation=orientation,width=width,height=height,originalSha256=hashlib.sha256(encoded if orientation==1 else rotated).hexdigest(),sha256={key:v.hexdigest() for key,v in hashes.items()},count=count,candidateCount=candidate_count,tableSha256=table_hash.hexdigest(),csvSha256=csv_hash.hexdigest(),csvBytes=csv_bytes,firstRows=first,lastRows=last,windows=windows)
 cases.append(case);print(json.dumps(dict(params=case['params'],orientation=orientation,count=count,candidates=candidate_count)),flush=True)
 del engine,output,flags,median;gc.collect()
record=dict(schema=1,operation='pixels.defects',sourceSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/defect_pixels.py').read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv2.__version__,referencePath='DefectEngine._compute full CPU and export_csv',files={1:'defects-12000x8000.jpg',6:'defects-12000x8000-exif6.jpg'},cases=cases)
(build/'defects-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n')
