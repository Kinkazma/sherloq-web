#!/usr/bin/env python3
"""Restore exact ordinary runtime files from published, hashed transport pieces."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import urllib.request


def restore(manifest_path, destination, chunks=None, origin=None):
    manifest = json.loads(manifest_path.read_text())
    if manifest['schema'] != 'sherloq.dependencies/1':
        raise ValueError('Invalid dependency manifest')
    if origin and not re.fullmatch(r'https://raw\.githubusercontent\.com/[^/]+/[^/]+/[a-f0-9]{40}/(?:[\w.-]+/)*', origin):
        raise ValueError('Origin must be an immutable GitHub commit URL')
    cache = chunks or destination / '.dependency-downloads'
    cache.mkdir(parents=True, exist_ok=True)
    count = 0
    for name, record in manifest['files'].items():
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or '\\' in name:
            raise ValueError('Invalid dependency path')
        target = destination / path
        if target.is_file() and hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() == record['sha256']:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + '.partial')
        try:
            whole = hashlib.sha256()
            with temporary.open('wb') as out:
                for sha in record['chunks']:
                    if not re.fullmatch('[a-f0-9]{64}', sha):
                        raise ValueError('Invalid dependency identity')
                    piece = cache / (sha + '.bin')
                    if not piece.exists():
                        if not origin:
                            raise ValueError('Missing chunk: ' + sha)
                        download = piece.with_suffix('.partial')
                        try:
                            with urllib.request.urlopen(origin + 'chunks/' + sha + '.bin') as response, download.open('wb') as stream:
                                size = 0
                                while block := response.read(1024 * 1024):
                                    size += len(block)
                                    if size > manifest['chunks'][sha]:
                                        raise ValueError('Oversized download')
                                    stream.write(block)
                            download.replace(piece)
                        finally:
                            download.unlink(missing_ok=True)
                    digest = hashlib.sha256()
                    size = 0
                    with piece.open('rb') as stream:
                        while block := stream.read(1024 * 1024):
                            digest.update(block)
                            whole.update(block)
                            size += len(block)
                            out.write(block)
                    if size != manifest['chunks'][sha] or digest.hexdigest() != sha:
                        raise ValueError('Corrupt chunk: ' + sha)
            if temporary.stat().st_size != record['size'] or whole.hexdigest() != record['sha256']:
                raise ValueError('Reconstructed file differs: ' + name)
            temporary.replace(target)
            count += 1
        finally:
            temporary.unlink(missing_ok=True)
    return count


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--destination', type=Path, required=True, help='Typically sherloq-browser/assets')
    p.add_argument('--chunks', type=Path, help='Local published web-assets/chunks directory')
    p.add_argument('--origin', help='Published raw.githubusercontent.com commit URL ending /web-assets/')
    args = p.parse_args()
    print('Restored', restore(args.manifest, args.destination, args.chunks, args.origin), 'verified ordinary files')
