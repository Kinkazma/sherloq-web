#!/usr/bin/env python3
"""Build a small public local-web bootstrap from a finalized public-only UI."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

LAUNCHER = '''#!/usr/bin/env python3
"""Start the public SHERLOQ web app on this computer."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

assets = Path(__file__).resolve().parent / 'assets'
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(assets), **kwargs)
    def translate_path(self, path):
        target = Path(super().translate_path(path)).resolve()
        if not target.is_relative_to(assets.resolve()) or target.suffix.lower() in {'.php', '.ini', '.env'}:
            return str(assets / '__unavailable__')
        return str(target)
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *args):
        pass

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=8765)
parser.add_argument('--no-browser', action='store_true')
options = parser.parse_args()
try:
    server = ThreadingHTTPServer(('127.0.0.1', options.port), Handler)
except OSError:
    raise SystemExit('The local port is occupied. Close the previous SHERLOQ launcher, or use --port with a free port.')
url = f'http://127.0.0.1:{server.server_port}/app.html#lang=auto'
print('SHERLOQ — ' + url, flush=True)
print('Keep this window open. Ctrl+C stops SHERLOQ.', flush=True)
if not options.no_browser:
    webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
'''
MAC_LAUNCHER = '''#!/bin/sh
set -eu
launch_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$launch_directory/Launch-SHERLOQ.py" "$@"
'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plugin', type=Path, required=True,
                        help='Finalized public-only plugin directory, never a private-overlay build')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--notice', type=Path, action='append', default=[])
    args = parser.parse_args()
    assets = args.plugin / 'assets'
    if b'private-report' in (assets / 'app.html').read_bytes() or (args.plugin / 'private').exists():
        raise ValueError('Refusing a private site integration in the public bootstrap')
    config = json.loads((assets / 'dependency-config.json').read_text())
    manifest = json.loads((assets / ('dependency-manifest-' + config['manifest'] + '.json')).read_text())
    origin = manifest['remoteBase']
    if not origin:
        raise ValueError('Bootstrap needs its configured dependency origin')
    version = config['workerVersion']
    readme = f'''SHERLOQ Web {version} — small public bootstrap

SHERLOQ was created by Guido Bartoli and the original contributors:
https://github.com/GuidoBartoli/sherloq
Web adaptation and full source: https://github.com/Kinkazma/sherloq-web
Try online: https://gaeldauchy.com/sherloq/

Extract this ZIP. With Python 3.9 or later installed, run:
    python3 Launch-SHERLOQ.py
On macOS you can also open Launch-SHERLOQ.command.
Keep the launcher window open while using SHERLOQ.

The launcher serves the application on this computer; analysis runs in your
browser. Internet access downloads the selected methods' dependencies from
the pinned GitHub library. Use Take offline to prepare a complete saved local
library. Optional research models can be imported into that library under
their component terms. The same localhost port preserves browser storage
between launches; changing the port creates a different browser origin.

Dependency origin: {origin}
Manifest SHA-256: {config['manifest']}
Component notices are in notices/ and the full source repository.
'''
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file in sorted(assets.rglob('*')):
            if file.is_file() and file.suffix != '.php' and not file.name.startswith('.'):
                archive.write(file, 'SHERLOQ-Web/assets/' + file.relative_to(assets).as_posix())
        for name, data, mode in [('Launch-SHERLOQ.py', LAUNCHER, 0o100755),
                                 ('Launch-SHERLOQ.command', MAC_LAUNCHER, 0o100755),
                                 ('README.txt', readme, 0o100644)]:
            info = zipfile.ZipInfo('SHERLOQ-Web/' + name)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = mode << 16
            archive.writestr(info, data)
        for notice in args.notice:
            archive.write(notice, 'SHERLOQ-Web/notices/' + notice.name)
    size = args.output.stat().st_size
    if size > 20_000_000:
        raise ValueError('Compressed public bootstrap ZIP exceeds 20 MB')
    with zipfile.ZipFile(args.output) as archive:
        if archive.testzip() is not None:
            raise ValueError('Bootstrap ZIP CRC mismatch')
    result = {'artifact': args.output.name, 'bytes': size,
              'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
              'version': version, 'resourceOrigin': origin,
              'manifestSha256': config['manifest'], 'privateOverlayIncluded': False,
              'scientificModelsBundled': False, 'compressedLimitBytes': 20_000_000}
    args.output.with_suffix('.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
