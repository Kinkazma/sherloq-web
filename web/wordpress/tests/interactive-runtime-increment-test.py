"""Verify source, binary and inventory boundaries of the interactive layer."""
from pathlib import Path
import importlib.util
import json
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
spec = importlib.util.spec_from_file_location('interactive', ROOT / 'runtime-interactive.py')
layer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(layer)


class InteractiveIncrementTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.root = self.repo / 'web/wordpress'
        self.name = 'web/wordpress/runtime-patches/interactive-20261020.json'
        self.receipt = json.loads((REPO / self.name).read_text())
        names = {self.name, self.receipt['manifest']['file'], self.receipt['baseline']['parentReceipt']['file'], self.receipt['nativeSource']['file']}
        names.update(r['copy'] for r in self.receipt['baseline']['snapshots'])
        names.update(r['file'] for r in self.receipt['locks'].values())
        for record in self.receipt['files']:
            names.update(record[key] for key in ['source', 'asset', 'mirror'])
        for name in names:
            p = self.repo / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes((REPO / name).read_bytes())

    def write_receipt(self):
        (self.repo / self.name).write_bytes(layer.encode(self.receipt))

    def test_valid_layer_preserves_all_rita_resources(self):
        receipt, previous = layer.reviewed_interactive_increment(self.root)
        self.assertEqual(len(receipt['files']), 14)
        prior = json.loads(previous['web-assets/manifest-template.json'])
        current = json.loads((self.repo / receipt['manifest']['file']).read_text())
        models = {n: r for n, r in prior['files'].items() if n.startswith('individual-assets/rita-native/')}
        self.assertEqual(len(models), 110)
        self.assertEqual(models, {n: current['files'][n] for n in models})

    def test_canonical_source_must_match(self):
        p = self.repo / self.receipt['files'][0]['source']
        p.write_bytes(p.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'source identity differs'):
            layer.reviewed_interactive_increment(self.root)

    def test_png_native_binary_must_match(self):
        record = next(r for r in self.receipt['files'] if r['file'].endswith('.wasm'))
        p = self.repo / record['asset']
        p.write_bytes(p.read_bytes() + b'changed')
        with self.assertRaisesRegex(ValueError, 'source identity differs'):
            layer.reviewed_interactive_increment(self.root)

    def test_predecessor_receipt_is_immutable(self):
        p = self.repo / self.receipt['baseline']['parentReceipt']['file']
        p.write_bytes(p.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'metadata identity differs'):
            layer.reviewed_interactive_increment(self.root)

    def test_predecessor_snapshots_are_verified(self):
        p = self.repo / self.receipt['baseline']['snapshots'][0]['copy']
        p.write_bytes(p.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'metadata identity differs'):
            layer.reviewed_interactive_increment(self.root)

    def test_undeclared_module_is_rejected(self):
        self.receipt['files'][0]['file'] = 'unified-engine/src/undeclared.js'
        self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'source set differs'):
            layer.reviewed_interactive_increment(self.root)

    def test_resigned_inventory_cannot_change_models(self):
        ref = self.receipt['manifest']
        p = self.repo / ref['file']
        data = json.loads(p.read_text())
        data['files']['individual-assets/rita-native/manifest.json']['size'] += 1
        raw = layer.encode(data)
        p.write_bytes(raw)
        ref.update(size=len(raw), sha256=layer.digest(raw))
        self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'undeclared dependency metadata'):
            layer.reviewed_interactive_increment(self.root)

    def test_resigned_lock_cannot_change_another_runtime(self):
        ref = self.receipt['locks']['source']
        p = self.repo / ref['file']
        data = json.loads(p.read_text())
        data['runtimes'][0]['files']['src/index.js'] = '0' * 64
        raw = layer.encode(data)
        p.write_bytes(raw)
        ref.update(size=len(raw), sha256=layer.digest(raw))
        self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'undeclared runtime locks'):
            layer.reviewed_interactive_increment(self.root)


if __name__ == '__main__':
    unittest.main()
