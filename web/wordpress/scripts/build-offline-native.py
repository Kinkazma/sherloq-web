#!/usr/bin/env python3
"""Build the standalone offline launcher and a personal HTML for a verified TAR.

Requires Go only on the build machine. The end user needs no Go or Python.
The large standard TAR stays separate from the small launcher ZIP.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import secrets
import shutil
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def build(archive, output, target):
    with tarfile.open(archive, 'r:') as tar:
        shell_bytes = tar.extractfile('offline-kit.json').read()
        shell = json.loads(shell_bytes)
        server = tar.extractfile('app/offline-server.py').read().decode()
    system, arch = target.split('-')
    kit = output / ('SHERLOQ-local-'+target)
    kit.mkdir(parents=True, exist_ok=True)
    binary = kit / ('SHERLOQ.exe' if system == 'windows' else 'SHERLOQ')
    if system == 'darwin':
        bundle = kit/'SHERLOQ.app'
        binary = bundle/'Contents/MacOS/SHERLOQ'
        binary.parent.mkdir(parents=True, exist_ok=True)
        (bundle/'Contents/Info.plist').write_bytes(plistlib.dumps({
            'CFBundleName':'SHERLOQ local','CFBundleDisplayName':'SHERLOQ local',
            'CFBundleIdentifier':'org.sherloq.local','CFBundleExecutable':'SHERLOQ',
            'CFBundlePackageType':'APPL','CFBundleShortVersionString':shell['version'],
            'CFBundleVersion':shell['version'],'LSMinimumSystemVersion':'12.0',
            'LSUIElement':True,
        }))
    env = {**os.environ,'GOOS':system,'GOARCH':arch,'CGO_ENABLED':'0'}
    subprocess.run([shutil.which('go') or '/opt/homebrew/bin/go','build','-trimpath','-ldflags=-s -w','-o',str(binary.resolve()),'.'],cwd=ROOT/'offline-launcher',env=env,check=True)
    if system == 'darwin' and shutil.which('codesign'):
        subprocess.run(['codesign','--force','--sign','-',str(bundle)],check=True)
    config = {'archivePath':'SHERLOQ-complet.tar','manifest':shell['manifest'],
              'shellSha256':hashlib.sha256(shell_bytes).hexdigest(),'version':shell['version'],
              'port':49152+secrets.randbelow(16000),'token':secrets.token_hex(16),
              'language':'fr','server':server}
    # Feed private configuration over stdin; no shell interpolation.
    js = "import {offlineLauncherHTML} from './sherloq-browser/assets/offline-kit-core.js';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(offlineLauncherHTML(JSON.parse(s)));"
    html = subprocess.run(['node','--input-type=module','-e',js],cwd=ROOT,input=json.dumps(config),text=True,capture_output=True,check=True).stdout
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
    destination=output/(kit.name+'.zip')
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(kit.rglob('*')):
            if p.is_file() and p.name != 'SHERLOQ-complet.tar':z.write(p,p.relative_to(kit))
    # The locally delivered directory is immediately runnable without a duplicate
    # multi-gigabyte copy. The small ZIP intentionally excludes the large archive.
    local_archive=kit/'SHERLOQ-complet.tar'
    if local_archive.exists() and not local_archive.samefile(archive):local_archive.unlink()
    if not local_archive.exists():os.link(archive,local_archive)
    proof={'kit':str(kit),'zip':str(destination),'archive':str(archive),'target':target,
           'manifest':config['manifest'],'shellSha256':config['shellSha256'],
           'url':f"http://127.0.0.1:{config['port']}/{config['token']}/",'binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest()}
    (output/('native-'+target+'.json')).write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--target',choices=['darwin-arm64','darwin-amd64','windows-amd64','linux-amd64'],default='darwin-arm64')
    a=p.parse_args();build(a.archive.resolve(),a.output.resolve(),a.target)
