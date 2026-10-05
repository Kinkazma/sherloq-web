"""Read the native aligned-lattice detector on the unchanged rich96MP original."""
from pathlib import Path
import hashlib, json, sys, time
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.double_jpeg import analyze
source=root.parent/'web-engine-m2/.build/forgeryscope-source/source-96mp-rich.jpg'
with source.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
assert digest=='7a6ac1368fd28adbbf841a88b3b897f791695ac6fe265c7ba6c9a93f36d704ca'
started=time.perf_counter();report=analyze(source);assert report['dimensions']==[12000,8000]
(root/'docs/m5-dct-96mp-native-reference.json').write_text(json.dumps(dict(sha256=digest,sourceBytes=source.stat().st_size,expected=report,nativeSeconds=time.perf_counter()-started),indent=2)+'\n')
print('Native original96MP DCT reference complete',flush=True)
