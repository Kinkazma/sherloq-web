"""Native file-loader oracle for exact PNG palette/packed/Adam7 conversion."""
from pathlib import Path
import os,ast,json,hashlib,struct,zlib
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];out=root/'tests/data/png-formats';out.mkdir(parents=True,exist_ok=True);native=Path(os.environ['SHERLOQ_NATIVE_CORE'])/'image_io.py';source=native.read_text();tree=ast.parse(source)
ns=dict(os=os,Path=Path,np=np,cv=cv,Cancelled=RuntimeError,RAW_EXTENSIONS=set());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('image_metadata','decode_image')],type_ignores=[]),str(native),'exec'),ns)
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
def png(width,height,depth,color,interlace=0,alpha=False,orientation=1):
 y,x=np.indices((height,width));channels={0:1,2:3,3:1,4:2,6:4}[color];limit=(1<<depth)-1
 data=np.stack([((x*(17+c*3)+y*(11+c*5)+c*31)&limit) for c in range(channels)],axis=2)
 rows=bytearray();passes=[(0,0,1,1)] if not interlace else [(0,0,8,8),(4,0,8,8),(0,4,4,8),(2,0,4,4),(0,2,2,4),(1,0,2,2),(0,1,1,2)]
 for x0,y0,sx,sy in passes:
  if x0>=width or y0>=height:continue
  for row in data[y0::sy,x0::sx]:
   rows.append(0);values=row.ravel()
   if depth>=8:rows.extend(values.astype('>u2' if depth==16 else 'u1').tobytes())
   else:
    byte=0;bits=0
    for value in values:
     byte=(byte<<depth)|int(value);bits+=depth
     if bits==8:rows.append(byte);byte=bits=0
    if bits:rows.append(byte<<(8-bits))
 result=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,depth,color,0,0,interlace))
 if color==3:
  palette=bytes([value for i in range(1<<depth) for value in [(i*37)%256,(i*83)%256,(255-i*29)%256]]);result+=chunk(b'PLTE',palette)
  if alpha:result+=chunk(b'tRNS',bytes([(i*51)%256 for i in range(1<<depth)]))
 elif alpha and color==0:result+=chunk(b'tRNS',struct.pack('>H',0))
 elif alpha and color==2:result+=chunk(b'tRNS',struct.pack('>HHH',0,31,62))
 if orientation!=1:result+=chunk(b'eXIf',b'II'+struct.pack('<HIH',42,8,1)+struct.pack('<HHIHHI',274,3,1,orientation,0,0))
 return result+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b'')
cases=[]
requests=[(depth,color,interlace,alpha,1,53,37)for color in [0,3]for depth in [1,2,4,8]for interlace,alpha in [(0,False),(1,True)]]
requests +=[(depth,color,1,False,1,53,37)for color in [0,2,4,6]for depth in [8,16]]
requests +=[(8,2,1,False,orientation,53,37)for orientation in range(2,9)]
requests +=[(1,3,1,True,1,1,1)]
for index,(depth,color,interlace,alpha,orientation,width,height)in enumerate(requests):
 name=f'png-{index}.png';path=out/name;path.write_bytes(png(width,height,depth,color,interlace,alpha,orientation));record=dict(file=name,depth=depth,colorType=color,interlace=interlace,orientation=orientation)
 try:
  _,_,bgr,metadata=ns['decode_image'](path);rgb=np.ascontiguousarray(bgr[:,:,::-1]);record.update(width=rgb.shape[1],height=rgb.shape[0],rgbSha256=hashlib.sha256(rgb.tobytes()).hexdigest(),metadata=metadata)
 except ValueError as error:record['nativeError']=str(error)
 cases.append(record)
(out/'reference.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(source.encode()).hexdigest(),cases=cases),indent=2)+'\n');print(len(cases),'PNG native cases',sum('nativeError'in c for c in cases),'native refusals')
