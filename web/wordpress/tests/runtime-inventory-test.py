"""Local browser inventory admits new companions and one verified Worker only."""
from pathlib import Path
import hashlib
import importlib.util
import json
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).resolve().parents[1] / 'runtime-inventory.py')
inventory = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inventory)


class RuntimeInventory(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve() / 'engine'
        self.root.mkdir()

    def write(self, name, data=b'export const value=1;\n'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def generated(self):
        bundle = self.write('src/worker-bundle-' + 'a' * 20 + '.mjs')
        selector = self.write('src/engine-worker-entry.js', ('export const engineWorkerURL=base=>new URL("./' + bundle.name + '",base);\n').encode())
        artifacts = [{'path': p.relative_to(self.root).as_posix(), 'bytes': p.stat().st_size,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in (bundle, selector)]
        self.write('worker-bundle-build.json', json.dumps({'schema': 'sherloq.worker-build/1', 'artifacts': artifacts}).encode())
        return bundle, selector

    def names(self):
        return {p.relative_to(self.root).as_posix() for p in inventory.runtime_paths(self.root)}

    def test_new_untracked_modules_and_shaders_are_admitted(self):
        for name in ('src/new.js', 'src/new-gpu.wgsl', 'vendor/new/native.wasm', 'experiments/new/worker.mjs', 'vendor/new/NOTICE.txt'):
            self.write(name)
        self.write('scripts/private.json')
        self.write('src/.private/secret.json')
        self.write('vendor/native/build.cpp')
        self.assertEqual(self.names(), {'src/new.js', 'src/new-gpu.wgsl', 'vendor/new/native.wasm', 'experiments/new/worker.mjs', 'vendor/new/NOTICE.txt'})

    def test_only_selected_verified_worker_is_admitted(self):
        active, selector = self.generated()
        self.write('src/worker-bundle-' + 'b' * 20 + '.mjs')
        self.assertEqual(self.names(), {'src/' + active.name, 'src/' + selector.name, 'worker-bundle-build.json'})

    def test_changed_selected_artifact_is_refused(self):
        active, _ = self.generated()
        active.write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError, 'identity differs'):
            self.names()

    def test_selector_cannot_reactivate_a_different_bundle(self):
        _, selector = self.generated()
        selector.write_text('export const engineWorkerURL=base=>new URL("./worker-bundle-' + 'b' * 20 + '.mjs",base);')
        with self.assertRaisesRegex(ValueError, 'inventory differ'):
            self.names()

    def test_source_selector_does_not_admit_old_artifacts(self):
        self.write('src/worker.js')
        self.write('src/engine-worker-entry.js', b"export const engineWorkerURL=base=>new URL('./worker.js',base);\n")
        self.write('src/worker-bundle-' + 'a' * 20 + '.mjs')
        self.assertEqual(self.names(), {'src/worker.js', 'src/engine-worker-entry.js'})

    def test_nonliteral_selector_is_refused(self):
        self.write('src/engine-worker-entry.js', b'export const engineWorkerURL=base=>new URL(dynamic,base);')
        with self.assertRaisesRegex(ValueError, 'one literal'):
            self.names()

    def test_external_symlink_is_refused(self):
        outside = Path(self.tmp.name) / 'outside.js'
        outside.write_text('private')
        target = self.root / 'src/alias.js'
        target.parent.mkdir()
        target.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, 'escapes canonical root'):
            self.names()


if __name__ == '__main__':
    unittest.main()
