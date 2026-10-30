"""Validate the complete current runtime snapshot without replaying old layers.

Historical receipts retain their original meaning. The current snapshot pins
the canonical inputs, both locks and the complete resource catalogue separately.
No build derives new trusted identities from an unreviewed working directory.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath


def digest(data):
    return hashlib.sha256(data).hexdigest()


class RuntimeSnapshot:
    snapshot = True

    def __init__(self, root):
        root = Path(root)
        repository = root.parents[1]
        receipt = json.loads((root / 'runtime-patches/current-snapshot.json').read_bytes())
        if receipt.get('schema') != 'sherloq.runtime-snapshot/1':
            raise ValueError('Unsupported complete runtime snapshot')

        def read(record):
            name = record['file']
            parts = PurePosixPath(name)
            if parts.is_absolute() or any(p in ('', '.', '..') for p in name.split('/')) or '\\' in name:
                raise ValueError('Unsafe runtime snapshot input')
            data = (repository / name).read_bytes()
            if len(data) != record['bytes'] or digest(data) != record['sha256']:
                raise ValueError('Runtime snapshot input differs: ' + name)
            return data

        manifest = json.loads(read(receipt['manifest']))
        for record in receipt['locks'].values():
            read(record)
        for record in receipt['canonicalFiles']:
            read(record)
        if manifest.get('schema') != 'sherloq.dependencies/1' or manifest.get('remoteBase') is not None:
            raise ValueError('A source snapshot must have an unconfigured resource origin')
        if any(sum(manifest['chunks'][h] for h in item['chunks']) != item['size']
               for item in manifest['files'].values()):
            raise ValueError('Runtime snapshot resource extents differ')
        self.files = {name: {'file': name, 'after': record}
                      for name, record in manifest['files'].items()}
        self.extra_resources = {}
        self.receipts = []
        self.predecessor = {}
        self.receipt = receipt

    def apply(self, relative, source, adapted):
        record = self.files.get(relative)
        if record is None:
            raise ValueError('Unreviewed runtime snapshot resource: ' + relative)
        expected = record['after']
        if len(source) != expected['size'] or digest(source) != expected['sha256']:
            raise ValueError('Runtime snapshot delivery differs: ' + relative)
        # restore-dependencies materializes the reviewed delivered bytes. Keep
        # them exact rather than adding a second transport wrapper.
        return source
