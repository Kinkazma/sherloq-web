#!/usr/bin/env python3
"""SHERLOQ local archive and verified managed-library server. Standard library.

Usage: python3 sherloq-local.py SHERLOQ.html [--no-browser]
The browser performs the calculations; this process only serves verified files
from an ordinary, uncompressed TAR, bound exclusively to 127.0.0.1.
"""
import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import tarfile
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit

CHANNEL = 'https://raw.githubusercontent.com/Kinkazma/sherloq-web/main/releases/stable.json'


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)+'\n').encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(name):
    return bool(name) and not name.startswith('/') and '\\' not in name and ':' not in name and all(p not in ['', '.', '..'] for p in name.split('/')) and not any(ord(c) < 32 for c in name)


class Archive:
    def __init__(self, path, config):
        self.path = path.resolve()
        self.stat = self.path.stat()
        self.members = {}
        with tarfile.open(self.path, 'r:') as tar:
            for member in tar:
                if not member.isfile() or not safe_path(member.name) or member.name in self.members:
                    raise ValueError('Invalid archive member: ' + member.name)
                if member.offset_data + member.size > self.stat.st_size:
                    raise ValueError('Truncated archive')
                self.members[member.name] = (member.offset_data, member.size)
        self.shell_bytes = self.read_small('offline-kit.json')
        self.shell = json.loads(self.shell_bytes)
        if digest(self.shell_bytes) != config['shellSha256']:
            raise ValueError('The archive is not the one selected for this HTML (application identity)')
        self.manifest = json.loads(self.read_small('manifest.json'))
        canonical = (json.dumps(self.manifest, sort_keys=True, separators=(',', ':'))+'\n').encode()
        self.manifest_bytes = canonical
        if digest(canonical) != config['manifest'] or self.shell['manifest'] != config['manifest']:
            raise ValueError('The archive is not the one selected for this HTML (resources identity)')
        if self.manifest.get('schema') != 'sherloq.dependencies/1' or self.shell.get('schema') != 'sherloq.offline-shell/1':
            raise ValueError('Unsupported archive version')
        self.catalog_bytes = self.read_small('feature-catalog.json') if 'feature-catalog.json' in self.members else None
        self.catalog = json.loads(self.catalog_bytes) if self.catalog_bytes is not None else None
        if self.shell.get('catalog') and (self.catalog_bytes is None or digest(self.catalog_bytes) != self.shell['catalog']):
            raise ValueError('The archive catalogue does not match its application identity')
        self.policy = json.loads(self.read_small('feature-policy.json')) if 'feature-policy.json' in self.members else {'schema':'sherloq.feature-policy/1','disabledFeatures':[],'disabledGroups':[]}
        self.selected = set(ManagedLibrary.selected(self.catalog,self.policy,self.manifest)) if self.catalog else set(self.manifest['files'])
        if not self.catalog and (self.policy['disabledFeatures'] or self.policy['disabledGroups']):
            raise ValueError('A selective archive requires its feature catalogue')
        self.files = {}
        self.local_only_missing = set()
        for name, meta in self.shell['files'].items():
            self.files[name] = ('app/'+name, meta)
        for name, meta in self.manifest['files'].items():
            if name in self.files:
                raise ValueError('Duplicate application/resource name')
            if 'localOnly' in meta and not isinstance(meta['localOnly'], bool):
                raise ValueError('Invalid local-only dependency policy')
            if name not in self.selected and name not in self.members:
                if not safe_path(name) or not re.fullmatch('[a-f0-9]{64}',meta['sha256']): raise ValueError('Invalid excluded resource identity')
                continue
            if meta.get('localOnly') and name not in self.members:
                if not safe_path(name) or not re.fullmatch('[a-f0-9]{64}', meta['sha256']):
                    raise ValueError('Invalid local-only dependency identity')
                self.local_only_missing.add(name)
                continue
            self.files[name] = (name, meta)
        for name, (member, meta) in self.files.items():
            if not safe_path(name) or self.members.get(member, (-1, -1))[1] != meta['size'] or not re.fullmatch('[a-f0-9]{64}', meta['sha256']):
                raise ValueError('Missing or invalid offline file: '+name)
        self.verified = set()
        self.locks = {}
        self.lock = threading.Lock()

    def read_small(self, member):
        at, size = self.members[member]
        if size > 20_000_000:
            raise ValueError('Oversized archive metadata')
        with self.path.open('rb') as f:
            f.seek(at)
            return f.read(size)

    def verify(self, name):
        # One bounded hash pass per file, never a whole-model allocation.
        current = self.path.stat()
        if (current.st_size, current.st_mtime_ns) != (self.stat.st_size, self.stat.st_mtime_ns):
            raise ValueError('Archive changed while in use; restart the local launcher')
        with self.lock:
            lock = self.locks.setdefault(name, threading.Lock())
        with lock:
            if name in self.verified:
                return
            member, meta = self.files[name]
            at, remaining = self.members[member]
            h = hashlib.sha256()
            with self.path.open('rb') as f:
                f.seek(at)
                while remaining:
                    block = f.read(min(1024*1024, remaining))
                    if not block:
                        raise ValueError('Truncated offline resource')
                    h.update(block)
                    remaining -= len(block)
            if h.hexdigest() != meta['sha256']:
                raise ValueError('Corrupt offline resource: '+name)
            self.verified.add(name)


