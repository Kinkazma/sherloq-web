"""Fetch immutable upstream inputs only; this script never compiles code."""
from pathlib import Path
import hashlib, json, os, tarfile, urllib.request, zipfile
ROOT = Path(os.environ['NATIVE_MAGICK_BUILD_ROOT']).resolve()
(ROOT/'archives').mkdir(parents=True,exist_ok=True)
(ROOT/'sources').mkdir(parents=True,exist_ok=True)
SOURCES = [
    ('magick-native', 'https://codeload.github.com/dlemstra/Magick.Native/tar.gz/999720f7ebe03d5a0029536f1586a2cb82b500ae'),
    ('imagemagick', 'https://codeload.github.com/ImageMagick/ImageMagick/tar.gz/ad98b244c995d2e3051757fa3b7855f45b550d24'),
    ('dependencies-source', 'https://codeload.github.com/ImageMagick/Dependencies/tar.gz/1c21ff03809da9cc544427fcd04e965d1558d06f'),
    ('wasm-x86-static', 'https://github.com/ImageMagick/Dependencies/releases/download/2026.09.26.1516/wasm-x86-static.zip'),
]
PUBLISHED = {'wasm-x86-static': 'aa4fa82cd23b0c694713dc739bd62615de4fdf4b9c74db4105f41ff0ac2ee283'}
pins = ROOT / 'SOURCE-ARCHIVES.json'
known = json.loads(pins.read_text()) if pins.exists() else {}
records = {}
for name, url in SOURCES:
    path = ROOT / 'archives' / (name + ('.zip' if url.endswith('.zip') else '.tar.gz'))
    if not path.exists():
        print('Fetching', name, flush=True)
        with urllib.request.urlopen(url) as request, path.open('wb') as output:
            while data := request.read(1024 * 1024): output.write(data)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    expected = known.get(name, {}).get('sha256', PUBLISHED.get(name))
    if not expected: raise ValueError('Source archive pin missing: ' + name)
    if digest != expected: raise ValueError('Source archive digest differs: ' + name)
    records[name] = {'url': url, 'bytes': path.stat().st_size, 'sha256': digest,
                     'publishedDigest': name in PUBLISHED}
    if name == 'wasm-x86-static':
        output = ROOT / 'dependencies'
        if not (output / 'lib').exists():
            with zipfile.ZipFile(path) as archive:
                for item in archive.infolist():
                    dest = (output / item.filename).resolve()
                    if not dest.is_relative_to(output.resolve()): raise ValueError('Unsafe ZIP path')
                archive.extractall(output)
    else:
        output = ROOT / 'sources' / name
        if not output.exists():
            output.mkdir()
            with tarfile.open(path) as archive:
                members = archive.getmembers()
                prefix = members[0].name.split('/')[0] + '/'
                for item in members:
                    if item.name == prefix[:-1]: continue
                    if not item.name.startswith(prefix): raise ValueError('Unexpected tar prefix')
                    item.name = item.name[len(prefix):]
                    archive.extract(item, output, filter='data')
    print(name, records[name]['bytes'], digest, flush=True)
pins.write_text(json.dumps(records, indent=2) + '\n')
