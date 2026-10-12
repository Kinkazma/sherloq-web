#!/usr/bin/env python3
"""Verify every original file in a standard offline TAR, using bounded reads."""
import argparse
import hashlib
import json
from pathlib import Path
import tarfile


def verify(archive):
    with tarfile.open(archive, 'r:') as tar:
        shell = json.load(tar.extractfile('offline-kit.json'))
        manifest = json.load(tar.extractfile('manifest.json'))
        canonical = (json.dumps(manifest, sort_keys=True, separators=(',', ':'))+'\n').encode()
        if hashlib.sha256(canonical).hexdigest() != shell['manifest']:
            raise ValueError('Manifest identity differs')
        members = tar.getmembers()
        actual = {m.name for m in members}
        if any('localOnly' in meta and not isinstance(meta['localOnly'], bool) for meta in manifest['files'].values()):
            raise ValueError('Invalid local-only dependency policy')
        runtime_expected = {p:m for p,m in manifest['files'].items() if not m.get('localOnly') or p in actual}
        expected = {**runtime_expected, **{'app/'+p:m for p,m in shell['files'].items()}}
        if len(actual) != len(members) or actual != set(expected)|{'manifest.json','offline-kit.json'}:
            raise ValueError('File inventory differs or has duplicates')
        if any(not m.isfile() for m in members) or any(p.startswith(('private','app/private')) for p in expected):
            raise ValueError('Non-file or private content in the kit')
        total = 0
        for name,meta in expected.items():
            digest = hashlib.sha256()
            size = 0
            with tar.extractfile(name) as stream:
                while data := stream.read(1024*1024):
                    digest.update(data)
                    size += len(data)
            if size != meta['size'] or digest.hexdigest() != meta['sha256']:
                raise ValueError('File integrity failure: '+name)
            total += size
        if b'private-report' in tar.extractfile('app/app.html').read():
            raise ValueError('Private mailer in public shell')
    return {'scope':'Every original file verified with SHA-256; no network or extraction',
            'filesVerified':len(expected),'runtimeFiles':len(runtime_expected),
            'localOnlyMissing':sorted(set(manifest['files'])-set(runtime_expected)),
            'shellFiles':len(shell['files']),'verifiedBytes':total,'archiveBytes':archive.stat().st_size,
            'version':shell['version'],'manifest':shell['manifest'],'privateReporterIncluded':False}

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('archive',type=Path)
    p.add_argument('--report',type=Path)
    a = p.parse_args()
    result = json.dumps(verify(a.archive),indent=2)+'\n'
    if a.report:a.report.write_text(result)
    print(result)