class ManagedLibrary:
    """Content objects beside the TAR, with one crash-safe active reference.

    The original TAR is immutable. Only managed objects are collected. An
    active and one previous version are retained; a single candidate resumes.
    No resource or user data is sent to any remote endpoint by this server.
    """
    def __init__(self, archive, root):
        self.archive, self.root = archive, Path(root)
        self.objects = self.root/'objects'
        self.objects.mkdir(parents=True, exist_ok=True)
        self.state_file = self.root/'state.json'
        self.lock = threading.RLock()
        self.state = {'schema':'sherloq.managed-library/1', 'active':None, 'previous':None, 'candidate':None}
        if self.state_file.exists():
            value = json.loads(self.state_file.read_text())
            if value.get('schema') != self.state['schema']:
                raise ValueError('Unsupported managed library')
            self.state = value
        self.records = {}
        self.archive_objects={}
        for name,(member,meta) in archive.files.items():
            at,size=archive.members[member]
            self.archive_objects.setdefault(meta['sha256'],[]).append((name,at,size))
            offset=0
            for identity in meta.get('chunks',[]):
                length=archive.manifest['chunks'][identity]
                self.archive_objects.setdefault(identity,[]).append((name,at+offset,length));offset+=length
        baseline_catalog = archive.catalog or {'schema':'sherloq.features/1','groups':[], 'features':[{'id':'core','fr':'Socle','en':'Core','group':None,'protected':True,'dependsOn':[],'resources':list(archive.manifest['files']),'tasks':[]}]}
        self.baseline = digest(archive.shell_bytes)
        baseline = {'identity':self.baseline,'shell':archive.shell,'manifest':archive.manifest,'catalog':baseline_catalog,'policy':archive.policy,'selectedPaths':sorted(archive.selected),'legacyBaseline':archive.catalog is None}
        self.baseline_record=baseline
        baseline_file = self.root/(self.baseline+'.json')
        if not baseline_file.exists(): self.atomic(baseline_file,canonical(baseline))
        # An archive made by the updater is already an installed release.
        # Its policy needs an active disk record even without a first-bridge
        # command. Check every selected byte before creating that reference.
        if self.state['active'] is None and archive.catalog is not None and 'offline-bridge.html' in archive.shell['files']:
            for name, meta in archive.shell['files'].items(): self.verify_file(name, meta)
            for name in baseline['selectedPaths']:
                meta = archive.manifest['files'][name]
                if not meta.get('localOnly'): self.verify_file(name, meta, archive.manifest)
            next_state = {**self.state, 'active':self.baseline}
            self.atomic(self.state_file, canonical(next_state))
            self.state = next_state

    def atomic(self, path, data):
        temporary = path.with_name(path.name+'.part')
        with temporary.open('wb') as stream:
            stream.write(data); stream.flush(); os.fsync(stream.fileno())
        os.replace(temporary, path)
        # fsync parent where the platform permits it.
        try:
            fd = os.open(path.parent, os.O_RDONLY)
            try: os.fsync(fd)
            finally: os.close(fd)
        except OSError:
            pass

    def object_path(self, sha):
        if not re.fullmatch('[a-f0-9]{64}', sha):
            raise ValueError('Invalid managed object identity')
        return self.objects/sha

    def upload(self, sha, source, size):
        if not isinstance(size, int) or not 0 <= size <= 100_000_000:
            raise ValueError('Managed object exceeds bounded transport size')
        path = self.object_path(sha)
        with self.lock:
            if shutil.disk_usage(self.root).free<size:raise OSError('Not enough free space for a verified managed object; the active release is preserved')
            temporary = path.with_name(sha+'.part')
            h, remaining = hashlib.sha256(), size
            try:
                with temporary.open('wb') as out:
                    while remaining:
                        block = source.read(min(1024*1024, remaining))
                        if not block: raise ValueError('Truncated managed object')
                        out.write(block); h.update(block); remaining -= len(block)
                    if h.hexdigest() != sha: raise ValueError('Managed object SHA-256 mismatch')
                    out.flush(); os.fsync(out.fileno())
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)

    @staticmethod
    def selected(catalog, policy, manifest):
        if catalog.get('schema') != 'sherloq.features/1' or policy.get('schema') != 'sherloq.feature-policy/1':
            raise ValueError('Unsupported feature catalogue or policy')
        if not isinstance(catalog.get('features'),list) or not isinstance(catalog.get('groups'),list): raise ValueError('Invalid feature catalogue')
        id_ok=lambda identity:isinstance(identity,str) and bool(re.fullmatch('[a-z0-9][a-z0-9._-]{0,120}',identity))
        group_ids=set()
        for group in catalog['groups']:
            if not id_ok(group.get('id')) or group['id'] in group_ids or any(not isinstance(group.get(key),str) for key in ['fr','en']): raise ValueError('Invalid feature group')
            group_ids.add(group['id'])
        covered=set()
        for feature in catalog['features']:
            if not id_ok(feature.get('id')) or not isinstance(feature.get('protected'),bool) or any(not isinstance(feature.get(key),str) for key in ['fr','en']) or not isinstance(feature.get('resources'),list) or not isinstance(feature.get('dependsOn'),list) or not isinstance(feature.get('tasks'),list):raise ValueError('Invalid feature descriptor')
            if feature.get('group') is not None and feature.get('group') not in group_ids:raise ValueError('Unknown feature group')
            for name in feature['resources']:
                if not isinstance(name,str) or not safe_path(name) or name not in manifest['files']:raise ValueError('Unknown feature resource')
                covered.add(name)
        if covered!=set(manifest['files']):raise ValueError('Resource inventory is not fully covered')
        features = {f['id']:f for f in catalog['features']}
        if len(features) != len(catalog['features']) or 'core' not in features:
            raise ValueError('Invalid feature catalogue')
        complete=set()
        def validate_graph(identity,trail=None):
            trail=set() if trail is None else trail
            if identity in trail or identity not in features:raise ValueError('Invalid feature dependencies')
            if identity in complete:return
            for child in features[identity]['dependsOn']:validate_graph(child,trail|{identity})
            complete.add(identity)
        for identity in features:validate_graph(identity)
        for key in ['disabledFeatures','disabledGroups']:
            if not isinstance(policy.get(key,[]),list) or any(not isinstance(v,str) or not re.fullmatch('[a-z0-9][a-z0-9._-]{0,120}',v) for v in policy.get(key,[])):
                raise ValueError('Invalid feature exclusions')
        disabled = set(policy.get('disabledFeatures', [])); groups = set(policy.get('disabledGroups', []))
        def enabled(identity, trail=None):
            trail = set() if trail is None else trail
            if identity in trail or identity not in features: raise ValueError('Invalid feature dependencies')
            feature = features[identity]
            if feature.get('protected'): return True
            if identity in disabled or feature.get('group') in groups: return False
            return all(enabled(v,trail|{identity}) for v in feature.get('dependsOn',[]))
        roots = [f['id'] for f in features.values() if f.get('protected') or (not f.get('internal') and enabled(f['id']))]
        active, paths = set(), set()
        def visit(identity):
            if identity in active: return
            if identity not in features: raise ValueError('Missing feature dependency')
            active.add(identity)
            f = features[identity]
            for resource in f['resources']:
                if resource not in manifest['files']: raise ValueError('Missing catalogue resource')
                paths.add(resource)
            for dependency in f.get('dependsOn', []): visit(dependency)
        for identity in roots: visit(identity)
        return sorted(paths)

    def read_object(self, sha, size):
        path = self.object_path(sha)
        corrupt=False
        if path.exists():
            if path.stat().st_size==size:
                with path.open('rb') as stream:data=stream.read()
                if digest(data)==sha:return data
            corrupt=True
        for name,offset,length in self.archive_objects.get(sha,[]):
            if length!=size:continue
            self.archive.verify(name)
            with self.archive.path.open('rb') as stream:
                stream.seek(offset);data=stream.read(length)
            if len(data)==size and digest(data)==sha:
                if corrupt:path.unlink(missing_ok=True)
                return data
        for data in [self.archive.shell_bytes,self.archive.manifest_bytes,self.archive.catalog_bytes]:
            if data is None:continue
            if len(data)==size and digest(data)==sha:
                if corrupt:path.unlink(missing_ok=True)
                return data
        if corrupt:raise ValueError('Corrupt managed object: '+sha)
        return None

    def object_size(self, identity):
        path=self.object_path(identity)
        if path.exists():
            size=path.stat().st_size
            if self.read_object(identity,size) is not None:return size
        for _,_,size in self.archive_objects.get(identity,[]):
            if self.read_object(identity,size) is not None:return size
        for data in [self.archive.shell_bytes,self.archive.manifest_bytes,self.archive.catalog_bytes]:
            if data is not None:
                if digest(data)==identity:return len(data)
        return None

    def archive_source(self, name, meta):
        original = self.archive.files.get(name)
        if original and original[1]['sha256'] == meta['sha256'] and original[1]['size'] == meta['size']:
            self.archive.verify(name)
            return self.archive.members[original[0]]
        return None

    def chunk(self, identity):
        self.object_path(identity)
        record = self.record()
        manifest = record['manifest'] if record else self.archive.manifest
        size = manifest['chunks'].get(identity)
        if size is None: raise ValueError('Chunk is not in the active release')
        data = self.read_object(identity,size)
        if data is not None: return data
        for name,meta in self.archive.manifest['files'].items():
            offset=0
            for sha in meta['chunks']:
                length=self.archive.manifest['chunks'][sha]
                if sha==identity and name in self.archive.files:
                    self.archive.verify(name)
                    at,_=self.archive.members[self.archive.files[name][0]]
                    with self.archive.path.open('rb') as stream:
                        stream.seek(at+offset);data=stream.read(length)
                    if len(data)==size and digest(data)==identity:return data
                offset+=length
        raise ValueError('Managed chunk is unavailable')

    def verify_file(self, name, meta, manifest=None):
        if self.archive_source(name, meta): return
        if manifest is None:
            if self.read_object(meta['sha256'], meta['size']) is None: raise ValueError('Missing managed shell file: '+name)
            return
        h, size = hashlib.sha256(), 0
        for sha in meta['chunks']:
            data = self.read_object(sha, manifest['chunks'][sha])
            if data is None: raise ValueError('Missing managed resource: '+name)
            h.update(data); size += len(data)
        if size != meta['size'] or h.hexdigest() != meta['sha256']:
            raise ValueError('Managed file integrity failure: '+name)

    def prepare(self, record, bridge=False):
        with self.lock:
            shell, manifest, catalog = record['shell'], record['manifest'], record['catalog']
            if shell.get('schema') != 'sherloq.offline-shell/1' or manifest.get('schema') != 'sherloq.dependencies/1':
                raise ValueError('Unsupported candidate inventory')
            policy = record.get('policy', {'schema':'sherloq.feature-policy/1','disabledFeatures':[],'disabledGroups':[]})
            expected_manifest=digest(canonical(manifest)) if bridge else record['release']['manifest']['sha256']
            if shell['manifest'] != expected_manifest:
                raise ValueError('Shell and resources belong to different releases')
            if not bridge:
                release = record['release']
                if release.get('schema') != 'sherloq.local-release/1' or release['version'] != shell['version']:
                    raise ValueError('Incoherent managed release')
                if shell.get('catalog')!=release['catalog']['sha256']:raise ValueError('Shell and functional catalogue differ')
                for name, value in [('shell',shell), ('manifest',manifest), ('catalog',catalog)]:
                    ref = release[name]
                    encoded = self.read_object(ref['sha256'], ref['size'])
                    if encoded is None or json.loads(encoded) != value:
                        raise ValueError('Unverified candidate '+name)
            for name, meta in shell['files'].items():
                if not safe_path(name) or name.startswith('private') or not re.fullmatch('[a-f0-9]{64}', meta['sha256']):
                    raise ValueError('Unsafe managed application path')
                self.verify_file(name, meta)
            paths = self.selected(catalog, policy, manifest)
            for name in paths:
                meta = manifest['files'][name]
                if not safe_path(name): raise ValueError('Unsafe managed resource path')
                if not meta.get('localOnly'): self.verify_file(name, meta, manifest)
            identity = digest(canonical(shell)) if bridge else release['shell']['sha256']
            if identity==self.state['active']:
                if bridge:return identity
                raise ValueError('Release already active; repair its identical objects without replacing preferences or policy')
            record = {**record, 'policy':policy, 'selectedPaths':paths, 'identity':identity}
            self.atomic(self.root/(identity+'.json'), canonical(record))
            self.records[identity] = record
            next_state={**self.state,'candidate':identity}
            self.atomic(self.state_file, canonical(next_state))
            self.state=next_state
            return identity

    def record(self, identity=None):
        identity = identity or self.state['active']
        if identity is None: return None
        self.object_path(identity) # validate path before loading any record
        if identity not in self.records:
            self.records[identity] = json.loads((self.root/(identity+'.json')).read_text())
        return self.records[identity]

    def activate(self, identity, rollback=False):
        with self.lock:
            if identity==self.state['active']:
                return {'active':identity,'previous':self.state['previous'],'alreadyActive':True}
            if identity != self.state['candidate'] and not (rollback and identity==self.state['previous']): raise ValueError('Candidate is not ready')
            record = self.record(identity)
            for name, meta in record['shell']['files'].items(): self.verify_file(name, meta)
            for name in record['selectedPaths']:
                meta = record['manifest']['files'][name]
                if not meta.get('localOnly'): self.verify_file(name, meta, record['manifest'])
            old = self.state['active'] or self.baseline
            next_state={**self.state,'active':identity,'previous':old,'candidate':None}
            self.atomic(self.state_file, canonical(next_state))
            self.state=next_state
            try: collection=self.collect()
            except OSError: collection={'cleanupPending':True}
            return {'active':identity, 'previous':old,'collection':collection}

    def rollback(self):
        with self.lock:
            previous = self.state['previous']
            if not previous: raise ValueError('No previous managed release')
            current=self.record();record=self.record(previous)
            policy=current['policy'] if current else record['policy']
            if record.get('legacyBaseline') and (policy.get('disabledFeatures') or policy.get('disabledGroups')):
                raise ValueError('This pre-updater archive cannot enforce the retained exclusions; use its verified updater bridge')
            paths=self.selected(record['catalog'],policy,record['manifest'])
            for name in paths:
                meta=record['manifest']['files'][name]
                if not meta.get('localOnly'):self.verify_file(name,meta,record['manifest'])
            updated={**record,'policy':policy,'selectedPaths':paths}
            self.atomic(self.root/(previous+'.json'),canonical(updated));self.records[previous]=updated
            return self.activate(previous,rollback=True)

    def policy(self, value):
        with self.lock:
            record = self.record()
            if not record: raise ValueError('Install the updater bridge first')
            paths = self.selected(record['catalog'], value, record['manifest'])
            for name in paths:
                meta = record['manifest']['files'][name]
                if not meta.get('localOnly'): self.verify_file(name,meta,record['manifest'])
            updated = {**record,'policy':value,'selectedPaths':paths}
            self.atomic(self.root/(record['identity']+'.json'),canonical(updated))
            self.records[record['identity']] = updated
            return {'policy':value,'archiveBytesRemoved':0}

    def blocks(self, name, meta, manifest, start, length):
        source = self.archive_source(name, meta)
        if source:
            with self.archive.path.open('rb') as stream:
                stream.seek(source[0]+start)
                while length:
                    block = stream.read(min(1024*1024,length))
                    if not block: raise ValueError('Truncated archive')
                    yield block; length -= len(block)
            return
        offset = 0
        pieces = meta.get('chunks', [meta['sha256']])
        for sha in pieces:
            size = manifest['chunks'][sha] if manifest else meta['size']
            if offset+size > start and length:
                data = self.read_object(sha, size)
                if data is None: raise ValueError('Managed file unavailable')
                at = max(0,start-offset); block = data[at:at+length]
                yield block; length -= len(block)
            offset += size
            if not length: break

    def collect(self, hashes=None):
        with self.lock:
            retained = {v for v in [self.state[k] for k in ['active','previous','candidate']] if v}
            used = set()
            for identity in retained:
                record = self.record(identity)
                used.add(identity)
                if record.get('release'):
                    used.update(record['release'][key]['sha256'] for key in ['shell','manifest','catalog'])
                if record.get('releaseIdentity'): used.add(record['releaseIdentity'])
                used.update(meta['sha256'] for meta in record['shell']['files'].values())
                for meta in record['manifest']['files'].values():
                    if meta.get('localOnly'):used.update(meta['chunks'])
                for name in record['selectedPaths']:
                    used.update(record['manifest']['files'][name]['chunks'])
            removed = 0
            for path in self.objects.iterdir():
                if re.fullmatch('[a-f0-9]{64}',path.name) and path.name not in used and (hashes is None or path.name in hashes):
                    removed += path.stat().st_size; path.unlink()
            for path in self.root.glob('*.json'):
                if re.fullmatch('[a-f0-9]{64}',path.stem) and path.stem not in retained:
                    path.unlink(); self.records.pop(path.stem,None)
            return {'managedBytesRemoved':removed, 'archiveBytesRemoved':0, 'retainedReleases':len(retained)}

    def inventory(self):
        with self.lock:
            record=self.record()
            manifest=record['manifest'] if record else self.archive.manifest
            present=set();archive_chunks=set();object_chunks=set()
            for name,meta in manifest['files'].items():
                if self.archive_source(name,meta):
                    present.update(meta['chunks']);archive_chunks.update(meta['chunks'])
            for identity,size in manifest['chunks'].items():
                for name,_,length in self.archive_objects.get(identity,[]):
                    if length==size:
                        self.archive.verify(name);present.add(identity);archive_chunks.add(identity);break
                if self.object_path(identity).exists() and self.read_object(identity,size) is not None:
                    present.add(identity);object_chunks.add(identity)
            protected=set();protected_sizes={}
            for identity in [self.state['previous'],self.state['candidate']]:
                if not identity:continue
                reference=self.record(identity)
                for name in reference['selectedPaths']:
                    for sha in reference['manifest']['files'][name]['chunks']:
                        protected.add(sha);protected_sizes[sha]=reference['manifest']['chunks'][sha]
            return {'presentChunks':sorted(present),'managedPresentChunks':sorted(object_chunks),'archiveBytes':self.archive.stat.st_size,
                    'archiveResourceBytes':sum(manifest['chunks'][identity] for identity in archive_chunks),
                    'managedObjectBytes':sum(path.stat().st_size for path in self.objects.iterdir() if re.fullmatch('[a-f0-9]{64}',path.name)),
                    'managedResourceBytes':sum(manifest['chunks'][identity] for identity in object_chunks),
                    'protectedChunks':sorted(protected),'retainedBackupBytes':sum(size for sha,size in protected_sizes.items() if self.object_path(sha).exists()),
                    'availableBytes':shutil.disk_usage(self.root).free,'archiveMutable':False}


