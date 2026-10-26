"""Check reconstruction boundaries using metadata and small source fixtures."""
from pathlib import Path
import hashlib
import importlib.util
import json
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
spec = importlib.util.spec_from_file_location('rita_runtime', ROOT / 'runtime-rita.py')
rita = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rita)


class RitaRuntimeIncrementTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repo = Path(self.temporary.name)
        self.root = self.repo / 'web/wordpress'
        self.receipt_name = 'web/wordpress/runtime-patches/rita-20261019.json'
        self.receipt = json.loads((REPO / self.receipt_name).read_text())
        names = {self.receipt_name, self.receipt['manifest']['file'], self.receipt['baseline']['parentReceipt']['file']}
        names.update(r['copy'] for r in self.receipt['baseline']['snapshots'])
        names.update(r['file'] for r in self.receipt['locks'].values())
        for record in self.receipt['files']:
            names.update(record[key] for key in ['source', 'asset', 'mirror'])
        names.update('web/wordpress/feature-inputs/individual-assets/rita-native/' + name for name in ['manifest.json', 'NOTICE.txt'])
        latest_path = ROOT / 'runtime-patches/interactive-20261020.json'
        latest = {}
        if latest_path.exists():
            for r in json.loads(latest_path.read_text())['baseline']['snapshots']:
                latest[r['file']] = (REPO / r['copy']).read_bytes()
        workspace_path = ROOT / 'runtime-patches/workspace-20261020.json'
        if workspace_path.exists():
            for r in json.loads(workspace_path.read_text())['baseline']['snapshots']:
                latest.setdefault(r['file'], (REPO / r['copy']).read_bytes())
        review=json.loads((REPO/'web/wordpress/runtime-patches/review-20261021.json').read_text())
        for r in review['baseline']['snapshots']:
            latest.setdefault(r['file'],(REPO/r['copy']).read_bytes())
        for name in names:
            target = self.repo / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(latest[name] if name in latest else (REPO / name).read_bytes())
    def write_receipt(self):
        (self.repo / self.receipt_name).write_bytes(rita.encode(self.receipt))
    def test_valid_increment_retains_the_full_predecessor(self):
        receipt, previous = rita.reviewed_rita_increment(self.root)
        self.assertEqual(len(receipt['files']), 14)
        self.assertEqual(len(receipt['resources']), 110)
        self.assertIn('web-assets/manifest-template.json', previous)
        self.assertEqual(json.loads(previous['web-assets/manifest-template.json'])['files'].get('individual-assets/rita-native/manifest.json'), None)
    def test_undeclared_runtime_module_is_rejected(self):
        self.receipt['files'].append(dict(self.receipt['files'][0], file='unified-engine/src/unreviewed.js'))
        self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'source set differs'):
            rita.reviewed_rita_increment(self.root)
    def test_model_payload_identity_is_bound_to_the_original_inventory(self):
        record = next(r for r in self.receipt['resources'] if r['file'].endswith('.onnx'))
        record['after']['sha256'] = '0' * 64
        self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'model identity differs'):
            rita.reviewed_rita_increment(self.root)
    def test_predecessor_snapshot_tampering_is_rejected(self):
        path = self.repo / self.receipt['baseline']['snapshots'][0]['copy']
        path.write_bytes(path.read_bytes() + b' ')
        with self.assertRaisesRegex(ValueError, 'metadata identity differs'):
            rita.reviewed_rita_increment(self.root)
    def test_executable_and_readable_source_must_match(self):
        path = self.repo / self.receipt['files'][0]['mirror']
        path.write_bytes(path.read_bytes() + b'\n')
        with self.assertRaisesRegex(ValueError, 'source identity differs'):
            rita.reviewed_rita_increment(self.root)
    def test_resigned_inventory_cannot_add_unrelated_metadata(self):
        record = self.receipt['manifest']
        path = self.repo / record['file']
        metadata = json.loads(path.read_text())
        metadata['unreviewed'] = True
        data = rita.encode(metadata)
        path.write_bytes(data)
        record.update(size=len(data), sha256=hashlib.sha256(data).hexdigest())
        self.write_receipt()
        with self.assertRaisesRegex(ValueError, 'undeclared dependency metadata'):
            rita.reviewed_rita_increment(self.root)


if __name__ == '__main__':
    unittest.main()
