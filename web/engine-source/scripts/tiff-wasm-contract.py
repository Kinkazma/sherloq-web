"""Recipe helpers only: preserve C sources, qualify memory import, harden JS words."""
from pathlib import Path

def harden_encoded_callback(path):
 path=Path(path);text=path.read_text();old='Module["readEncoded"](target,length,high*4294967296+low)';new='Module["readEncoded"](target>>>0,length>>>0,(high>>>0)*4294967296+(low>>>0))'
 if text.count(old)!=1:raise RuntimeError('Unexpected generated TIFF encoded callback; stop rather than patch an unknown glue')
 path.write_text(text.replace(old,new));return {'marker':'unsigned-wasm32-tiff-callback-v1','target':'u32','length':'u32 with native tmsize cap','offset':'u64 words combined without signed low-word corruption','replacements':1}

def memory_import(path):
 data=Path(path).read_bytes()
 if data[:8]!=bytes.fromhex('0061736d01000000'):raise RuntimeError('Not a wasm1 module')
 def number(at):
  value=0;shift=0
  for _ in range(5):
   b=data[at];at+=1;value|=(b&127)<<shift
   if not b&128:return value,at
   shift+=7
  raise RuntimeError('Invalid u32 wasm LEB')
 def string(at):
  n,at=number(at);return data[at:at+n].decode('utf8'),at+n
 def limits(at,*,memory=False):
  flags,at=number(at);minimum,at=number(at);maximum=None
  if flags&1:maximum,at=number(at)
  if flags not in (0,1) or (memory and flags!=1):raise RuntimeError('Expected unshared wasm32 limits and bounded memory')
  return {'flags':flags,'initialPages':minimum,'maximumPages':maximum},at
 at=8;found=[]
 while at<len(data):
  section=data[at];length,begin=number(at+1);end=begin+length
  if section==2:
   count,cur=number(begin)
   for _ in range(count):
    module,cur=string(cur);name,cur=string(cur);kind=data[cur];cur+=1
    if kind==0:_,cur=number(cur)
    elif kind==1:
     cur+=1;_,cur=limits(cur)
    elif kind==2:
     extent,cur=limits(cur,memory=True);found.append({'module':module,'name':name,**extent})
    elif kind==3:cur+=2
    elif kind==4:_,cur=number(cur);_,cur=number(cur)
    else:raise RuntimeError('Unsupported wasm import kind')
   if cur!=end:raise RuntimeError('Wasm import section parse did not close')
  at=end
 if len(found)!=1 or found[0]['initialPages']!=256 or found[0]['maximumPages']!=65536:raise RuntimeError('TIFF rebuilt module must import exactly min256/max65536 pages')
 return {**found[0],'shared':False,'addressType':'wasm32','declaredMaximumBytes':2**32,'growthMaximumBytes':2**32-65536,'singleAllocationMaximumBytes':0x7fffffff}
