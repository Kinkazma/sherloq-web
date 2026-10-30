"""Complete snapshots reject changed sources, locks and executable bytes."""
from pathlib import Path
import hashlib
import importlib.util
import json
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).resolve().parents[1]/'runtime-snapshot.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SnapshotIntegrity(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repo = Path(self.temporary.name)
        self.root = self.repo/'web/wordpress'
        self.data = b'export const value = 1;\n'
        self.source = self.write('web/engine-source/src/example.js', self.data)
        lock = self.write('web/wordpress/runtime-lock.json', b'{}\n')
        manifest = {'schema':'sherloq.dependencies/1','remoteBase':None,
            'files':{'unified-engine/src/example.js':{'size':len(self.data),
                'sha256':self.source['sha256'],'chunks':[self.source['sha256']]}},
            'chunks':{self.source['sha256']:len(self.data)}}
        m = self.write('web-assets/manifest-template.json', json.dumps(manifest).encode())
        self.receipt = {'schema':'sherloq.runtime-snapshot/1','manifest':m,
                        'locks':{'delivered':lock},'canonicalFiles':[self.source]}
        self.save()

    def write(self, name, data):
        path = self.repo/name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return {'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

    def save(self):
        self.write('web/wordpress/runtime-patches/current-snapshot.json',json.dumps(self.receipt).encode())

    def test_exact_sources_and_delivery(self):
        value = snapshot.RuntimeSnapshot(self.root)
        self.assertEqual(value.apply('unified-engine/src/example.js', self.data, b'other wrapper'),self.data)

    def test_changed_canonical_source(self):
        self.write(self.source['file'], b'changed')
        with self.assertRaises(ValueError):
            snapshot.RuntimeSnapshot(self.root)

    def test_changed_lock(self):
        self.write('web/wordpress/runtime-lock.json',b'changed')
        with self.assertRaises(ValueError):
            snapshot.RuntimeSnapshot(self.root)

    def test_changed_delivery(self):
        value = snapshot.RuntimeSnapshot(self.root)
        with self.assertRaises(ValueError):
            value.apply('unified-engine/src/example.js',self.data+b'changed',self.data)

    def test_unknown_delivery(self):
        with self.assertRaises(ValueError):
            snapshot.RuntimeSnapshot(self.root).apply('unreviewed.js',self.data,self.data)

    def test_parent_path_refused(self):
        self.receipt['canonicalFiles'][0]['file']='../outside.js'
        self.save()
        with self.assertRaises(ValueError):
            snapshot.RuntimeSnapshot(self.root)


if __name__=='__main__':
    unittest.main()
