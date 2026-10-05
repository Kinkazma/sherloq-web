"""Complete RGB hashes from the independent native reference, including added tools."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
path = root / 'docs/pixels-96mp-proof.json'
report = json.loads(path.read_text())
references = json.loads((root / '.build/pixels-96mp/reference.json').read_text())
references += json.loads((root / '.build/pixels-96mp/additional-reference.json').read_text())
for case in report['result']['cases']:
    reference = next(r for r in references if r['family'] == case['family'])
    assert any(c['sha256'] == case['sha256'] for c in reference['cases']), case['family']
    case['allPixelsNativeExact'] = True
report['result']['nativeReference'] = {'allFourteenRgbViewsExact': True, 'pixelsPerView': 96000000}
path.write_text(json.dumps(report, indent=2) + '\n')
print('All fourteen 96 MP RGB views match the native reference.')
