"""Verify immutable runtime ZIP identities, then extract a fresh local recipe tree."""
from pathlib import Path
import hashlib,json,sys,zipfile
root=Path(__file__).resolve().parents[1]
version=sys.argv[1] if len(sys.argv)>1 else json.loads((root/'package.json').read_text())['version']
assert version and all(c.isdigit() or c=='.' for c in version)
archive=root/'releases'/f'sherloq-web-engine-{version}-runtime.zip'
release=json.loads((root/'releases'/f'release-{version}.json').read_text())
record=next(x for x in release['archives'] if x['file']==archive.name)
assert archive.stat().st_size==record['bytes']
assert hashlib.sha256(archive.read_bytes()).hexdigest()==record['sha256']
with zipfile.ZipFile(archive) as z:
    manifest=json.loads(z.read('runtime-manifest.json'));assert manifest['version']==version
    names=['runtime-manifest.json']+[x['file'] for x in manifest['files']]
    assert len(names)==len(set(names)) and z.namelist()==names
    assert all(not Path(n).is_absolute() and '..' not in Path(n).parts for n in names)
    for row in manifest['files']:
        data=z.read(row['file']);assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],row['file']
    destination=root/'.build'/f'release-{version}-runtime'
    destination.mkdir(parents=True,exist_ok=False)
    for name in names:
        output=destination/name;output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(z.read(name))
proof=dict(schema=1,version=version,status='runtime archive and every extracted file hash verified',archive=record,verifiedRuntimeFiles=len(manifest['files']),browserRecipe='pending; extraction alone is not execution proof')
(root/'docs'/f'extracted-runtime-{version}-hashes.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps(proof))
