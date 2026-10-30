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

    def test_unlisted_shader_refused_despite_consistent_locks(self):
        self.write('web/engine-source/vendor/ela-gpu/ela-jpeg.wgsl', b'@compute @workgroup_size(1) fn main() {}')
        with self.assertRaisesRegex(ValueError, 'companion missing'):
            snapshot.RuntimeSnapshot(self.root)

    def test_unreferenced_chunk_cannot_change_the_deployed_identity(self):
        path = self.repo / self.receipt['manifest']['file']
        value = json.loads(path.read_bytes())
        value['chunks']['0' * 64] = 1
        self.receipt['manifest'] = self.write(self.receipt['manifest']['file'], json.dumps(value).encode())
        self.save()
        with self.assertRaisesRegex(ValueError, 'unreferenced chunks'):
            snapshot.RuntimeSnapshot(self.root)

    def test_unlisted_model_refused_despite_consistent_locks(self):
        self.write('web/engine-source/vendor/model/graph.onnx', b'model')
        with self.assertRaisesRegex(ValueError, 'companion missing'):
            snapshot.RuntimeSnapshot(self.root)

    def test_unlisted_notice_refused(self):
        self.write('web/engine-source/vendor/native/NOTICE.txt', b'Component notice')
        with self.assertRaisesRegex(ValueError, 'companion missing'):
            snapshot.RuntimeSnapshot(self.root)

    def test_build_source_is_not_a_browser_resource(self):
        self.write('web/engine-source/vendor/native/build.cpp', b'// compiler input')
        snapshot.RuntimeSnapshot(self.root)

    def test_pdf_query_does_not_replace_the_required_module(self):
        self.write('web/wordpress/sherloq-browser/assets/pdf-native-library.js',
                   ("export * from './batch-vendor/pdf.mjs?sherloq-display=1-"+'0'*64+"';").encode())
        with self.assertRaisesRegex(ValueError, 'PDF display binding differs'):
            snapshot.RuntimeSnapshot(self.root)


if __name__=='__main__':
    unittest.main()
