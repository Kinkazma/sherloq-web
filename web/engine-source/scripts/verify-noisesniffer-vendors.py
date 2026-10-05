"""Verify every retained Noisesniffer dependency before portable compilation."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[1]
for directory in ['boost-math','numpy-sort','noisesniffer']:
    root=ROOT/'vendor'/directory
    for record in json.loads((root/'PINNED.json').read_text())['files']:
        path=root/record['file']
        assert not path.is_symlink()
        assert hashlib.sha256(path.read_bytes()).hexdigest()==record['sha256'],directory+'/'+record['file']
print('Noisesniffer dependency hashes verified')