def make_server(archive, config, managed=None):
    prefix = '/' + config['token'] + '/'
    bridge_prefix = '/__sherloq_bridge/' + config['token'] + '/'
    port = config['port']

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # No image data, browsing history or requests written to disk.

        def do_HEAD(self):
            self.do_GET()

        def do_POST(self):
            if not self.authorized():
                self.send_error(403)
                return
            if self.path.startswith(prefix+'__managed/') and managed:
                try:
                    length = int(self.headers.get('Content-Length','0'))
                    if not 0 < length <= 20_000_000: raise ValueError('Invalid metadata length')
                    data = self.rfile.read(length)
                    if len(data) != length: raise ValueError('Truncated metadata')
                    body = json.loads(data); operation = self.path[len(prefix+'__managed/'):]
                    if operation == 'prepare': result = {'candidate':managed.prepare(body)}
                    elif operation == 'activate': result = managed.activate(body['candidate'])
                    elif operation == 'rollback': result = managed.rollback()
                    elif operation == 'policy': result = managed.policy(body['policy'])
                    elif operation == 'prune': result = managed.collect(set(body['hashes']))
                    elif operation == 'collect': result = managed.collect()
                    else: self.send_error(404); return
                    self.reply(canonical(result),'application/json')
                except Exception as error:
                    self.send_error(409, str(error))
                return
            if self.path == prefix+'__stop':
                self.reply(b'SHERLOQ stopped. You can close this page.', 'text/plain')
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            else:
                self.send_error(403)

        def authorized(self):
            host = '127.0.0.1:'+str(self.server.server_port)
            if self.headers.get('Host') != host: return False
            origin = self.headers.get('Origin')
            navigation = self.command in ['GET','HEAD'] and self.headers.get('Sec-Fetch-Mode') == 'navigate' and self.headers.get('Sec-Fetch-Dest') == 'document'
            if navigation and origin in [None,'null']: return True
            return origin in [None,'http://'+host] and self.headers.get('Sec-Fetch-Site') != 'cross-site'

        def do_PUT(self):
            if not managed or not self.authorized() or not self.path.startswith(prefix+'__managed/objects/'):
                self.send_error(403); return
            try:
                length = int(self.headers.get('Content-Length', '-1'))
                managed.upload(self.path[len(prefix+'__managed/objects/'):], self.rfile, length)
                self.reply(b'{"ok":true}', 'application/json')
            except Exception as error:
                self.send_error(409, str(error))

        def do_GET(self):
            self.selected_release = None
            if not self.authorized():
                self.send_error(403)
                return
            parsed = urlsplit(self.path)
            bridge_request = parsed.path.startswith(bridge_prefix)
            request_prefix = bridge_prefix if bridge_request else prefix
            if not parsed.path.startswith(request_prefix):
                self.send_error(404)
                return
            name = unquote(parsed.path[len(request_prefix):])
            if not safe_path(name):
                self.send_error(400)
                return
            static_shell = name == '__shell-file/dependency-config.json'
            if static_shell: name = 'dependency-config.json'
            try:
                record = managed.record() if managed else None
                expected_release=self.headers.get('X-Sherloq-Release')
                if expected_release and not name.startswith('__managed/'):
                    current_record=record
                    if managed and expected_release in {managed.state[key] for key in ['active','previous','candidate']}:
                        record=managed.record(expected_release)
                    elif managed and expected_release==managed.baseline:
                        record=managed.baseline_record
                    elif not managed and expected_release==digest(archive.shell_bytes):
                        record=None
                    else:self.send_error(409,'Matching saved archive or retained local release required');return
                    if record and current_record and record['identity']!=current_record['identity']:
                        choices=current_record['policy']
                        if record.get('legacyBaseline') and (choices.get('disabledFeatures') or choices.get('disabledGroups')):
                            self.send_error(409,'A verified updater bridge is required for these feature choices');return
                        record={**record,'policy':choices,'selectedPaths':managed.selected(record['catalog'],choices,record['manifest'])}
                shell = record['shell'] if record else archive.shell
                manifest = record['manifest'] if record else archive.manifest
                # The first bridge is outside an older worker's scope. Only
                # reviewed UI inventory files are exposed at this second path.
                if bridge_request and name not in shell['files']:
                    self.send_error(404)
                    return
                if not name.startswith('__managed/'):
                    self.selected_release = record['identity'] if record else digest(archive.shell_bytes)
                if name == '__offline-status.json':
                    self.reply(canonical({'complete':True,'missing':0,'storage':'archive','version':shell['version'],
                        'shell':self.selected_release,'manifest':shell['manifest'],'managedStorage':bool(managed),
                        'verification':'verified-on-read'}),'application/json'); return
                if name == '__managed/status' and managed:
                    self.reply(canonical({**managed.state,'managedStorage':True,'archiveMutable':False}), 'application/json'); return
                if name == '__managed/inventory' and managed:
                    self.reply(canonical(managed.inventory()),'application/json'); return
                if name.startswith('__managed/objects/') and managed:
                    identity=name.removeprefix('__managed/objects/');size=managed.object_size(identity)
                    if size is None:self.send_error(404);return
                    self.reply(b'' if self.command=='HEAD' else managed.read_object(identity,size),'application/octet-stream',length=size);return
                if name.startswith('__managed/chunks/') and managed:
                    self.reply(managed.chunk(name.removeprefix('__managed/chunks/')),'application/octet-stream'); return
                if name in ['__shell.json','offline-shell.json']:
                    data = managed.read_object(record['identity'], record['release']['shell']['size']) if record and record.get('release') else archive.shell_bytes if not record or record['identity']==managed.baseline else canonical(shell)
                    self.reply(data,'application/json'); return
                if name in ['__manifest.json','dependency-manifest-'+shell['manifest']+'.json']:
                    data=managed.read_object(record['release']['manifest']['sha256'],record['release']['manifest']['size']) if record and record.get('release') else canonical(manifest)
                    self.reply(data,'application/json'); return
                if name in ['__features.json','feature-catalog.json'] and record:
                    data=managed.read_object(record['release']['catalog']['sha256'],record['release']['catalog']['size']) if record.get('release') else archive.catalog_bytes if record['identity']==managed.baseline and archive.catalog_bytes is not None else canonical(record['catalog'])
                    self.reply(data,'application/json'); return
                if name == '__features.json' and archive.catalog:
                    self.reply(archive.catalog_bytes,'application/json'); return
                if name == '__feature-policy.json' and record:
                    self.reply(canonical(record['policy']),'application/json'); return
                if name == '__feature-policy.json' and archive.catalog:
                    self.reply(canonical(archive.policy),'application/json'); return
                if name == '__launcher':
                    data=b"<!doctype html><meta charset=utf-8><h1>SHERLOQ local</h1><p>Terminez vos calculs avant de quitter. / Finish calculations before stopping.</p><a href='app.html'>SHERLOQ</a><form method='post' action='__stop'><button>Quitter / Stop</button></form>"
                    self.send_response(200)
                    self.send_header('Content-Type','text/html; charset=utf-8')
                    self.send_header('Content-Length',str(len(data)))
                    self.send_header('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'")
                    self.end_headers()
                    if self.command!='HEAD':self.wfile.write(data)
                    return
                if name == 'dependency-config.json' and not static_shell:
                    base = 'http://127.0.0.1:'+str(self.server.server_port)+prefix
                    data = canonical({'schema':'sherloq.dependency-config/1','enabled':False,'offline':True,'offlineMode':'archive','managedStorage':bool(managed),'manifest':shell['manifest'],'version':shell['version'],'sourceBase':base,'updaterChannel':CHANNEL,'workerType':shell.get('workerType','module')})
                    self.reply(data, 'application/json')
                    return
                if record:
                    metadata = shell['files'].get(name) or manifest['files'].get(name)
                    resource = name in manifest['files']
                    if not metadata or name.startswith('private'):
                        self.send_error(404); return
                    if resource and name not in record['selectedPaths']:
                        self.send_error(410,'FEATURE_UNINSTALLED'); return
                    if metadata.get('localOnly'):
                        try:managed.verify_file(name,metadata,manifest)
                        except ValueError:self.send_error(503,'MODEL_LOCAL_REQUIRED');return
                    managed.verify_file(name,metadata,manifest if resource else None)
                    start,end,partial=0,metadata['size']-1,False
                    requested=self.headers.get('Range')
                    if requested:
                        match=re.fullmatch(r'bytes=(\d*)-(\d*)',requested)
                        if not match or not any(match.groups()) or not metadata['size']:
                            self.send_error(416); return
                        a,b=match.groups();start=int(a) if a else max(0,metadata['size']-int(b));end=min(int(b),metadata['size']-1) if a and b else metadata['size']-1
                        if start>end or start>=metadata['size']: self.send_error(416); return
                        partial=True
                    self.send_response(206 if partial else 200)
                    kind=metadata.get('type') or {'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'}.get(PurePosixPath(name).suffix) or mimetypes.guess_type(name)[0] or 'application/octet-stream'
                    self.headers_common(kind,max(0,end-start+1)); self.send_header('Accept-Ranges','bytes')
                    if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{metadata["size"]}')
                    self.end_headers()
                    if self.command!='HEAD':
                        for block in managed.blocks(name,metadata,manifest if resource else None,start,max(0,end-start+1)): self.wfile.write(block)
                    return
                if name in archive.local_only_missing:
                    self.send_error(503, 'MODEL_LOCAL_REQUIRED: import the original verified model files')
                    return
                if name in manifest['files'] and name not in archive.selected:
                    self.send_error(410,'FEATURE_UNINSTALLED'); return
                if name not in archive.files or name.startswith('private'):
                    self.send_error(404)
                    return
                archive.verify(name)
                member, meta = archive.files[name]
                at, size = archive.members[member]
                start, end, partial = 0, size-1, False
                requested = self.headers.get('Range')
                if requested:
                    match = re.fullmatch(r'bytes=(\d*)-(\d*)', requested)
                    if not match or not any(match.groups()) or not size:
                        self.send_error(416)
                        return
                    a, b = match.groups()
                    start = int(a) if a else max(0, size-int(b))
                    end = min(int(b), size-1) if a and b else size-1
                    if start > end or start >= size:
                        self.send_error(416)
                        return
                    partial = True
                self.send_response(206 if partial else 200)
                self.headers_common(meta.get('type') or {'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'}.get(PurePosixPath(name).suffix) or mimetypes.guess_type(name)[0] or 'application/octet-stream', max(0,end-start+1))
                self.send_header('Accept-Ranges', 'bytes')
                if partial:
                    self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.end_headers()
                if self.command == 'HEAD':
                    return
                with archive.path.open('rb') as f:
                    f.seek(at+start)
                    remaining = max(0, end-start+1)
                    while remaining:
                        block = f.read(min(1024*1024, remaining))
                        if not block:
                            break
                        self.wfile.write(block)
                        remaining -= len(block)
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception as error:
                self.send_error(503, str(error))

        def headers_common(self, kind, length):
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(length))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('X-Content-Type-Options', 'nosniff')
            if getattr(self, 'selected_release', None):
                self.send_header('X-Sherloq-Release', self.selected_release)
            updates = ' https://raw.githubusercontent.com' if managed or 'offline-bridge.html' in archive.shell['files'] else ''
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self'"+updates+"; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

        def reply(self, data, kind, length=None):
            self.send_response(200)
            self.headers_common(kind, len(data) if length is None else length)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(data)

    class LocalHTTPServer(ThreadingHTTPServer):
        request_queue_size = 128  # Modern module graphs open a burst of local requests.

    return LocalHTTPServer(('127.0.0.1', port), Handler)


