#!/usr/bin/env python3
"""Rebuild a complete private local candidate; never commits or publishes.

Source and staging must be separate trees. The baseline dependency library must
already be restored inside source. The script keeps the selected detector model
payloads unchanged, rebuilds the engine Worker, assembles exact resource locks,
checks the resulting source identities, then installs to an explicit private
destination. No archive or remote deployment is produced.
"""
import argparse,hashlib,importlib.util,json,os,shutil,subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=Path,required=True);p.add_argument('--staging-root',type=Path,required=True);p.add_argument('--dependencies-root',type=Path,required=True);p.add_argument('--install',type=Path,required=True);p.add_argument('--receipt',type=Path,required=True);p.add_argument('--node',default='node');p.add_argument('--clone',action='store_true',help='Create a fresh APFS copy-on-write staging clone if it does not yet exist');a=p.parse_args()
source=a.source_root.resolve();staging=a.staging_root.resolve();engine=source/'web/engine-source';wp=source/'web/wordpress';build=engine/'.build/private-worker';install=a.install.resolve()
if source==staging or source.is_relative_to(staging) or staging.is_relative_to(source):raise SystemExit('Use a separate private staging tree.')
if install.name!='sherloq-browser' or install.is_relative_to(source):raise SystemExit('An explicit separate private plugin destination is required.')
def run(args,cwd=None):subprocess.run(list(map(str,args)),cwd=cwd,check=True)
run([a.node,engine/'scripts/build-engine-worker.mjs','--engine-root='+str(engine),'--ui-root='+str(wp/'sherloq-browser/assets'),'--dependencies-root='+str(a.dependencies_root.resolve()),'--output-root='+str(build)])
proof=json.loads((build/'worker-bundle-build.json').read_text())
for record in [*proof['artifacts'],{'path':'worker-bundle-build.json'}]:
 path=record['path'];target=engine/path;target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_name(target.name+'.private-build-tmp');shutil.copyfile(build/path,temporary);os.replace(temporary,target)
run([a.node,engine/'scripts/build-engine-worker.mjs','--engine-root='+str(engine),'--ui-root='+str(wp/'sherloq-browser/assets'),'--output-root='+str(engine),'--check'])
# Some source snapshots omit notices that remain present in their exact locked
# resource library. Restore only notice bytes whose raw source identity matches
# that library. Executable files never use this recovery path.
lock=json.loads((wp/'runtime-source-lock.json').read_text());restored=[]
for runtime in lock['runtimes']:
 if Path(runtime['destination']).name!='unified-engine':continue
 for name,expected in runtime['files'].items():
  target=engine/name
  if target.exists() or not any(part in target.name.lower() for part in ['license','copyright','notice']):continue
  payload=(wp/runtime['destination']/name).read_bytes()
  if hashlib.sha256(payload).hexdigest()!=expected:raise ValueError('Restored notice differs from its raw source identity: '+name)
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(payload);restored.append(name)
if restored:print(json.dumps({'restoredLockedNotices':restored}),flush=True)
# The generated Worker proof is itself an identity input. The numerical
# Worker keeps useful-work-code-identity external to avoid a packaging cycle.
run([a.node,engine/'scripts/runtime-manifest.mjs'])
run(['python3',wp/'scripts/write-code-identity.py'])
if not staging.exists():
 if not a.clone:raise SystemExit('Staging is absent; pass --clone for an explicit private APFS clone.')
 staging.parent.mkdir(parents=True,exist_ok=True)
 run(['cp','-cR',source,staging])
run(['python3',wp/'scripts/assemble-local-candidate.py','--source-root',source,'--staging-root',staging,'--receipt',a.receipt.resolve(),'--node',a.node,'--preserve-detector-assets'])
staged_engine=staging/'web/engine-source';staged_wp=staging/'web/wordpress'
run([a.node,staged_engine/'scripts/build-engine-worker.mjs','--engine-root='+str(staged_engine),'--ui-root='+str(staged_wp/'sherloq-browser/assets'),'--output-root='+str(staged_engine),'--check'])
run(['python3',staged_wp/'scripts/write-code-identity.py','--check'])
run(['python3',staged_wp/'build.py','--install',install])
print(json.dumps({'status':'private-candidate-installed','published':False,'archives':False,'receipt':str(a.receipt.resolve()),'install':str(install)}))
