"""Freeze the explicitly allowlisted converted model for a private local handoff.

This does not publish assets or establish redistribution rights. Reference
activations and test exports in the build directory are deliberately excluded.
"""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
source=root/'.build/d2prl-private-package';out=root/'.build/d2prl-delivery';out.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
identity=json.loads((source/'identity.json').read_text());model_bytes=(source/'model.json').read_bytes()
assert len(model_bytes)==identity['bytes'] and sha(model_bytes)==identity['sha256']
assert identity['sha256'] in (root/'src/d2prl-model-identity.js').read_text()
model=json.loads(model_bytes);assets=model['assets'];assert len(assets)==identity['assets']
assert sum(spec['bytes'] for spec in assets.values())==identity['assetBytes']
archive=out/('d2prl-model-'+identity['sha256'][:16]+'.zip')
if archive.exists():raise SystemExit('Refusing to overwrite immutable model archive: '+archive.name)
names=['model.json']+sorted(assets)
with zipfile.ZipFile(archive,'x',compression=zipfile.ZIP_STORED) as z:
 for name in names:
  assert not Path(name).is_absolute() and '..' not in Path(name).parts
  if name!='model.json':assert name=='assets/'+assets[name]['sha256']+'.bin'
  data=(source/name).read_bytes()
  if name!='model.json':assert len(data)==assets[name]['bytes'] and sha(data)==assets[name]['sha256']
  info=zipfile.ZipInfo(name,date_time=(2026,9,30,0,0,0));info.external_attr=0o100644<<16;z.writestr(info,data)
with zipfile.ZipFile(archive) as z:
 assert z.namelist()==names and z.testzip() is None
 for name in names:
  data=z.read(name);expected=identity if name=='model.json' else assets[name]
  assert len(data)==expected['bytes'] and sha(data)==expected['sha256']
with archive.open('rb') as f:archive_sha=hashlib.file_digest(f,'sha256').hexdigest()
receipt=dict(schema=1,status='verified-private-local-handoff',archive=archive.name,bytes=archive.stat().st_size,sha256=archive_sha,files=len(names),modelManifest=identity,scope='Converted parameters and fixed model configuration only. No reference activations, test exports, inference outputs, runtime or distribution permission included.')
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
