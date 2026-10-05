"""Download verified upstream arithmetic sources into this worktree's study directory."""
from pathlib import Path
import json,hashlib,urllib.request
root=Path(__file__).resolve().parents[1];out=root/'.build/openblas-m4-study'
records=json.loads((root/'experiments/resampling-em/OPENBLAS-SOURCES.json').read_text())
for row in records:
 dest=out/row['file']
 data=dest.read_bytes() if dest.is_file() else urllib.request.urlopen(row['url']).read()
 assert hashlib.sha256(data).hexdigest()==row['sha256'],row['file']
 dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
(out/'sources.json').write_text(json.dumps(records,indent=2)+'\n')
