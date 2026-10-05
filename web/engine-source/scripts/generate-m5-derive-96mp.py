from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
source=root.parent/'web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'
data=source.read_bytes()
patches=[dict(offset=2,deleteCount=0,bytes=[255,254,0,8,77,53,45,72,69,88]),dict(offset=65533,deleteCount=11,bytes=[i*37%256 for i in range(29)]),dict(offset=len(data)//2,deleteCount=8193,bytes=[]),dict(offset=len(data),deleteCount=0,bytes=[0,255,17,128])]
out=bytearray();cursor=0;edits=[]
for p in patches:
 out+=data[cursor:p['offset']]
 edits.append(dict(offset=p['offset'],deleteCount=p['deleteCount'],insertedBytes=len(p['bytes']),outputOffset=len(out)))
 out+=bytes(p['bytes']);cursor=p['offset']+p['deleteCount']
out+=data[cursor:]
ref=dict(width=12000,height=8000,sourceBytes=len(data),sha256=hashlib.sha256(data).hexdigest(),patches=patches,edits=edits,derivedBytes=len(out),derivedSha256=hashlib.sha256(out).hexdigest(),oracle='Python byte slices and hashlib over complete original and derived output; raw edits do not claim image validity.')
(root/'docs/m5-derive-96mp-native-reference.json').write_text(json.dumps(ref,indent=2)+'\n')
