"""Replace only dynamic Embind adapters in the pinned npm icodec HEIC glue.

Preserves the upstream WASM binary, pthread runtime and compression settings.
The application's CSP continues to exclude unsafe-eval.
"""
from pathlib import Path
import hashlib
import tarfile
root=Path(__file__).resolve().parents[1]
archive=root/'.build/media-codecs/icodec-0.6.0.tgz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()=='096c7931660423f062399c5e4c7ceccf4d640dc3f84936fcf37fcccb454d1299'
with tarfile.open(archive) as bundle:
    source=bundle.extractfile('package/dist/heic-enc.js').read().decode()
assert hashlib.sha256(source.encode()).hexdigest()=='fe61cbfdd1c1c1a7cd4d2af983bad02f2ca2467d4647525f23e5cc6d6c91c11c'
first,second=(root/'native/heic-csp-bindings.js').read_text().split('// EMVAL_ADAPTER\n')
for start,end,replacement in [('function craftInvokerFunction','var heap32VectorToArray',first),('var __emval_get_method_caller','var __emval_incref',second)]:
    a=source.index(start);b=source.index(end,a);source=source[:a]+replacement+'\n'+source[b:]
assert 'newFunc(Function,' not in source
(root/'vendor/media/heic/heic-enc.js').write_text(source)
