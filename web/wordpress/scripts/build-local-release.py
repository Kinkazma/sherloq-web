#!/usr/bin/env python3
"""Prepare reviewed UI sources, release inventories and private test packaging.

stage creates a private bootstrap plus only changed resource chunks.
describe pins existing staged bytes to reviewed immutable Git commits.
channel prepares the mutable discovery pointer. No command performs network I/O.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from build import delivery_bytes
spec = importlib.util.spec_from_file_location('offline_shell',ROOT/'offline-shell.py')
offline = importlib.util.module_from_spec(spec); spec.loader.exec_module(offline)
spec = importlib.util.spec_from_file_location('feature_generator',ROOT/'scripts/generate-feature-catalog.py')
features = importlib.util.module_from_spec(spec); spec.loader.exec_module(features)
spec = importlib.util.spec_from_file_location('runtime_delivery',ROOT/'runtime-delivery.py')
runtime_delivery = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime_delivery)
MAX_ZIP = 25_000_000
OFFLINE_MODULES = ['dependency-core.js','dependency-store.js','dependency-tar.js','offline-kit-core.js',
                   'feature-catalog.js','local-update-store.js','offline-browser-store.js','offline-browser-sw.js']


def encode(value): return (json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
def digest(data): return hashlib.sha256(data).hexdigest()
def put(path,data): path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)
def immutable(value,directory=False):
    if not re.fullmatch(r'https://raw\.githubusercontent\.com/Kinkazma/sherloq-web/[a-f0-9]{40}/(?:[\w.-]+/)*'+('' if directory else '[\w.-]+'),value):
        raise ValueError('Use an immutable public repository commit URL')
    return value


def reviewed_runtime_increment(manifest):
    """Compose reviewed layers without rewriting their predecessor receipts."""
    path=ROOT/'runtime-patches/batch-scientific-regions-20261013.json'
    if not path.exists(): return {},{},None
    overlay=runtime_delivery.qualified_runtime_overlay(ROOT)
    if not all(manifest['files'].get(name)==record['after'] for name,record in overlay.files.items()):
        raise ValueError('Staged inventory differs from the complete qualified runtime chain')
    first,latest={},{}
    for receipt in overlay.receipts:
        for record in receipt['files']:
            name=record['file']
            if name in latest and latest[name]!=record['before']:
                raise ValueError('Qualified runtime layers do not join: '+name)
            first.setdefault(name,record['before']);latest[name]=record['after']
    changes={name:{'before':first[name]['sha256'],'after':after['sha256'],'size':after['size']}
             for name,after in latest.items() if first[name] is not None and name.endswith(('.js','.mjs'))}
    if any(not name.endswith(('.js','.mjs')) for name in changes):
        raise ValueError('Qualified updater replacements must be JavaScript')
    payloads={}
    for name,record in overlay.files.items():
        data=(ROOT/'sherloq-browser/assets'/name).read_bytes()
        if digest(data)!=record['after']['sha256'] or len(data)!=record['after']['size']:
            raise ValueError('Qualified staged runtime changed: '+name)
        payloads[record['after']['sha256']]=data
    reference={'schema':'sherloq.runtime-increment-reference/1','sha256':digest(path.read_bytes()),'files':57,'addedFiles':14}
    return changes,payloads,reference


def runtime_increment_references():
    references=[]
    for name in ['batch-scientific-regions-20261013.json','ela-runtime-20261014.json','browser-extensions-20261015.json']:
        path=ROOT/'runtime-patches'/name
        if not path.exists(): continue
        receipt=json.loads(path.read_bytes())
        references.append({'schema':'sherloq.runtime-increment-reference/1','sha256':digest(path.read_bytes()),
                           'files':len(receipt['files']),'addedFiles':sum(record['added'] for record in receipt['files'])})
    return references


def stage(args):
    if not re.fullmatch('[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?',args.version): raise ValueError('Invalid product version')
    origin = immutable(args.resource_origin,directory=True)
    manifest=json.loads(args.manifest.read_text()); manifest['remoteBase']=origin
    if manifest.get('schema')!='sherloq.dependencies/1': raise ValueError('Unsupported resource inventory')
    destination=args.output/'local'/args.version
    if destination.exists(): raise ValueError('Use a fresh output directory; a staged inventory is immutable')
    plugin=destination/'sherloq-browser'; assets=plugin/'assets'
    changes,payloads,increment=reviewed_runtime_increment(manifest)
    for sha,data in payloads.items():
        put(args.output/'resource-overlay/web-assets/chunks'/(sha+'.bin'),data)
    for name in args.runtime_override:
        if name not in manifest['files'] or manifest['files'][name].get('localOnly'):
            raise ValueError('Unknown or restricted runtime override: '+name)
        path=ROOT/'sherloq-browser/assets'/name
        if path.suffix not in ['.js','.mjs'] or any(part in ['','..','.'] for part in name.split('/')):
            raise ValueError('Only reviewed runtime JS overrides are accepted')
        data=path.read_bytes(); sha=digest(data); old=manifest['files'][name]
        if sha==old['sha256'] and len(data)==old['size']: continue
        manifest['files'][name]={**old,'sha256':sha,'size':len(data),'chunks':[sha]}
        manifest['chunks'][sha]=len(data)
        put(args.output/'resource-overlay/web-assets/chunks'/(sha+'.bin'),data)
        changes[name]={'before':old['sha256'],'after':sha,'size':len(data)}
    # Only chunks still referenced by ordinary files remain in the inventory.
    if increment is None:
        used={sha for file in manifest['files'].values() for sha in file['chunks']}
        manifest['chunks']={sha:size for sha,size in manifest['chunks'].items() if sha in used}
    manifest_bytes=encode(manifest); identity=digest(manifest_bytes)
    catalogue=features.generate(manifest,args.metadata_root)
    for source in sorted((ROOT/'sherloq-browser/assets').rglob('*')):
        if not source.is_file(): continue
        name=source.relative_to(ROOT/'sherloq-browser/assets').as_posix()
        if any(name.startswith(slot+'/') for slot in manifest['slots']) or name.startswith(('private','offline/','dependency-manifest-')) or any(part.startswith('.') for part in source.relative_to(ROOT/'sherloq-browser/assets').parts): continue
        if name in ['offline-shell.json','offline-public-app.html','feature-catalog.json','__manifest.json']: continue
        if source.suffix not in ['.js','.mjs','.json','.html','.css','.woff2','.txt','.py','.svg','.webmanifest','.png']: continue
        data=delivery_bytes('assets/'+name,source,args.version) or source.read_bytes()
        if b'private-report' in data: raise ValueError('Private overlay is not a public local interface')
        if source.suffix=='.html': data=data.replace(b"connect-src 'self'",b"connect-src 'self' https://raw.githubusercontent.com")
        put(assets/name,data)
    for worker,names in [('offline-browser-sw.js',OFFLINE_MODULES),('dependency-sw.js',['dependency-core.js','dependency-store.js','dependency-tar.js','offline-kit-core.js','dependency-manifest.js','dependency-client-routing.js','dependency-sw.js'])]:
        # Reviewed classic script bundle, also valid as a module bridge. The
        # build validates lexical collisions rather than hiding parser errors.
        code='\n'.join(re.sub(r'^import .*;\n','',(assets/name).read_text(),flags=re.M).replace('export ','') for name in names)
        put(assets/worker,code.encode()); subprocess.run(['node','--check',str(assets/worker)],check=True)
    put(plugin/'LICENSE',(ROOT/'sherloq-browser/LICENSE').read_bytes())
    if increment is not None:
        put(assets/'scientific-regions-delivery-increment.json',
            (ROOT/'runtime-patches/batch-scientific-regions-20261013.json').read_bytes())
    ela_receipt=ROOT/'runtime-patches/ela-runtime-20261014.json'
    if ela_receipt.exists(): put(assets/'ela-delivery-increment.json',ela_receipt.read_bytes())
    put(assets/'feature-catalog.json',encode(catalogue))
    put(assets/'dependency-config.json',encode({'schema':'sherloq.dependency-config/1','enabled':False,'offline':True,'offlineMode':'archive','version':args.version,'manifest':identity}))
    shell=offline.write_shell(plugin,manifest,identity,args.version)
    # Inventory metadata is outside its own shell graph to avoid hash cycles.
    put(assets/'__manifest.json',manifest_bytes)
    put(destination/'manifest.json',manifest_bytes)
    put(destination/'features.json',encode(catalogue))
    put(destination/'offline-shell.json',(assets/'offline-shell.json').read_bytes())
    put(args.output/'resource-overlay/web-assets/manifest-template.json',encode({**manifest,'remoteBase':None}))
    instructions='''SHERLOQ local — paquet privé de reconstruction et qualification

Ce ZIP ne doit pas être publié ni proposé par un lien public. La publication
porte sur les sources, moteurs, ressources autorisées et scripts de reconstruction.
Les métadonnées de mise à jour peuvent référencer ces sources publiques vérifiées.

Premier raccord des archives antérieures

Conservez votre SHERLOQ.html et votre TAR original ensemble. Exportez d'abord
les réglages et favoris depuis l'ancienne application si son origine change.
Depuis ce dossier, lancez le nouveau helper livré dans assets :
python3 /chemin/du/paquet/sherloq-browser/assets/offline-server.py SHERLOQ.html --bridge-assets /chemin/du/paquet/sherloq-browser/assets --bridge-chunks /chemin/resource-overlay/web-assets/chunks

Le port et l'origine du HTML original restent utilisés. Le TAR n'est ni copié
ni modifié. Les nouveaux octets sont stockés dans un dossier géré à côté du
HTML. Dans l'écran de raccord, cliquez sur Préparer le raccord et sauvegarder
mes réglages. Terminez les calculs et fermez les anciennes fenêtres lorsque
l'écran le demande, puis cliquez sur Ouvrir SHERLOQ.
Les versions suivantes utilisent Réglages → Mettre à jour, lorsqu'un
canal public a été explicitement publié. Ce paquet local ne publie rien.
Pour sauvegarder un TAR sélectif, ouvrez Réglages → Gérer les fonctions →
Créer une archive sélective. Téléchargez le TAR et son HTML correspondant,
puis vérifiez leur réouverture ensemble avant de remplacer une ancienne copie.
Le lanceur natif peut être conservé ; le HTML Python contient le helper exact.
'''
    put(destination/'LIRE-MOI.txt',instructions.encode())
    archive=args.output/('SHERLOQ-local-bootstrap-'+args.version+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as zipped:
        for source in sorted(destination.rglob('*')):
            if source.is_file(): zipped.write(source,source.relative_to(destination))
        for source in sorted((args.output/'resource-overlay/web-assets/chunks').glob('*.bin')):
            zipped.write(source,'resource-overlay/web-assets/chunks/'+source.name)
    if archive.stat().st_size>MAX_ZIP: archive.unlink(); raise ValueError('Compressed bootstrap ZIP exceeds 25,000,000 bytes')
    result={'schema':'sherloq.local-release-stage/1','version':args.version,'manifest':identity,'shell':digest((destination/'offline-shell.json').read_bytes()),'shellFiles':len(shell['files']),'features':len(catalogue['features']),'runtimeOverrides':changes,'bootstrap':{'bytes':archive.stat().st_size,'sha256':digest(archive.read_bytes()),'compressedLimitBytes':MAX_ZIP,'private':True},'published':False}
    if increment is not None:
        result['runtimeIncrement']=increment
        result['runtimeIncrements']=runtime_increment_references()
    put(args.output/'stage.json',encode(result)); print(json.dumps(result,indent=2))


def describe(args):
    base=immutable(args.inventory_base,directory=True); assets=immutable(args.asset_base,directory=True)
    def ref(filename):
        data=(args.staged/filename).read_bytes(); return {'url':base+filename,'sha256':digest(data),'size':len(data)}
    shell=json.loads((args.staged/'offline-shell.json').read_text()); manifest=json.loads((args.staged/'manifest.json').read_text())
    if shell['manifest']!=ref('manifest.json')['sha256']: raise ValueError('Shell and resource inventory differ')
    immutable(manifest['remoteBase'],directory=True)
    result={'schema':'sherloq.local-release/1','channel':'stable','version':shell['version'],'shell':ref('offline-shell.json'),'manifest':ref('manifest.json'),'catalog':ref('features.json'),'assetBase':assets,'schemaVersions':{'release':1,'features':1,'preferences':1},'migrations':{'schema':1,'minimumUpdater':1}}
    receipt_path=args.staged.parent.parent/'stage.json'
    if receipt_path.exists():
        receipt=json.loads(receipt_path.read_text())
        if receipt.get('shell')!=result['shell']['sha256'] or receipt.get('manifest')!=result['manifest']['sha256']:
            raise ValueError('Runtime overlay receipt does not describe these staged bytes')
        overrides=receipt.get('runtimeOverrides',{})
        for name,meta in overrides.items():
            if not isinstance(name,str) or not re.fullmatch(r'[\w.-]+(?:/[\w.-]+)*\.(?:m?js)',name) or any(part in ['.','..'] for part in name.split('/')):
                raise ValueError('Unsafe runtime overlay path')
            file=manifest['files'].get(name)
            if not file or meta.get('after')!=file['sha256'] or meta.get('size')!=file['size'] or not re.fullmatch('[a-f0-9]{64}',meta.get('before','')):
                raise ValueError('Runtime overlay does not match the verified resource inventory')
        if overrides: result['runtimeOverrides']=overrides
        if receipt.get('runtimeIncrement'): result['runtimeIncrement']=receipt['runtimeIncrement']
        if receipt.get('runtimeIncrements'): result['runtimeIncrements']=receipt['runtimeIncrements']
    put(args.output,encode(result)); print(json.dumps({'bytes':args.output.stat().st_size,'sha256':digest(args.output.read_bytes()),'published':False}))


def channel(args):
    data=args.release.read_bytes(); release=json.loads(data)
    if release.get('schema')!='sherloq.local-release/1' or release.get('channel')!='stable': raise ValueError('Invalid stable release description')
    result={'schema':'sherloq.release-channel/1','channel':'stable','release':{'url':immutable(args.release_url),'sha256':digest(data),'size':len(data)}}
    put(args.output,encode(result)); print(json.dumps({'bytes':args.output.stat().st_size,'published':False}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); commands=parser.add_subparsers(dest='command',required=True)
    p=commands.add_parser('stage'); p.add_argument('--manifest',type=Path,required=True); p.add_argument('--metadata-root',type=Path,default=ROOT/'feature-inputs'); p.add_argument('--version',required=True); p.add_argument('--resource-origin',required=True); p.add_argument('--runtime-override',action='append',default=[]); p.add_argument('--output',type=Path,required=True)
    p=commands.add_parser('describe'); p.add_argument('--staged',type=Path,required=True); p.add_argument('--inventory-base',required=True); p.add_argument('--asset-base',required=True); p.add_argument('--output',type=Path,required=True)
    p=commands.add_parser('channel'); p.add_argument('--release',type=Path,required=True); p.add_argument('--release-url',required=True); p.add_argument('--output',type=Path,required=True)
    args=parser.parse_args(); {'stage':stage,'describe':describe,'channel':channel}[args.command](args)
