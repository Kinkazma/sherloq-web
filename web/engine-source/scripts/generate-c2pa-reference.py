"""Own C2PA fixtures and current native offline oracle; no writes to native/shared tests."""
from pathlib import Path
import ast,hashlib,json,os,struct,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1];NATIVE=ROOT.parent/'source/gui/sherloq_app/core/c2pa.py';OUT=ROOT/'tests/data/c2pa';OUT.mkdir(parents=True,exist_ok=True)
SAMPLE=ROOT.parent/'third_party/c2patool-v0.28.0/c2patool/sample'
BINARY=ROOT.parent/'native/c2pa/c2patool'
namespace={'__file__':str(NATIVE)};exec(compile(ast.parse(NATIVE.read_text()),str(NATIVE),'exec'),namespace)
signed=(SAMPLE/'C.jpg').read_bytes();unsigned=(SAMPLE/'image.jpg').read_bytes()
(OUT/'signed.jpg').write_bytes(signed);(OUT/'unsigned.jpg').write_bytes(unsigned)
b=bytearray(signed);at=2
while at<len(b):
    marker=b[at+1];length=int.from_bytes(b[at+2:at+4],'big')
    if marker==0xdb:b[at+5]^=1;break
    at+=2+length
else:raise AssertionError('No DQT')
(OUT/'altered.jpg').write_bytes(b)
# Locate the fixture's definite-length COSE_Sign1 signature byte string, then flip
# one signature byte. This tiny CBOR walker is fixture generation, not validation.
def cbor_end(data,at):
    head=data[at];at+=1;major=head>>5;info=head&31
    if info<24:value=info
    else:
        assert info in (24,25,26,27)
        size=1<<(info-24);value=int.from_bytes(data[at:at+size],'big');at+=size
    payload=at
    if major in (2,3):at+=value
    elif major in (4,5):
        for _ in range(value*(2 if major==5 else 1)):at=cbor_end(data,at)[0]
    elif major==6:at=cbor_end(data,at)[0]
    return at,major,payload,value
label=signed.index(b'c2pa.signature\0');at=label+len(b'c2pa.signature\0')+8
assert signed[at:at+2]==b'\xd2\x84';at+=2
for _ in range(3):at=cbor_end(signed,at)[0]
end,major,payload,length=cbor_end(signed,at);assert major==2 and length>32
corrupt=bytearray(signed);corrupt[payload]^=1;(OUT/'bad-signature.jpg').write_bytes(corrupt)

xmp=b'http://ns.adobe.com/xap/1.0/\0'+b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dcterms="http://purl.org/dc/terms/" dcterms:provenance="https://c2pa-offline.invalid/manifest.c2pa"/></rdf:RDF></x:xmpmeta>'
(OUT/'remote.jpg').write_bytes(unsigned[:2]+b'\xff\xe1'+struct.pack('>H',len(xmp)+2)+xmp+unsigned[2:])
for name,src in [('trust.pem','trust_anchors.pem'),('wrong-trust.pem','es256_certs.pem')]: (OUT/name).write_bytes((SAMPLE/src).read_bytes())
(OUT/'LICENSE-MIT').write_bytes((ROOT.parent/'native/c2pa/LICENSE-MIT').read_bytes())
cases=[]
for file,trust in [('signed.jpg',None),('altered.jpg',None),('bad-signature.jpg',None),('unsigned.jpg',None),('remote.jpg',None),('signed.jpg','trust.pem'),('signed.jpg','wrong-trust.pem')]:
    settings=json.loads(json.dumps(namespace['SETTINGS']))
    if trust:settings['trust']={'trust_anchors':(OUT/trust).read_text()}
    with tempfile.TemporaryDirectory(dir=ROOT/'.build/m5') as folder:
        config=Path(folder)/'settings.json';config.write_text(json.dumps(settings))
        env={k:v for k,v in os.environ.items() if not k.startswith(('C2PA','C2PATOOL'))}
        p=subprocess.run([str(BINARY),str(OUT/file),'--detailed','--settings',str(config)],capture_output=True,timeout=30,env=env)
        result=namespace['parse']((p.stdout,p.stderr.decode(),{'trust_configured':bool(trust)}))
        # Reader.json uses the SDK manifest model; native --detailed has additional claim internals.
        statuses=result.get('report',{}).get('validation_results',{}) if result['report'] else None
        cases.append(dict(file=file,trust=trust,states={k:result[k] for k in ['manifest','integrity','signature','trust']},validationResults=statuses,sha256=hashlib.sha256((OUT/file).read_bytes()).hexdigest()))
(OUT/'reference.json').write_text(json.dumps(dict(schema=1,native='c2patool 0.28.0 / c2pa-rs 0.91.0',cases=cases),indent=2)+'\n')
print([(r['file'],r['trust'],r['states']) for r in cases])
