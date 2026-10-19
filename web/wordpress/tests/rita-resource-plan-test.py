#!/usr/bin/env python3
"""Verify source pins with tiny metadata fixtures, without model payloads."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1]/'scripts'/'rita-resource-plan.py'
SPEC = importlib.util.spec_from_file_location('rita_resource_plan', SCRIPT)
PLAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLAN)


class RitaResourcePlanTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.segments = root/'segments'
        self.segments.mkdir()
        operator = b'tiny operator identity fixture'
        (self.segments/'fixture.onnx').write_bytes(operator)
        self.catalog = {
            'checkpoint_sha256': '50da42c81508dd3d0f150af4245f47af8c8c0b554a392527635b7e2245aa3299',
            'source_sha256': {'fixture.py': 'a'*64},
            'assets': {'fixture': {
                'file': 'fixture.onnx', 'bytes': len(operator),
                'sha256': hashlib.sha256(operator).hexdigest(),
            }},
        }
        self.write_catalog()
        self.notice = root/'NOTICE.txt'
        self.notice.write_text('Fixture notice\n')
        self.engine = root/'engine'
        (self.engine/'src').mkdir(parents=True)
        self.names = PLAN.RITA_RUNTIME_MODULES + PLAN.SHARED_RUNTIME_MODULES
        for name in self.names:
            (self.engine/'src'/name).write_text('// '+name+'\n')

    def write_catalog(self):
        (self.segments/'manifest.json').write_text(json.dumps(self.catalog))

    def test_exact_six_rita_and_shared_pipeline_pins(self):
        self.assertEqual(len(PLAN.RITA_RUNTIME_MODULES), 6)
        self.assertIn('rita-cache-plan.js', PLAN.RITA_RUNTIME_MODULES)
        self.assertIn('gpu-buffer-ledger.js', PLAN.SHARED_RUNTIME_MODULES)
        self.assertIn('neural-session-cache.js', PLAN.SHARED_RUNTIME_MODULES)
        result = PLAN.build_plan(self.segments, self.notice, self.engine)
        pins = result['runtimeSources']
        self.assertEqual(list(pins), ['unified-engine/src/'+name for name in sorted(self.names)])
        for name in self.names:
            data = (self.engine/'src'/name).read_bytes()
            self.assertEqual(pins['unified-engine/src/'+name], {
                'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            })

    def test_deterministic_and_explicit_allowlist(self):
        first = PLAN.build_plan(self.segments, self.notice, self.engine)
        (self.engine/'src'/'rita-unreviewed-extra.js').write_text('not a dependency')
        second = PLAN.build_plan(self.segments, self.notice, self.engine)
        self.assertEqual(first, second)
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))

    def test_every_required_source_must_exist(self):
        for name in self.names:
            with self.subTest(name=name):
                path = self.engine/'src'/name
                contents = path.read_bytes()
                path.unlink()
                with self.assertRaisesRegex(ValueError, 'Missing reviewed RITA runtime module: '+name):
                    PLAN.build_plan(self.segments, self.notice, self.engine)
                path.write_bytes(contents)

    def test_source_changes_update_identity_without_changing_models(self):
        first = PLAN.build_plan(self.segments, self.notice, self.engine)
        path = self.engine/'src'/'rita-cache-plan.js'
        path.write_text(path.read_text()+'// changed\n')
        second = PLAN.build_plan(self.segments, self.notice, self.engine)
        self.assertNotEqual(first['runtimeSources'], second['runtimeSources'])
        for field in ('files', 'chunks', 'totals', 'feature', 'reconstruction'):
            self.assertEqual(first[field], second[field])
        self.assertFalse(second['rawCheckpointIsRuntimeDependency'])
        self.assertFalse(second['publicationPerformed'])

    def test_engine_source_remains_optional_for_resource_only_plan(self):
        result = PLAN.build_plan(self.segments, self.notice)
        self.assertEqual(result['runtimeSources'], {})
        self.assertEqual(result['totals']['resourceFiles'], 3)
        self.assertEqual(result['totals']['graphs'], 1)

    def test_operator_sha_and_size_are_still_verified(self):
        path = self.segments/'fixture.onnx'
        for payload in (b'x', b'x'*len(path.read_bytes())):
            with self.subTest(bytes=len(payload)):
                path.write_bytes(payload)
                with self.assertRaisesRegex(ValueError, 'RITA operator identity differs'):
                    PLAN.build_plan(self.segments, self.notice, self.engine)

    def test_unexpected_checkpoint_and_unsafe_names_are_rejected(self):
        self.catalog['checkpoint_sha256'] = '0'*64
        self.write_catalog()
        with self.assertRaisesRegex(ValueError, 'Unexpected RITA checkpoint identity'):
            PLAN.build_plan(self.segments, self.notice)
        self.catalog['checkpoint_sha256'] = '50da42c81508dd3d0f150af4245f47af8c8c0b554a392527635b7e2245aa3299'
        self.catalog['assets']['fixture']['file'] = '../fixture.onnx'
        self.write_catalog()
        with self.assertRaisesRegex(ValueError, 'Unsafe RITA resource filename'):
            PLAN.build_plan(self.segments, self.notice)


if __name__ == '__main__':
    unittest.main()
