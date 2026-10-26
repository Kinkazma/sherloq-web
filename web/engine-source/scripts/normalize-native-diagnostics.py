"""Replace absolute diagnostic source strings without altering WASM code."""
from pathlib import Path
import re,hashlib,argparse,json
def sections(data):
 if data[:8]!=b'\0asm\x01\0\0\0':raise ValueError('WASM v1 required')
 at=8;rows=[]
 while at<len(data):
  start=at;kind=data[at];at+=1;size=shift=0
  while True:
   value=data[at];at+=1;size|=(value&127)<<shift;shift+=7
   if value<128:break
  end=at+size
  if end>len(data):raise ValueError('Truncated WASM section')
  rows.append((kind,start,at,end));at=end
 return rows
def normalize(data):
 # Rust data strings need not be NUL-terminated. Stop at the source filename,
 # never at the end of an adjacent printable data run.
 result=bytearray(data);changes=0;pattern=re.compile(rb'/Users/[A-Za-z0-9_.@+~ /-]{1,990}?(?:\.rs|\.cpp|\.cxx|\.hpp|\.cc|\.hh|\.h(?![A-Za-z0-9_])|\.c(?![A-Za-z0-9_]))')
 for kind,start,body,end in sections(data):
  if kind not in [0,11]:continue
  for match in pattern.finditer(data,body,end):
   old=match.group();leaf=old.rsplit(b'/',1)[-1]
   if not old.isascii() or any(c<32 or c>126 for c in old):raise ValueError('Non-text diagnostic path')
   prefix=b'native/source/';fill=len(old)-len(prefix)-len(leaf)
   if fill<0:raise ValueError('Unexpected diagnostic source length')
   replacement=prefix+b'_'*fill+leaf
   assert len(replacement)==len(old);result[match.start():match.end()]=replacement;changes+=1
 result=bytes(result)
 if b'/Users/' in result:raise ValueError('Absolute source path outside recognized diagnostic data')
 before=sections(data);after=sections(result);assert before==after
 for kind,start,body,end in before:
  if kind not in [0,11]:assert data[start:end]==result[start:end]
 return result,changes
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args();raw=a.source.read_bytes();out,n=normalize(raw);a.output.write_bytes(out)
 print(json.dumps({'diagnosticStringsChanged':n,'bytes':len(out),'sha256':hashlib.sha256(out).hexdigest(),'codeSectionsUnchanged':True}))
