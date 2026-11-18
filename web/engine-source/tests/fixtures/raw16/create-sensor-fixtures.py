#!/usr/bin/env python3
from pathlib import Path
import struct,json,hashlib
here=Path(__file__).resolve().parent
base=(here/'native16-cfa.dng').read_bytes()
sizes={1:1,2:1,3:2,4:4,5:8,10:8};ifd=struct.unpack_from('<I',base,4)[0];n=struct.unpack_from('<H',base,ifd)[0];tags={}
for k in range(n):
 tag,kind,count,value=struct.unpack_from('<HHII',base,ifd+2+k*12);length=sizes[kind]*count;data=base[ifd+2+k*12+8:ifd+2+k*12+8+length] if length<=4 else base[value:value+length];tags[tag]=(kind,count,data)
def pack(tag,kind,values):
 fmt={1:'B',3:'H',4:'I'}[kind];return kind,len(values),struct.pack('<'+fmt*len(values),*values)
def write(name,tags,pixels):
 tags=dict(tags);tags[273]=pack(273,4,[0]);tags[279]=pack(279,4,[len(pixels)]);entries=[];extra=bytearray();end=8+2+len(tags)*12+4
 for tag,(kind,count,data) in sorted(tags.items()):
  if len(data)>4:
   if len(extra)%2:extra.append(0)
   value=struct.pack('<I',end+len(extra));extra.extend(data)
  else:value=data.ljust(4,b'\0')
  entries.append(struct.pack('<HHI',tag,kind,count)+value)
 offset=end+len(extra);offset=(offset+15)//16*16
 out=bytearray(b'II*\0'+struct.pack('<I',8)+struct.pack('<H',len(tags))+b''.join(entries)+b'\0'*4+extra)
 out.extend(b'\0'*(offset-len(out)))
 index=sorted(tags).index(273);struct.pack_into('<I',out,8+2+index*12+8,offset);out.extend(pixels);(here/name).write_bytes(out)
 return {'file':name,'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),'payloadOffset':offset,'payloadSha256':hashlib.sha256(pixels).hexdigest()}
u=dict(tags);u[50829]=pack(50829,4,[3,5,93,125]);u[50713]=pack(50713,3,[2,2]);u[50714]=pack(50714,3,[64,65,66,67]);pattern=[0,1,63,64,65,4095,16383,65535]
up=struct.pack('<'+'H'*(128*96),*(pattern[(x+3*y)%len(pattern)] for y in range(96) for x in range(128)))
f=dict(tags);f[258]=pack(258,3,[32]);f[339]=pack(339,3,[3]);f[50714]=pack(50714,3,[0]);f[50717]=pack(50717,4,[1]);values=[-.25,-0.0,0.125,.3,1.25,4.5,128.0625]
fp=struct.pack('<'+'f'*(128*96),*(values[(x+3*y)%len(values)] for y in range(96) for x in range(128)))
record={'schema':'sherloq.private-raw-sensor-fixtures/1','uint16':write('sensor-uint16-margins.dng',u,up),'float32':write('sensor-float32.dng',f,fp),'width':128,'height':96,'uint16Pattern':pattern,'floatPattern':values}
(here/'sensor-fixtures.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
