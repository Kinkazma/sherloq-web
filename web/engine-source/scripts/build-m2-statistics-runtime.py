"""Local reproducible Pyodide scientific runtime and unmodified native statistics.

Package hashes come from the pinned Pyodide lock. Runtime files and the original
native Python sources are individually manifested. No image is sent to a server.
"""
from pathlib import Path
import json,hashlib,subprocess,zipfile
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[1];out=root/'.build/pyodide';out.mkdir(parents=True,exist_ok=True)
base='https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
def download(name,expected=None):
 path=out/name
 if not path.exists():subprocess.run(['curl','-fsSL',base+name,'-o',str(path)],check=True)
 digest=hashlib.sha256(path.read_bytes()).hexdigest()
 if expected and expected!=digest:raise ValueError('Identity mismatch: '+name)
 return dict(file=name,bytes=path.stat().st_size,sha256=digest)
download('pyodide-lock.json');lock=json.loads((out/'pyodide-lock.json').read_text());packages=set()
def include(name):
 if name in packages:return
 packages.add(name)
 for dep in lock['packages'][name]['depends']:include(dep)
for name in ['numpy','scipy','opencv-python','pillow']:include(name)
files=[('pyodide.mjs',None),('pyodide.asm.js',None),('pyodide.asm.wasm',None),('python_stdlib.zip',None),('pyodide-lock.json',None)]+[(lock['packages'][x]['file_name'],lock['packages'][x]['sha256']) for x in sorted(packages)]
with ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(lambda args:download(*args),files))
path=out/'pyodide.asm.js';original=out/'pyodide.asm.original.js';source=(original if original.exists() else path).read_text();marker='"maximum":2147483648/65536'
assert source.count(marker)==1
patched=source.replace(marker,'"maximum":globalThis.__sherloqPythonMemoryPages')
# loadPyodide expects this filename; retain the original for a reproducible re-run.
original=out/'pyodide.asm.original.js'
if not original.exists():original.write_text(source)
path.write_text(patched)
records=[dict(file=r['file'],bytes=(out/r['file']).stat().st_size,sha256=hashlib.sha256((out/r['file']).read_bytes()).hexdigest(),originalSha256=hashlib.sha256(original.read_bytes()).hexdigest()) if r['file']=='pyodide.asm.js' else r for r in records]
native=root.parent/'source/gui/noiseprint';sources=['post_em.py','noiseprint_blind.py','feat_spam/spam_np_opt.py','feat_spam/residue.py','feat_spam/mapping.py','utility/gaussianMixture.py','utility/stable_covariance.py','utility/utilityRead.py'];source_records=[]
with zipfile.ZipFile(out/'noiseprint-statistics.zip','w',compression=zipfile.ZIP_STORED) as archive:
 for folder in ['noiseprint','noiseprint/feat_spam','noiseprint/utility']:archive.writestr(zipfile.ZipInfo(folder+'/__init__.py',(1980,1,1,0,0,0)),'')
 for name in sources:
  pinned=root/'native/noiseprint-stability'/name
  content=(pinned if pinned.exists() else native/name).read_bytes();source_sha=hashlib.sha256(content).hexdigest()
  if name=='feat_spam/spam_np_opt.py':
   text=content.decode();old='counts = np.bincount(codes.ravel(), minlength=count*cols*bins)'
   assert text.count(old)==1
   text=text.replace(old,"if codes.size and (codes.min() < 0 or codes.max() > np.iinfo(np.intp).max):\n            raise MemoryError('Block histogram exceeds pointer integer range')\n        counts = np.bincount(codes.astype(np.intp, copy=False).ravel(), minlength=count*cols*bins)")
   content=text.encode()
  archive.writestr(zipfile.ZipInfo('noiseprint/'+name,(1980,1,1,0,0,0)),content);source_records.append(dict(file=name,sourceSha256=source_sha,browserSha256=hashlib.sha256(content).hexdigest()))
path=out/'noiseprint-statistics.zip';records.append(dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
manifest=dict(schema=2,statisticsPolicy='covariance-floor-v1',pyodide='0.26.4',packages={x:lock['packages'][x]['version'] for x in sorted(packages)},files=records,nativeSources=source_records,memory='Actual WebAssembly maximum provided by worker admission; unchanged WASM binary')
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(manifest['packages']);print('Downloaded bytes:',sum(x['bytes'] for x in records))
