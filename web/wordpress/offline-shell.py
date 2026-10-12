"""Bind public shell bytes to an immutable offline application inventory."""
import hashlib
import json
from pathlib import Path


def write_shell(plugin, manifest, identity, version):
    assets = Path(plugin) / 'assets'
    files = {}
    for p in sorted(assets.rglob('*')):
        if not p.is_file():
            continue
        name = p.relative_to(assets).as_posix()
        if name in manifest['files'] or any(name.startswith(s + '/') for s in manifest['slots']):
            continue
        if name.startswith(('private', 'offline/', 'dependency-manifest-')) or name in ['offline-shell.json', 'offline-public-app.html', '.htaccess']:
            continue
        if p.suffix not in ['.js', '.mjs', '.json', '.html', '.css', '.woff2', '.txt', '.py', '.svg', '.webmanifest', '.png']:
            continue
        data = p.read_bytes()
        if p.suffix == '.html' and b'private-report' in data:
            raise ValueError('Build the offline inventory before applying the private overlay')
        if name == 'app.html':
            data = data.replace(b'</head>', b'<link rel="manifest" href="app.webmanifest"><link rel="apple-touch-icon" href="offline-icon-192.png"><meta name="theme-color" content="#172537"></head>')
        files[name] = {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        if name == 'app.html':
            (assets / 'offline-public-app.html').write_bytes(data)
            files[name]['source'] = 'offline-public-app.html'
    license_file = Path(plugin) / 'LICENSE'
    if license_file.exists():
        data = license_file.read_bytes()
        (assets / 'offline-LICENSE.txt').write_bytes(data)
        files['offline-LICENSE.txt'] = {'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    result = {'schema': 'sherloq.offline-shell/1', 'version': version, 'manifest': identity, 'files': files}
    (assets / 'offline-shell.json').write_text(json.dumps(result, sort_keys=True, separators=(',', ':'))+'\n')
    # A newly installed Home Screen app may have separate storage from Safari.
    # Its real start URL must open setup online even before its SW is installed.
    landing = (assets / 'offline-setup.html').read_text().replace('href="offline-setup.css', 'href="../offline-setup.css').replace('src="offline-setup.js', 'src="../offline-setup.js')
    landing = landing.replace('</head>', '<link rel="manifest" href="app.webmanifest"><link rel="apple-touch-icon" href="offline-icon-192.png"></head>')
    (assets / 'offline').mkdir(exist_ok=True)
    for name in ['app.html', 'offline-setup.html']:
        (assets / 'offline' / name).write_text(landing)
    for name in ['app.webmanifest', 'offline-icon.svg', 'offline-icon-192.png', 'offline-icon-512.png']:
        (assets / 'offline' / name).write_bytes((assets / name).read_bytes())
    return result
