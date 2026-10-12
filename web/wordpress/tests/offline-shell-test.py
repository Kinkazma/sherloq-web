"""Public browser shell inventory and clean-install landing qualification."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('offline_shell', ROOT/'offline-shell.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ShellTests(unittest.TestCase):
    def test_public_shell_and_empty_storage_landing(self):
        with tempfile.TemporaryDirectory() as tmp:
            plugin = Path(tmp)
            assets = plugin/'assets'
            assets.mkdir()
            for name in ['offline-setup.html', 'offline-setup.js', 'offline-setup.css', 'app.css',
                         'workspace-shell.css', 'media.css', 'fonts.js', 'app.webmanifest',
                         'offline-icon.svg', 'offline-icon-192.png', 'offline-icon-512.png']:
                (assets/name).write_bytes((ROOT/'sherloq-browser/assets'/name).read_bytes())
            (assets/'app.html').write_text('<html><head></head><body>public workspace</body></html>')
            (assets/'private-report.js').write_text('private site integration')
            (assets/'LICENSE.txt').write_text('public license')
            result = module.write_shell(plugin, {'files': {}, 'slots': []}, 'a'*64, 'test')
            self.assertNotIn('private-report.js', result['files'])
            public = (assets/'offline-public-app.html').read_bytes()
            self.assertIn(b'rel="manifest"', public)
            self.assertEqual(hashlib.sha256(public).hexdigest(), result['files']['app.html']['sha256'])
            landing = (assets/'offline/app.html').read_text()
            self.assertIn('src="../offline-setup.js', landing)
            for name in ['app.css', 'workspace-shell.css', 'media.css', 'offline-setup.css']:
                self.assertIn('href="../'+name, landing)
                self.assertIn(name, result['files'])
            self.assertIn('src="../fonts.js', landing)
            self.assertIn('href="app.webmanifest"', landing)
            manifest = json.loads((assets/'offline/app.webmanifest').read_text())
            self.assertTrue((assets/'offline'/manifest['start_url']).is_file())
            for icon in manifest['icons']:
                self.assertTrue((assets/'offline'/icon['src']).is_file())
                self.assertIn(icon['src'], result['files'])
            # Rebuilding neither includes its physical landing twice nor hashes
            # the private online page after an overlay has been applied.
            self.assertEqual(result, module.write_shell(plugin, {'files': {}, 'slots': []}, 'a'*64, 'test'))
            (assets/'app.html').write_text('<script src="private-report.js"></script>')
            with self.assertRaisesRegex(ValueError, 'private overlay'):
                module.write_shell(plugin, {'files': {}, 'slots': []}, 'a'*64, 'test')


if __name__ == '__main__':
    unittest.main()
