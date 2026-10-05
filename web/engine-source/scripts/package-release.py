"""Freeze verified manifest bytes. Existing versioned archives are immutable."""
from pathlib import Path
import hashlib,json,zipfile,sys
ROOT=Path(__file__).resolve().parents[1];version=json.loads((ROOT/'package.json').read_text())['version'];releases=ROOT/'releases';releases.mkdir(exist_ok=True)
kind=sys.argv[1] if len(sys.argv)>1 else 'both';kinds=['runtime','source'] if kind=='both' else [kind]
assert all(k in ['runtime','source'] for k in kinds)
records=[]
for variant in kinds:
 manifest_name=f'{variant}-manifest.json';manifest=json.loads((ROOT/manifest_name).read_text());assert manifest['version']==version
 records_by_name={r['file']:r for r in manifest['files']};assert len(records_by_name)==len(manifest['files'])
 files=[manifest_name]+list(records_by_name)
 dest=releases/f'sherloq-web-engine-{version}-{variant}.zip'
 if dest.exists():raise SystemExit('Refusing to overwrite an immutable archive: '+dest.name)
 checked={}
 for file in files:
  path=ROOT/file;assert not path.is_symlink() and '..' not in Path(file).parts and not Path(file).is_absolute()
  data=path.read_bytes()
  if file in records_by_name:
   expected=records_by_name[file];assert len(data)==expected['bytes'] and hashlib.sha256(data).hexdigest()==expected['sha256'],file
  if b'/' + b'Users/' in data:raise SystemExit('Host path in delivery file: '+file)
  checked[file]=data
 with zipfile.ZipFile(dest,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for file,data in checked.items():
   info=zipfile.ZipInfo(file,date_time=(2026,9,29,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;archive.writestr(info,data)
 with zipfile.ZipFile(dest) as archive:
  assert archive.namelist()==files
  for file,data in checked.items():assert archive.read(file)==data
 record=dict(file=dest.name,bytes=dest.stat().st_size,sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),manifestFiles=len(manifest['files']));records.append(record);print(json.dumps(record))
report=releases/f'release-{version}.json'
if report.exists():
 old=json.loads(report.read_text());assert old['version']==version
 records=old['archives']+records;assert len({r['file'] for r in records})==len(records)
report.write_text(json.dumps(dict(version=version,archives=records),indent=2)+'\n')
