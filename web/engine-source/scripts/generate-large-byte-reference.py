"""Independent unchanged-byte digests/windows for the synthetic large JPEG."""
from pathlib import Path
import hashlib,json,platform,ssl
root=Path(__file__).resolve().parents[1];source=json.loads((root/'.build/jpeg-12000x8000-reference.json').read_text());path=root/'.build'/source['file']
algorithms={'MD5':'md5','SHA-1':'sha1','SHA2-224':'sha224','SHA2-256':'sha256','SHA2-384':'sha384','SHA2-512':'sha512','SHA3-224':'sha3_224','SHA3-256':'sha3_256','SHA3-384':'sha3_384','SHA3-512':'sha3_512'}
states={label:getattr(hashlib,name)() for label,name in algorithms.items()}
with path.open('rb') as stream:
 while part:=stream.read(1024**2):
  for state in states.values():state.update(part)
hashes={name:state.hexdigest() for name,state in states.items()};assert hashes['SHA2-256']==source['originalSha256'];size=path.stat().st_size;windows=[]
with path.open('rb') as stream:
 for offset,length in [(0,256),(65530,777),(1024**2-17,65536),(size-19,65536),(size,1)]:
  stream.seek(offset);data=stream.read(length);windows.append(dict(offset=offset,length=length,returnedBytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
record=dict(schema=1,source=source['file'],bytes=size,python=platform.python_version(),implementation=ssl.OPENSSL_VERSION,hashes=hashes,windows=windows)
(root/'.build/original-bytes-12000x8000-reference.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(dict(bytes=size,hashes=len(hashes),windows=len(windows))))
