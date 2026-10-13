import hashlib
import http.client
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import threading
import unittest

spec = importlib.util.spec_from_file_location('offline', Path(__file__).parents[1]/'sherloq-browser/assets/offline-server.py')
offline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offline)


class OfflineServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)/'standard.tar'
        self.html = b'<!doctype html><title>offline</title>'
        self.model = b'\x00asm\x01\x00\x00\x00'
        file = lambda b: {'size': len(b), 'sha256': offline.digest(b), 'chunks':[offline.digest(b)], 'type':'application/wasm'}
        self.manifest = {'schema':'sherloq.dependencies/1','slots':['engine'],'files':{'engine/module.wasm':file(self.model)},'chunks':{offline.digest(self.model):len(self.model)},'remoteBase':None}
        canonical = lambda v: (json.dumps(v,sort_keys=True,separators=(',',':'))+'\n').encode()
        self.shell = {'schema':'sherloq.offline-shell/1','version':'0.15.2-test','manifest':offline.digest(canonical(self.manifest)),'files':{'app.html':{'size':len(self.html),'sha256':offline.digest(self.html)}}}
        self.config={'port':0,'token':'a'*32,'manifest':self.shell['manifest'],'shellSha256':offline.digest(canonical(self.shell))}
        with tarfile.open(self.path, 'w:', format=tarfile.USTAR_FORMAT) as tar:
            for name,data in [('manifest.json',canonical(self.manifest)),('offline-kit.json',canonical(self.shell)),('app/app.html',self.html),('engine/module.wasm',self.model)]:
                info=tarfile.TarInfo(name);info.size=len(data);tar.addfile(info,io.BytesIO(data))
        self.archive=offline.Archive(self.path,self.config)
        self.server=offline.make_server(self.archive,self.config)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()

    def request(self,path,headers=None):
        c=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        c.request('GET','/'+self.config['token']+'/'+path,headers=headers or {})
        r=c.getresponse();result=r.status,dict(r.getheaders()),r.read();c.close();return result

    def test_original_bytes_shared_memory_headers_and_no_remote_policy(self):
        status,headers,data=self.request('engine/module.wasm')
        self.assertEqual((status,data),(200,self.model));self.assertEqual(headers['Cross-Origin-Embedder-Policy'],'require-corp')
        self.assertIn("connect-src 'self'",headers['Content-Security-Policy']);self.assertNotIn('https:',headers['Content-Security-Policy'])
        self.assertEqual(self.request('engine/module.wasm',{'Range':'bytes=2-5'})[2],self.model[2:6])
        self.assertEqual(self.request('engine/module.wasm',{'Range':'bytes=-2'})[2],self.model[-2:])
        self.assertEqual(self.request('engine/module.wasm',{'Range':'bytes=10-'})[0],416)
        self.assertFalse(json.loads(self.request('dependency-config.json')[2])['enabled'])

    def test_no_unrelated_files_cross_site_access_or_private_transport(self):
        self.assertEqual(self.request('../standard.tar')[0],400)
        self.assertEqual(self.request('app.html',{'Host':'evil.test'})[0],403)
        self.assertEqual(self.request('app.html',{'Origin':'https://remote.test'})[0],403)
        self.assertEqual(self.request('private-report.js')[0],404)

    def test_wrong_archive_and_changed_archive_fail_closed(self):
        with self.assertRaises(ValueError):offline.Archive(self.path,{**self.config,'manifest':'f'*64})
        self.path.write_bytes(self.path.read_bytes()+b'changed')
        self.assertEqual(self.request('engine/module.wasm')[0],503)

    def test_optional_models_do_not_block_startup_and_present_bytes_are_verified(self):
        spec = importlib.util.spec_from_file_location('verify_archive', Path(__file__).parents[1]/'scripts/verify-offline-archive.py')
        verifier = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(verifier)
        canonical = lambda value: (json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
        original = b'local model'
        for present, corrupt in [(False,False),(True,False),(True,True)]:
            manifest = json.loads(json.dumps(self.manifest))
            manifest['files']['engine/local.onnx'] = {'localOnly':True,'size':len(original),'sha256':offline.digest(original),'chunks':[offline.digest(original)],'type':'application/octet-stream'}
            manifest['chunks'][offline.digest(original)] = len(original)
            shell = {**self.shell,'version':'test','manifest':offline.digest(canonical(manifest))}
            config = {**self.config,'manifest':shell['manifest'],'shellSha256':offline.digest(canonical(shell))}
            path = Path(self.tmp.name)/f'optional-{present}-{corrupt}.tar'
            entries = [('manifest.json',canonical(manifest)),('offline-kit.json',canonical(shell)),('app/app.html',self.html),('engine/module.wasm',self.model)]
            if present:entries.append(('engine/local.onnx',b'wrong model' if corrupt else original))
            with tarfile.open(path,'w:',format=tarfile.USTAR_FORMAT) as tar:
                for name,data in entries:
                    info=tarfile.TarInfo(name);info.size=len(data);tar.addfile(info,io.BytesIO(data))
            archive = offline.Archive(path,config)
            archive.verify('app.html')
            archive.verify('engine/module.wasm')
            if not present:
                self.assertEqual(archive.local_only_missing,{'engine/local.onnx'})
                self.assertEqual(verifier.verify(path)['localOnlyMissing'],['engine/local.onnx'])
            elif corrupt:
                with self.assertRaisesRegex(ValueError,'Corrupt'):archive.verify('engine/local.onnx')
                with self.assertRaisesRegex(ValueError,'integrity'):verifier.verify(path)
            else:
                archive.verify('engine/local.onnx')
                self.assertEqual(verifier.verify(path)['localOnlyMissing'],[])


if __name__=='__main__':unittest.main()