def load_config(html):
    match = re.search(r'<script id="sherloq-offline-config" type="application/json">(.*?)</script>', html.read_text(), re.S)
    if not match:
        raise ValueError('Choose the SHERLOQ.html file generated by the application')
    c = json.loads(match[1])
    if c.get('schema') != 'sherloq.offline-launcher/1' or not re.fullmatch('[a-f0-9]{32}', c.get('token','')) or not isinstance(c.get('port'), int) or not 1024 <= c['port'] <= 65535:
        raise ValueError('Invalid launcher configuration')
    return c


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', type=Path)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--read-only',action='store_true',help='Serve the original verified archive without a managed overlay')
    parser.add_argument('--bridge-assets',type=Path,help='First updater bridge: reviewed public assets; reuse the original TAR and local origin')
    parser.add_argument('--bridge-chunks',type=Path,help='Reviewed changed runtime chunks for the first bridge; ordinary content addressed bytes')
    parser.add_argument('--bridge-policy',type=Path,help='Explicit feature choices for a first bridge; existing managed choices always take priority')
    args = parser.parse_args()
    c = load_config(args.html)
    path = Path(c['archivePath']).expanduser()
    if not path.is_absolute():
        path = args.html.resolve().parent / path
    archive = Archive(path, c)
    if args.read_only and args.bridge_assets:raise ValueError('A bridge cannot be installed in read-only mode')
    managed = None if args.read_only else ManagedLibrary(archive, args.html.resolve().parent/'.SHERLOQ-managed'/c['token'])
    # Reserve the original local origin BEFORE any bridge writes or activation.
    # Another running helper must keep its version and calculations intact.
    server = make_server(archive, c, managed)
    if args.bridge_assets:
        assets = args.bridge_assets.resolve()
        shell = json.loads((assets/'offline-shell.json').read_text())
        manifest = json.loads((assets/'__manifest.json').read_text())
        catalog = json.loads((assets/'feature-catalog.json').read_text())
        for name, meta in shell['files'].items():
            path = assets/meta.get('source',name)
            with path.open('rb') as stream: managed.upload(meta['sha256'],stream,path.stat().st_size)
        if args.bridge_chunks:
            for path in args.bridge_chunks.glob('*.bin'):
                if path.stem not in manifest['chunks']: raise ValueError('Bridge chunk is not in its resource inventory')
                with path.open('rb') as stream: managed.upload(path.stem,stream,path.stat().st_size)
        policy = managed.record()['policy'] if managed.state['active'] else json.loads(args.bridge_policy.read_text()) if args.bridge_policy else archive.policy
        candidate = managed.prepare({'shell':shell,'manifest':manifest,'catalog':catalog,'policy':policy},bridge=True)
        managed.activate(candidate)
    current = managed.record() if managed else None
    launch_shell = current['shell'] if current else archive.shell
    route = f"/__sherloq_bridge/{c['token']}/offline-bridge.html" if 'offline-bridge.html' in launch_shell['files'] else f"/{c['token']}/app.html"
    url = f"http://127.0.0.1:{server.server_port}" + route
    print('SHERLOQ local — '+url, flush=True)
    print('Local application. Updates use the explicit Settings action. Keep this window open; Ctrl+C stops the application.', flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
