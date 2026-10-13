#!/usr/bin/env python3
"""Build the standalone offline launcher and a personal HTML for a verified TAR.

Requires Go only on the build machine. The end user needs no Go or Python.
The large standard TAR stays separate from the small launcher ZIP.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import shutil
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def build(archive, output, target, original_html=None, bridge_assets=None, bridge_chunks=None, bridge_policy=None):
    with tarfile.open(archive, 'r:') as tar:
        shell_bytes = tar.extractfile('offline-kit.json').read()
        shell = json.loads(shell_bytes)
        server = tar.extractfile('app/offline-server.py').read().decode()
        manifest = json.loads(tar.extractfile('manifest.json').read())
        try: original_policy = json.loads(tar.extractfile('feature-policy.json').read())
        except KeyError: original_policy = {'schema':'sherloq.feature-policy/1','disabledFeatures':[],'disabledGroups':[]}
    personal = None
    if original_html:
        original_html = original_html.resolve()
        match = re.search(r'<script id="sherloq-offline-config" type="application/json">(.*?)</script>', original_html.read_text(), re.S)
        if not match:
            raise ValueError('Choose the original SHERLOQ.html generated for this archive')
        personal = json.loads(match[1])
        reference = Path(personal['archivePath']).expanduser()
        if not reference.is_absolute(): reference = original_html.parent/reference
        if not reference.samefile(archive) or personal['manifest'] != shell['manifest'] or personal['shellSha256'] != hashlib.sha256(shell_bytes).hexdigest():
            raise ValueError('The original HTML and archive do not belong together')
        if not bridge_assets:
            raise ValueError('An original HTML bridge requires its verified new public assets')
    elif bridge_assets:
        raise ValueError('Use --original-html to preserve the original local origin for the first bridge')
    if bridge_policy and not bridge_assets:
        raise ValueError('Explicit feature choices require a first bridge')
    system, arch = target.split('-')
    kit = output / ('SHERLOQ-local-'+target)
    kit.mkdir(parents=True, exist_ok=True)
    bridge_shell = None
    if bridge_assets:
        bridge_assets = bridge_assets.resolve()
        bridge_shell_bytes = (bridge_assets/'offline-shell.json').read_bytes()
        bridge_shell = json.loads(bridge_shell_bytes)
        bridge_manifest_bytes = (bridge_assets/'__manifest.json').read_bytes()
        bridge_manifest = json.loads(bridge_manifest_bytes)
        encoded = (json.dumps(bridge_manifest,ensure_ascii=False,sort_keys=True,separators=(',',':'))+'\n').encode()
        catalogue = (bridge_assets/'feature-catalog.json').read_bytes()
        if hashlib.sha256(encoded).hexdigest() != bridge_shell['manifest'] or hashlib.sha256(catalogue).hexdigest() != bridge_shell['catalog']:
            raise ValueError('The bridge interface, catalogue and resources differ')
        policy_bytes = bridge_policy.read_bytes() if bridge_policy else None
        if policy_bytes and len(policy_bytes)>65536: raise ValueError('Oversized explicit feature choices')
        chosen_policy = json.loads(policy_bytes) if bridge_policy else original_policy
        spec = importlib.util.spec_from_file_location('native_selected_graph',ROOT/'sherloq-browser/assets/offline-server.py')
        graph = importlib.util.module_from_spec(spec);spec.loader.exec_module(graph)
        selected = set(graph.ManagedLibrary.selected(json.loads(catalogue),chosen_policy,bridge_manifest))
        for name, meta in bridge_shell['files'].items():
            source = meta.get('source',name)
            for value in [name,source]:
                if value.startswith(('/', 'private')) or any(part in ['', '.', '..'] for part in value.split('/')) or '\\' in value:
                    raise ValueError('Unsafe public bridge file')
            raw = (bridge_assets/source).read_bytes()
            if len(raw) != meta['size'] or hashlib.sha256(raw).hexdigest() != meta['sha256']:
                raise ValueError('Unverified bridge interface file: '+name)
            destination = kit/'bridge-assets'/source
            destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(raw)
        for name,raw in [('offline-shell.json',bridge_shell_bytes),('__manifest.json',encoded),('feature-catalog.json',catalogue)]:
            (kit/'bridge-assets'/name).write_bytes(raw)
        if policy_bytes:
            (kit/'bridge-assets/feature-policy.json').write_bytes(policy_bytes)
        changed = set()
        for name,meta in bridge_manifest['files'].items():
            if name not in selected: continue
            prior = manifest['files'].get(name)
            if prior and prior['sha256'] == meta['sha256'] and prior['size'] == meta['size']: continue
            if meta.get('localOnly'): continue
            if len(meta['chunks']) != 1 or meta['chunks'][0] != meta['sha256']:
                raise ValueError('The first native bridge only accepts bounded, verified runtime file replacements: '+name)
            changed.add(meta['sha256'])
        for sha in changed:
            if not bridge_chunks: raise ValueError('Missing changed runtime chunks for the native bridge')
            raw = (bridge_chunks/(sha+'.bin')).read_bytes()
            if len(raw) != bridge_manifest['chunks'][sha] or hashlib.sha256(raw).hexdigest() != sha:
                raise ValueError('Unverified changed runtime chunk')
            destination = kit/'resource-overlay/web-assets/chunks'/(sha+'.bin')
            destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(raw)
        (kit/'bridge-launch.json').write_text(json.dumps({'schema':'sherloq.native-bridge/1','originalHTML':str(original_html),'assets':'bridge-assets','chunks':'resource-overlay/web-assets/chunks'},ensure_ascii=False)+'\n')
    binary = kit / ('SHERLOQ.exe' if system == 'windows' else 'SHERLOQ')
    if system == 'darwin':
        bundle = kit/'SHERLOQ.app'
        binary = bundle/'Contents/MacOS/SHERLOQ'
        binary.parent.mkdir(parents=True, exist_ok=True)
        (bundle/'Contents/Info.plist').write_bytes(plistlib.dumps({
            'CFBundleName':'SHERLOQ local','CFBundleDisplayName':'SHERLOQ local',
            'CFBundleIdentifier':'org.sherloq.local','CFBundleExecutable':'SHERLOQ',
            'CFBundlePackageType':'APPL','CFBundleShortVersionString':(bridge_shell or shell)['version'],
            'CFBundleVersion':(bridge_shell or shell)['version'],'LSMinimumSystemVersion':'12.0',
            'LSUIElement':True,
        }))
    env = {**os.environ,'GOOS':system,'GOARCH':arch,'CGO_ENABLED':'0'}
    subprocess.run([shutil.which('go') or '/opt/homebrew/bin/go','build','-trimpath','-ldflags=-s -w','-o',str(binary.resolve()),'.'],cwd=ROOT/'offline-launcher',env=env,check=True)
    if system == 'darwin' and shutil.which('codesign'):
        subprocess.run(['codesign','--force','--sign','-',str(bundle)],check=True)
    config = personal or {'archivePath':'SHERLOQ-complet.tar','manifest':shell['manifest'],
              'shellSha256':hashlib.sha256(shell_bytes).hexdigest(),'version':shell['version'],
              'port':8765,'token':secrets.token_hex(16),
              'language':'fr','server':server}
    # Feed private configuration over stdin; no shell interpolation.
    js = "import {offlineLauncherHTML} from './sherloq-browser/assets/offline-kit-core.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(offlineLauncherHTML(JSON.parse(s)));"
    html = '' if personal else subprocess.run(['node','--input-type=module','-e',js],cwd=ROOT,input=json.dumps({**config,'entry':'offline-bridge.html' if 'offline-bridge.html' in (bridge_shell or shell)['files'] else 'app.html'}),text=True,capture_output=True,check=True).stdout
    if personal:
        # Keep the original HTML where it is. The native executable uses its
        # exact existing token, port and archive path via the personal marker.
        (kit/'SHERLOQ-original.html').write_bytes(original_html.read_bytes())
    else:
        (kit/'SHERLOQ.html').write_text(html)
    shutil.copy2(ROOT/'sherloq-browser/LICENSE',kit/'LICENSE')
    (kit/'LIRE-MOI.txt').write_text(f'''SHERLOQ local {shell['version']} — {target}

1. Décompressez ce petit ZIP.
2. Placez SHERLOQ-complet.tar dans le même dossier que SHERLOQ.html et le lanceur.
3. Ouvrez SHERLOQ.app (Mac) ou SHERLOQ.exe (Windows) ou SHERLOQ (Linux).
   Votre navigateur habituel s'ouvre. Chromium est recommandé.
4. Vous pouvez couper Internet. Les fichiers restent sur cet ordinateur.
5. Pour arrêter, cliquez sur « Hors ligne » dans SHERLOQ puis « Arrêter le lanceur »,
   après avoir terminé vos calculs. Rouvrir le lanceur rouvre l'application.

L'archive est un TAR standard : les fichiers gardent leurs noms et leurs octets.
Il n'est pas nécessaire de l'extraire, ni de l'importer dans le cache du navigateur.
Le lanceur ne calcule pas les images : il fournit les fichiers à votre navigateur,
uniquement sur 127.0.0.1. Aucun compte, cookie, Python ou installation n'est requis.
Pour déplacer l'ensemble, gardez ces fichiers ensemble. Le HTML contient le chemin
relatif de l'archive et peut aussi contenir un chemin absolu créé dans l'interface.

Cette livraison est un candidat local. Le lanceur Mac est signé localement,
non notarié par Apple. Les protections système d'une distribution téléchargée
restent applicables. Les algorithmes et leurs limites ne sont pas modifiés.
Les outils qui nécessitent réellement un service Internet ne fonctionnent pas
hors ligne. Le code privé d'envoi de rapports n'est pas inclus.

Source du lanceur : offline-launcher/ ; construction : scripts/build-offline-native.py
Licence du projet et licences des dépendances conservées dans l'archive.
''')
    if personal:
        (kit/'LIRE-MOI.txt').write_text('''SHERLOQ — premier raccord natif, conservé localement

Terminez les calculs et fermez l'ancien lanceur. Ouvrez ensuite le nouveau
SHERLOQ.app / SHERLOQ.exe / SHERLOQ de ce dossier. Il utilise votre HTML
original, son port, son identifiant local et le TAR existant. Aucun TAR n'est
copié ou modifié. SHERLOQ-original.html est une sauvegarde de votre lanceur.

Le premier écran ouvre le raccord de l'ancienne interface : cliquez sur
« Préparer le raccord et sauvegarder mes réglages ». Terminez les calculs puis
fermez les anciennes fenêtres SHERLOQ lorsqu'il le demande. Cliquez ensuite sur
« Ouvrir SHERLOQ ». La nouvelle interface attend leur fermeture ; elle ne
force pas l'arrêt d'un calcul. Les sauvegardes téléchargées restent locales.

Le nouveau bouton Réglages → Mettre à jour utilisera le canal public stable
quand une livraison aura été explicitement publiée. Les téléchargements et
les versions activées par ce lanceur restent dans le cache navigateur. Le TAR
initial reste inchangé : en cas d'effacement du cache, le premier raccord
peut resservir ses propres octets. Si une version plus récente avait été activée,
restaurez son TAR et son HTML de sauvegarde correspondants ou réparez cette
version depuis sa source disponible ; des octets de versions différentes
ne sont pas mélangés. Exportez un nouveau TAR sélectif vérifié depuis l'application
pour conserver une sauvegarde transportable ou alléger durablement le TAR.

Ce raccord garde les réglages de la même origine locale. Sauvegardez-les avant
de déplacer le HTML ou de changer de port. bridge-launch.json contient le
chemin de votre HTML original : ce paquet personnel ne doit pas être publié.
Le navigateur effectue tous les calculs. Aucun Python n'est requis.
''')
    destination=output/(kit.name+'.zip')
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(kit.rglob('*')):
            if p.is_file() and p.name != 'SHERLOQ-complet.tar':z.write(p,p.relative_to(kit))
    if destination.stat().st_size > 25_000_000:
        destination.unlink()
        raise ValueError('Compressed bootstrap ZIP exceeds 25,000,000 bytes')
    # The locally delivered directory is immediately runnable without a duplicate
    # multi-gigabyte copy. The small ZIP intentionally excludes the large archive.
    if not personal:
        local_archive=kit/'SHERLOQ-complet.tar'
        if local_archive.exists() and not local_archive.samefile(archive):local_archive.unlink()
        if not local_archive.exists():os.link(archive,local_archive)
    proof={'kit':str(kit),'zip':str(destination),'archive':str(archive),'target':target,
           'manifest':(bridge_shell or shell)['manifest'],'shellSha256':hashlib.sha256((bridge_assets/'offline-shell.json').read_bytes()).hexdigest() if bridge_assets else config['shellSha256'],
           'compressedBytes':destination.stat().st_size,'compressedLimitBytes':25_000_000,'mode':'native-bridge-cache-only' if personal else 'native-archive-cache-only',
           'url':f"http://127.0.0.1:{config['port']}/{config['token']}/",
           'launcherURL':f"http://127.0.0.1:{config['port']}/__sherloq_bridge/{config['token']}/offline-bridge.html" if bridge_assets or 'offline-bridge.html' in shell['files'] else f"http://127.0.0.1:{config['port']}/{config['token']}/app.html",
           'binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest()}
    (output/('native-'+target+'.json')).write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--target',choices=['darwin-arm64','darwin-amd64','windows-amd64','linux-amd64'],default='darwin-arm64');p.add_argument('--original-html',type=Path);p.add_argument('--bridge-assets',type=Path);p.add_argument('--bridge-chunks',type=Path);p.add_argument('--bridge-policy',type=Path,help='Explicit existing feature exclusions, preserved in the bridge; omitted means keep the archive policy')
    a=p.parse_args();build(a.archive.resolve(),a.output.resolve(),a.target,a.original_html,a.bridge_assets,a.bridge_chunks,a.bridge_policy)
