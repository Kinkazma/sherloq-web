"""Small standard TARs: verified disk activation, recovery and HTTP isolation."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('offline_server',ROOT/'sherloq-browser/assets/offline-server.py')
server=importlib.util.module_from_spec(spec); spec.loader.exec_module(server)
sha=server.digest; enc=server.canonical


def fixture(directory,selective=False):
    content={'engine/core.bin':b'core','engine/option.bin':b'heavy','engine/shared.bin':b'shared'}
    files={name:{'sha256':sha(data),'size':len(data),'chunks':[sha(data)],'type':'application/octet-stream'} for name,data in content.items()}
    manifest={'schema':'sherloq.dependencies/1','slots':['engine'],'remoteBase':None,'files':files,'chunks':{sha(data):len(data) for data in content.values()}}
    catalogue={'schema':'sherloq.features/1','groups':[{'id':'optional','fr':'Option','en':'Option'}], 'features':[
        {'id':'shared','fr':'Partagé','en':'Shared','group':None,'internal':True,'protected':False,'dependsOn':[],'resources':['engine/shared.bin'],'tasks':[]},
        {'id':'core','fr':'Socle','en':'Core','group':None,'protected':True,'dependsOn':['shared'],'resources':['engine/core.bin'],'tasks':[]},
        {'id':'option','fr':'Option','en':'Option','group':'optional','protected':False,'dependsOn':['shared'],'resources':['engine/option.bin'],'tasks':[]}]}
    policy={'schema':'sherloq.feature-policy/1','disabledFeatures':['option'] if selective else [],'disabledGroups':[]}
    app={'app.html':b'<html>old</html>','workspace-entry.js':b'old workspace','offline-server.py':b'old helper','dependency-config.json':b'{"enabled":false}',
         'offline-bridge.html':b'<html>bridge</html>','offline-bridge.js':b'// bridge'}
    shell={'schema':'sherloq.offline-shell/1','version':'1','manifest':sha(enc(manifest)),'catalog':sha(enc(catalogue)),'files':{name:{'sha256':sha(data),'size':len(data)} for name,data in app.items()}}
    archive=directory/'old.tar'
    with tarfile.open(archive,'w',format=tarfile.USTAR_FORMAT) as tar:
        def add(name,data):
            meta=tarfile.TarInfo(name);meta.size=len(data);tar.addfile(meta,io.BytesIO(data))
        add('offline-kit.json',enc(shell));add('manifest.json',enc(manifest));add('feature-catalog.json',enc(catalogue));add('feature-policy.json',enc(policy))
        for name,data in app.items():add('app/'+name,data)
        for name,data in content.items():
            if not selective or name!='engine/option.bin':add(name,data)
    config={'shellSha256':sha(enc(shell)),'manifest':shell['manifest'],'port':0,'token':'a'*32}
    return server.Archive(archive,config),config,catalogue,policy


def prepare(library,catalogue,policy,version='2',body=b'<html>new</html>'):
    manifest={**library.archive.manifest,'remoteBase':'https://raw.githubusercontent.com/Kinkazma/sherloq-web/'+'a'*40+'/web-assets/'}
    shell={**library.archive.shell,'version':version,'manifest':sha(enc(manifest)),'catalog':sha(enc(catalogue)),'files':{**library.archive.shell['files'],'app.html':{'size':len(body),'sha256':sha(body)}}}
    library.upload(sha(body),io.BytesIO(body),len(body))
    release={'schema':'sherloq.local-release/1','version':version}
    for name,value in [('shell',shell),('manifest',manifest),('catalog',catalogue)]:
        data=enc(value);release[name]={'sha256':sha(data),'size':len(data),'url':'https://example.invalid/'+name};library.upload(sha(data),io.BytesIO(data),len(data))
    return library.prepare({'shell':shell,'manifest':manifest,'catalog':catalogue,'policy':policy,'release':release})


class ManagedTests(unittest.TestCase):
    def test_file_launcher_allows_only_read_only_top_level_navigation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,config,_,_=fixture(root,True);store=server.ManagedLibrary(archive,root/'managed')
            http=server.make_server(archive,config,store);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            host=f'127.0.0.1:{http.server_port}';base='http://'+host+'/'
            route='__sherloq_bridge/'+config['token']+'/offline-bridge.html'
            navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}
            try:
                for method in ['GET','HEAD']:
                    for origin in [None,'null']:
                        headers={**navigation,**({'Origin':origin} if origin else {})}
                        with urlopen(Request(base+route,method=method,headers=headers)) as response:
                            self.assertEqual(response.status,200);self.assertEqual(response.read(),b'<html>bridge</html>' if method=='GET' else b'')
                for method,headers,path in [
                    ('GET',{**navigation,'Sec-Fetch-Mode':'cors'},route),
                    ('GET',{**navigation,'Sec-Fetch-Dest':'iframe'},route),
                    ('GET',{**navigation,'Origin':'https://foreign.invalid'},route),
                    ('GET',{**navigation,'Host':'evil.test'},route),
                    ('POST',navigation,config['token']+'/__managed/policy'),
                    ('POST',{**navigation,'Origin':'null'},config['token']+'/__stop'),
                    ('PUT',navigation,config['token']+'/__managed/objects/'+sha(b'data'))]:
                    with self.assertRaises(HTTPError) as failure:
                        urlopen(Request(base+path,method=method,headers=headers,data=b'{}' if method in ['POST','PUT'] else None))
                    self.assertEqual(failure.exception.code,403,(method,headers,path))
                self.assertEqual(store.state['active'],store.baseline)
                self.assertEqual(store.record()['policy'],archive.policy)
            finally:http.shutdown();http.server_close();thread.join()

    def test_raw_baseline_identity_survives_activation_fallback_and_rollback(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);old,config,catalogue,policy=fixture(root,True)
            with tarfile.open(old.path,'r:') as tar:
                members={member.name:tar.extractfile(member).read() for member in tar}
            raw_shell=(json.dumps(old.shell,indent=2)+'\n').encode()
            members['offline-kit.json']=raw_shell;config['shellSha256']=sha(raw_shell)
            with tarfile.open(old.path,'w:') as tar:
                for name,data in members.items():
                    member=tarfile.TarInfo(name);member.size=len(data);tar.addfile(member,io.BytesIO(data))
            archive=server.Archive(old.path,config);store=server.ManagedLibrary(archive,root/'managed')
            self.assertEqual(store.state['active'],sha(raw_shell))
            self.assertEqual(store.read_object(sha(raw_shell),len(raw_shell)),raw_shell)
            self.assertEqual(store.object_size(sha(raw_shell)),len(raw_shell))
            identity=prepare(store,catalogue,policy);store.activate(identity)
            self.assertEqual(store.state['previous'],sha(raw_shell))
            http=server.make_server(archive,config,store);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{http.server_port}/'+config['token']+'/'
            try:
                with urlopen(Request(base+'__shell.json',headers={'X-Sherloq-Release':sha(raw_shell)})) as response:
                    self.assertEqual(response.read(),raw_shell);self.assertEqual(response.headers['X-Sherloq-Release'],sha(raw_shell))
                store.rollback();self.assertEqual(store.state['active'],sha(raw_shell))
                with urlopen(base+'__shell.json') as response:self.assertEqual(response.read(),raw_shell)
                with urlopen(base+'__features.json') as response:self.assertEqual(response.read(),archive.catalog_bytes)
            finally:http.shutdown();http.server_close();thread.join()

    def test_declared_catalogue_sha_rejects_changed_and_missing_root_metadata(self):
        for omit in [False,True]:
            with tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary);old,config,catalogue,_=fixture(root)
                with tarfile.open(old.path,'r:') as tar:
                    members={member.name:tar.extractfile(member).read() for member in tar}
                if omit:members.pop('feature-catalog.json')
                else:
                    changed=json.loads(json.dumps(catalogue));changed['features'][0]['fr']='Changed valid JSON'
                    members['feature-catalog.json']=enc(changed)
                with tarfile.open(old.path,'w:') as tar:
                    for name,data in members.items():
                        member=tarfile.TarInfo(name);member.size=len(data);tar.addfile(member,io.BytesIO(data))
                with self.assertRaisesRegex(ValueError,'catalogue does not match'):
                    server.Archive(old.path,config)

    def test_portable_archive_can_change_policy_without_a_separate_bridge(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,_,_,_=fixture(root);original=sha(archive.path.read_bytes())
            store=server.ManagedLibrary(archive,root/'managed')
            self.assertEqual(store.state['active'],store.baseline)
            removed={'schema':'sherloq.feature-policy/1','disabledFeatures':['option'],'disabledGroups':[]}
            store.policy(removed)
            reopened=server.ManagedLibrary(archive,root/'managed')
            self.assertEqual(reopened.record()['policy'],removed)
            self.assertNotIn('engine/option.bin',reopened.record()['selectedPaths'])
            self.assertEqual(list(store.objects.iterdir()),[])
            self.assertEqual(sha(archive.path.read_bytes()),original)

    def test_two_phase_resume_rollback_and_content_reuse(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,_,catalogue,policy=fixture(root);original_archive_sha=sha(archive.path.read_bytes());store=server.ManagedLibrary(archive,root/'managed')
            identity=prepare(store,catalogue,policy)
            self.assertEqual(store.state['active'],store.baseline)
            restarted=server.ManagedLibrary(archive,root/'managed');self.assertEqual(restarted.state['candidate'],identity)
            restarted.activate(identity);self.assertEqual(restarted.record()['shell']['version'],'2')
            self.assertEqual(b''.join(restarted.blocks('engine/core.bin',archive.manifest['files']['engine/core.bin'],archive.manifest,0,4)),b'core')
            self.assertEqual(b''.join(restarted.blocks('app.html',restarted.record()['shell']['files']['app.html'],None,0,16)),b'<html>new</html>')
            restarted.rollback();self.assertEqual(restarted.record()['shell']['version'],'1')
            self.assertEqual(sha(archive.path.read_bytes()),original_archive_sha)

    def test_truncated_or_corrupt_objects_never_replace_active(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,_,catalogue,policy=fixture(root);store=server.ManagedLibrary(archive,root/'managed')
            identity=prepare(store,catalogue,policy);store.activate(identity)
            with self.assertRaisesRegex(ValueError,'Truncated'):store.upload(sha(b'ab'),io.BytesIO(b'a'),2)
            with self.assertRaisesRegex(ValueError,'SHA-256'):store.upload(sha(b'ab'),io.BytesIO(b'aa'),2)
            self.assertEqual(store.state['active'],identity)
            next_identity=prepare(store,catalogue,policy,'3',b'<html>NEW</html>')
            store.object_path(sha(b'<html>NEW</html>')).write_bytes(b'<html>BAD</html>')
            with self.assertRaisesRegex(ValueError,'Corrupt'):store.activate(next_identity)
            self.assertEqual(store.state['active'],identity)

    def test_selection_keeps_shared_and_reinstall_requires_real_bytes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,_,catalogue,policy=fixture(root,True);store=server.ManagedLibrary(archive,root/'managed')
            identity=prepare(store,catalogue,policy);store.activate(identity)
            self.assertIn('engine/shared.bin',store.record()['selectedPaths']);self.assertNotIn('engine/option.bin',store.record()['selectedPaths'])
            active={'schema':'sherloq.feature-policy/1','disabledFeatures':[],'disabledGroups':[]}
            with self.assertRaisesRegex(ValueError,'Missing'):store.policy(active)
            body=b'heavy';store.upload(sha(body),io.BytesIO(body),len(body));store.policy(active)
            self.assertIn('engine/option.bin',store.record()['selectedPaths'])
            result=store.collect([sha(body)]);self.assertEqual(result['managedBytesRemoved'],0);self.assertEqual(result['archiveBytesRemoved'],0)

    def test_http_scoped_metadata_ranges_and_origin_rejection(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,config,catalogue,policy=fixture(root);store=server.ManagedLibrary(archive,root/'managed')
            identity=prepare(store,catalogue,policy);store.activate(identity)
            http=server.make_server(archive,config,store);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{http.server_port}/'+config['token']+'/'
            try:
                with urlopen(base+'dependency-config.json') as response:
                    state=json.load(response);self.assertTrue(state['managedStorage']);self.assertEqual(state['version'],'2');self.assertEqual(response.headers['Cross-Origin-Embedder-Policy'],'require-corp')
                with urlopen(Request(base+'engine/core.bin',headers={'Range':'bytes=0-1'})) as response:self.assertEqual(response.status,206);self.assertEqual(response.read(),b'co')
                with self.assertRaises(HTTPError) as failure:urlopen(Request(base+'__managed/policy',data=enc({'policy':policy}),headers={'Origin':'https://untrusted.invalid','Content-Type':'application/json'}))
                self.assertEqual(failure.exception.code,403)
                with urlopen(base+'__shell.json') as response:self.assertEqual(sha(response.read()),identity)
                with urlopen(base+'__shell-file/dependency-config.json') as response:self.assertEqual(response.read(),b'{"enabled":false}')
                with urlopen(base+'__offline-status.json') as response:
                    state=json.load(response);self.assertTrue(state['complete']);self.assertEqual(state['shell'],identity);self.assertEqual(state['storage'],'archive')
                with self.assertRaises(HTTPError) as failure:urlopen(base+'../app.html')
                self.assertEqual(failure.exception.code,400)
            finally:http.shutdown();http.server_close();thread.join()

    def test_first_bridge_outside_legacy_worker_exposes_only_verified_ui(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,config,catalogue,policy=fixture(root);store=server.ManagedLibrary(archive,root/'managed')
            identity=prepare(store,catalogue,policy);store.activate(identity)
            http=server.make_server(archive,config,store);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{http.server_port}/__sherloq_bridge/'+config['token']+'/'
            try:
                for name,data in [('offline-bridge.html',b'<html>bridge</html>'),('offline-bridge.js',b'// bridge')]:
                    with urlopen(base+name) as response:self.assertEqual(response.read(),data);self.assertEqual(response.headers['X-Sherloq-Release'],identity)
                for name in ['engine/core.bin','__managed/status','__manifest.json','__stop']:
                    with self.assertRaises(HTTPError) as failure:urlopen(base+name)
                    self.assertEqual(failure.exception.code,404)
                with self.assertRaises(HTTPError) as failure:urlopen(Request(base+'offline-bridge.html',headers={'Origin':'https://untrusted.invalid'}))
                self.assertEqual(failure.exception.code,403)
            finally:http.shutdown();http.server_close();thread.join()

    def test_failed_atomic_activation_keeps_in_memory_and_disk_reference(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,_,catalogue,policy=fixture(root);store=server.ManagedLibrary(archive,root/'managed')
            first=prepare(store,catalogue,policy);store.activate(first);second=prepare(store,catalogue,policy,'3',b'changed')
            saved=dict(store.state);atomic=store.atomic
            def refuse(path,data):
                if path==store.state_file:raise OSError('No space left')
                atomic(path,data)
            store.atomic=refuse
            with self.assertRaisesRegex(OSError,'No space'):store.activate(second)
            self.assertEqual(store.state,saved)
            self.assertEqual(server.ManagedLibrary(archive,root/'managed').state,saved)
            self.assertEqual(store.record()['shell']['version'],'2')

    def test_http_release_selector_pins_retained_bytes_and_rejects_unknown_helper(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,config,catalogue,policy=fixture(root);store=server.ManagedLibrary(archive,root/'managed')
            first=prepare(store,catalogue,policy,'2',b'first');store.activate(first)
            second=prepare(store,catalogue,policy,'3',b'second');store.activate(second)
            http=server.make_server(archive,config,store);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base=f'http://127.0.0.1:{http.server_port}/'+config['token']+'/'
            try:
                for identity,expected in [(first,b'first'),(second,b'second')]:
                    with urlopen(Request(base+'app.html',headers={'X-Sherloq-Release':identity})) as response:
                        self.assertEqual(response.read(),expected);self.assertEqual(response.headers['X-Sherloq-Release'],identity)
                    with urlopen(Request(base+'__shell.json',headers={'X-Sherloq-Release':identity})) as response:
                        self.assertEqual(sha(response.read()),identity);self.assertEqual(response.headers['X-Sherloq-Release'],identity)
                with self.assertRaises(HTTPError) as failure:urlopen(Request(base+'app.html',headers={'X-Sherloq-Release':'f'*64}))
                self.assertEqual(failure.exception.code,409)
                with urlopen(Request(base+'__managed/status',headers={'X-Sherloq-Release':'f'*64})) as response:self.assertEqual(json.load(response)['active'],second)
            finally:http.shutdown();http.server_close();thread.join()

    def test_rollback_retains_voluntary_removal_and_retention_is_bounded(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);archive,_,catalogue,policy=fixture(root);store=server.ManagedLibrary(archive,root/'managed')
            first=prepare(store,catalogue,policy,'2',b'first');store.activate(first)
            second=prepare(store,catalogue,policy,'3',b'second');store.activate(second)
            removed={'schema':'sherloq.feature-policy/1','disabledFeatures':[],'disabledGroups':['optional']};store.policy(removed)
            store.rollback();self.assertEqual(store.record()['policy'],removed);self.assertNotIn('engine/option.bin',store.record()['selectedPaths'])
            third=prepare(store,catalogue,removed,'4',b'third');store.activate(third)
            fourth=prepare(store,catalogue,removed,'5',b'fourth');store.activate(fourth)
            self.assertFalse(store.object_path(sha(b'first')).exists());self.assertFalse(store.object_path(sha(b'second')).exists())
            self.assertTrue(store.object_path(sha(b'third')).exists());self.assertTrue(store.object_path(sha(b'fourth')).exists())


if __name__=='__main__':unittest.main()
