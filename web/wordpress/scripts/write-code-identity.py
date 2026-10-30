#!/usr/bin/env python3
"""Write or check the deterministic identity of canonical engine/UI inputs."""
from pathlib import Path
import argparse
import hashlib
import json

repository = Path(__file__).resolve().parents[3]
engine = repository / 'web/engine-source'
assets = repository / 'web/wordpress/sherloq-browser/assets'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
manifest = json.loads((repository / 'web-assets/manifest-template.json').read_text())
encode = lambda value: (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()
rows = []
for root, label in [(engine, 'engine'), (assets, 'ui')]:
    for path in sorted(root.rglob('*')):
        if not path.is_file() or path.suffix not in {'.js', '.mjs', '.json', '.wasm', '.html', '.css'}:
            continue
        rel = path.relative_to(root)
        name = rel.as_posix()
        if any(part.startswith('.') or part in {'node_modules', '__pycache__'} for part in rel.parts):
            continue
        if name == 'src/useful-work-code-identity.js' or path.name.startswith('worker-bundle-'):
            continue
        if label == 'ui' and (any(name.startswith(slot + '/') for slot in manifest['slots']) or
                name.startswith(('dependency-manifest-', 'offline/')) or name in
                {'__manifest.json', 'offline-shell.json', 'feature-catalog.json', 'dependency-config.json', 'offline-public-app.html'}):
            continue
        data = path.read_bytes()
        rows.append({'root': label, 'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)})
identity = {'schema': 'sherloq.useful-work-code/1', 'sha256': hashlib.sha256(encode(rows)).hexdigest(),
            'engineFiles': sum(row['root'] == 'engine' for row in rows),
            'uiFiles': sum(row['root'] == 'ui' for row in rows)}
data = ('// Generated from canonical sources; no runtime hashing or probes.\n'
        'export const USEFUL_WORK_CODE_IDENTITY = Object.freeze(' + json.dumps(identity, separators=(',', ':')) + ');\n').encode()
target = engine / 'src/useful-work-code-identity.js'
if args.check:
    if target.read_bytes() != data:
        raise SystemExit('Canonical code identity is stale')
else:
    target.write_bytes(data)
print(json.dumps(identity))
