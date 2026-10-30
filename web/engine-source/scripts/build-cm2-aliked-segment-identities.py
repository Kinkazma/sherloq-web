from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[1];records={}
for kind in ['aliked-n16','aliked-n16rot']:
 folder=R/'vendor/aliked-cm2-segments'/kind
 m=json.loads((folder/'manifest.json').read_text())
 for key,a in m['assets'].items():
  p=folder/a['file'];assert p.stat().st_size==a['bytes'];assert hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256']
 records[kind]=m
(R/'src/aliked-cm2-segments-assets.js').write_text('export const ALIKED_CM2_SEGMENTS=Object.freeze('+json.dumps(records,separators=(',',':'))+');\n')
