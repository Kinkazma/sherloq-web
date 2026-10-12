#!/usr/bin/env python3
"""Serve the existing local WordPress files; no site copy, PHP or remote deployment."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, json, hashlib
from urllib.parse import urlsplit, unquote
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8097)
parser.add_argument('--root',default='/Users/gaeldauchy/gaeldauchy-site-unraid-2026-07-31/gaeldauchy-site-unraid-2026-09-24/gaeldauchy-site-unraid/wordpress/html')
parser.add_argument('--fixtures',type=Path,help='Optional generated fixtures directory for browser checks')
parser.add_argument('--candidate-engine',type=Path,help='Optional source directory for isolated SIFT phase qualification')
args=parser.parse_args()
assets=Path(args.root)/'wp-content/plugins/sherloq-browser/assets'
configuration=json.loads((assets/'dependency-config.json').read_text())
manifest=json.loads((assets/('dependency-manifest-'+configuration['manifest']+'.json')).read_text())
candidate_modules=('execution-scheduler.js','sift-paged-resources.js')
if args.candidate_engine:
 manifest['localFiles']=sorted(set(manifest.get('localFiles',[]))|{'unified-engine/src/'+name for name in candidate_modules})
manifest['remoteBase']=f'http://127.0.0.1:{args.port}/__batch_assets__/'
manifest_bytes=json.dumps(manifest,separators=(',',':')).encode()
local_identity=hashlib.sha256(manifest_bytes).hexdigest()
# Existing browser workers keep their manifest URL across a server restart.
# Reconstruct those local identities in memory so they can load the updated
# bootstrap and migrate normally, without deleting the user's browser storage.
local_manifests={local_identity:manifest_bytes}
for previous_path in assets.glob('dependency-manifest-*.json'):
 previous=json.loads(previous_path.read_text())
 previous['remoteBase']=f'http://127.0.0.1:{args.port}/__batch_assets__/'
 previous_bytes=json.dumps(previous,separators=(',',':')).encode()
 local_manifests[hashlib.sha256(previous_bytes).hexdigest()]=previous_bytes
configuration['manifest']=local_identity
configuration['workerVersion']='batch-local-1'
repository=Path(__file__).resolve().parents[1]
resource_root=repository/'web-assets'
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**k): super().__init__(*a,directory=args.root,**k)
 def translate_path(self,path):
  requested=unquote(urlsplit(path).path)
  if args.fixtures and requested.startswith('/__batch_fixtures__/'):
   target=(args.fixtures/requested.removeprefix('/__batch_fixtures__/')).resolve()
   return str(target) if target.is_relative_to(args.fixtures.resolve()) else str(resource_root/'missing')
  if requested.startswith('/__batch_examples__/'):
   target=(repository/'examples'/requested.removeprefix('/__batch_examples__/')).resolve()
   return str(target) if target.is_relative_to((repository/'examples').resolve()) else str(resource_root/'missing')
  if requested.startswith('/__batch_assets__/'):
   target=(resource_root/requested.removeprefix('/__batch_assets__/')).resolve()
   if not target.is_relative_to(resource_root.resolve()): return str(resource_root/'missing')
   return str(target)
  prefix='/wp-content/plugins/sherloq-browser/assets/'
  if requested.startswith(prefix):
   # Only serve public plugin assets, never WordPress PHP/configuration files.
   relative=Path(requested.removeprefix(prefix))
   if '..' not in relative.parts and relative.suffix.lower() not in {'.php','.ini','.env'}:
    return str(assets/relative)
  return str(resource_root/'missing')
 def do_GET(self):
  path=urlsplit(self.path).path
  if args.candidate_engine and ((Path(path).name.startswith('batch-') and Path(path).suffix=='.js') or Path(path).name=='integrated-config.json'):
   source=repository/'web/wordpress/sherloq-browser/assets'/Path(path).name
   if source.is_file():
    data=source.read_bytes();self.send_response(200);self.send_header('Content-Type','application/json' if source.suffix=='.json' else 'text/javascript');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if args.candidate_engine and any(path.endswith('/unified-engine/src/'+name) for name in candidate_modules):
   source=args.candidate_engine/Path(path).name
   data=b'import "../../runtime-context.js?v=0.15.1";\n'+source.read_bytes()
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if args.fixtures and Path(path).name in ('__sift_memory__.html','__sift_memory__.js','__batch_storage__.html','__batch_storage__.js','__batch_pipeline__.html','__batch_pipeline__.js'):
   storage='__batch_storage__' in path
   pipeline='__batch_pipeline__' in path
   name=('pipeline.html' if pipeline else 'storage.html' if storage else 'index.html') if path.endswith('.html') else ('pipeline.js' if pipeline else 'storage.js' if storage else 'test.js');data=(args.fixtures/name).read_bytes()
   self.send_response(200);self.send_header('Content-Type','text/html' if name.endswith('.html') else 'text/javascript');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if path.endswith('/dependency-config.json'): data=json.dumps(configuration).encode()
  elif Path(path).name.startswith('dependency-manifest-') and Path(path).stem.removeprefix('dependency-manifest-') in local_manifests:
   data=local_manifests[Path(path).stem.removeprefix('dependency-manifest-')]
  else: return super().do_GET()
  self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def end_headers(self):
  self.send_header('Cross-Origin-Opener-Policy','same-origin')
  self.send_header('Cross-Origin-Embedder-Policy','require-corp')
  self.send_header('Cache-Control','no-cache')
  super().end_headers()
 def log_message(self,*a): pass
print(f'Local SHERLOQ: http://127.0.0.1:{args.port}/wp-content/plugins/sherloq-browser/assets/app.html#lang=fr',flush=True)
class Server(ThreadingHTTPServer):
 request_queue_size=256
 daemon_threads=True
Server(('127.0.0.1',args.port),Handler).serve_forever()
