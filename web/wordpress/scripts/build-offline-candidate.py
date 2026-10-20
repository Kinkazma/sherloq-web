#!/usr/bin/env python3
"""Build a local offline candidate using an already delivered resource manifest.

No network, engine rebuild or re-encoding. Exact published chunks are streamed
back into ordinary files in a standard TAR. Never includes the private mailer.
"""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import shutil
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from build import delivery_bytes
spec = importlib.util.spec_from_file_location('offline_shell', ROOT/'offline-shell.py')
offline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offline)


class ChunkReader:
    def __init__(self, chunks, metadata):
        self.root = chunks
        self.meta = metadata
        self.iterator = iter(metadata['chunks'])
        self.stream = None
        self.full = hashlib.sha256()
        self.chunk = None
        self.hash = None

    def read(self, size):
        output = bytearray()
        while len(output) < size:
            if self.stream is None:
                name = next(self.iterator, None)
                if name is None:
                    break
                self.stream = (self.root/(name+'.bin')).open('rb')
                self.hash = name
                self.chunk = hashlib.sha256()
            data = self.stream.read(size-len(output))
            if not data:
                self.close_chunk()
                continue
            self.chunk.update(data)
            self.full.update(data)
            output.extend(data)
        return bytes(output)

    def close_chunk(self):
        if self.stream:
            self.stream.close()
            self.stream = None
            if self.chunk.hexdigest() != self.hash:
                raise ValueError('Corrupt local chunk: '+self.hash)

    def finish(self):
        self.close_chunk()
        if self.full.hexdigest() != self.meta['sha256']:
            raise ValueError('Resource identity mismatch')


def build(installed, chunks, output, shell_only=False):
    output.mkdir(parents=True, exist_ok=True)
    config = json.loads((installed/'dependency-config.json').read_text())
    manifest = json.loads((installed/('dependency-manifest-'+config['manifest']+'.json')).read_text())
    if hashlib.sha256((json.dumps(manifest,sort_keys=True,separators=(',',':'))+'\n').encode()).hexdigest() != config['manifest']:
        raise ValueError('Untrusted source manifest')
    plugin = output/'preview/sherloq-browser'
    assets = plugin/'assets'
    assets.mkdir(parents=True,exist_ok=True)
    version = re.search(r'Version:\s*([\d.]+)',(ROOT/'sherloq-browser/sherloq-browser.php').read_text())[1]
    for source in (ROOT/'sherloq-browser/assets').rglob('*'):
        if not source.is_file():continue
        name=source.relative_to(ROOT/'sherloq-browser/assets').as_posix()
        if any(name.startswith(s+'/') for s in manifest['slots']) or name.startswith(('private','dependency-manifest-')) or source.name.startswith('.'):
            continue
        target=assets/name;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(delivery_bytes('assets/'+name,source,version) or source.read_bytes())
    shutil.copy2(ROOT/'sherloq-browser/LICENSE',plugin/'LICENSE')
    # The online preview can export an offline kit, but the local archive reader
    # replaces this config with enabled:false and never starts a resource SW.
    config['workerVersion']=version
    (assets/'dependency-config.json').write_text(json.dumps(config))
    shutil.copy2(installed/('dependency-manifest-'+config['manifest']+'.json'),assets/('dependency-manifest-'+config['manifest']+'.json'))
    for name in manifest.get('localFiles', []):
        target = assets/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(installed/name, target)
    worker='\n'.join(re.sub(r'^import .*;\n','',(assets/name).read_text(),flags=re.M).replace('export ','') for name in ['dependency-core.js','extension-resource-client.js','extension-resource-relay.js','dependency-store.js','dependency-tar.js','offline-kit-core.js','dependency-manifest.js','dependency-sw.js'])
    (assets/'dependency-sw.js').write_text(worker)
    offline_worker='\n'.join(re.sub(r'^import .*;\n','',(assets/name).read_text(),flags=re.M).replace('export ','') for name in ['dependency-core.js','extension-resource-client.js','extension-resource-relay.js','dependency-store.js','dependency-tar.js','offline-kit-core.js','feature-catalog.js','local-update-store.js','offline-browser-store.js','offline-browser-sw.js'])
    (assets/'offline-browser-sw.js').write_text(offline_worker)
    shell=offline.write_shell(plugin,manifest,config['manifest'],version)
    if shell_only:return
    archive=output/'SHERLOQ-complet.tar'
    part=output/'SHERLOQ-complet.tar.part'
    def add(tar,name,data):
        info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;tar.addfile(info,io.BytesIO(data))
    # Bounded writes; no network access is implemented in this local builder.
    with tarfile.open(part,'w:',format=tarfile.USTAR_FORMAT) as tar:
        add(tar,'offline-kit.json',(assets/'offline-shell.json').read_bytes())
        add(tar,'manifest.json',(json.dumps(manifest,indent=2)+'\n').encode())
        for name,meta in shell['files'].items():
            data=(assets/meta.get('source',name)).read_bytes()
            if hashlib.sha256(data).hexdigest()!=meta['sha256']:raise ValueError(name)
            add(tar,'app/'+name,data)
        for n,(name,meta) in enumerate(manifest['files'].items(),1):
            info=tarfile.TarInfo(name);info.size=meta['size'];info.mode=0o644
            reader=ChunkReader(chunks,meta)
            try:tar.addfile(info,reader);reader.finish()
            finally:
                if reader.stream:reader.stream.close()
            if n%500==0:print('Verified files',n,'/',len(manifest['files']),flush=True)
    part.replace(archive)
    proof={'schema':'sherloq.offline-build/1','version':version,'manifest':config['manifest'],'shellSha256':hashlib.sha256((assets/'offline-shell.json').read_bytes()).hexdigest(),'runtimeFiles':len(manifest['files']),'runtimeBytes':sum(f['size'] for f in manifest['files'].values()),'archiveBytes':archive.stat().st_size,'source':'existing local published chunks','networkRequests':0,'shellFiles':len(shell['files'])}
    (output/'build-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--installed-assets',type=Path,required=True);p.add_argument('--chunks',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--shell-only',action='store_true')
    a=p.parse_args();build(a.installed_assets,a.chunks,a.output,a.shell_only)
