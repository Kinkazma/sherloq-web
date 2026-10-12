#!/usr/bin/env python3
"""Serve the existing local WordPress files; no site copy, PHP or remote deployment."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, json, hashlib, mimetypes
from urllib.parse import urlsplit, unquote
parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8097)
parser.add_argument('--root',default='/Users/gaeldauchy/gaeldauchy-site-unraid-2026-07-31/gaeldauchy-site-unraid-2026-09-24/gaeldauchy-site-unraid/wordpress/html')
parser.add_argument('--fixtures',type=Path,help='Optional generated fixtures directory for browser checks')
parser.add_argument('--candidate-engine',type=Path,help='Optional source directory for isolated SIFT phase qualification')
parser.add_argument('--scientific-text-model',type=Path,help='Existing pinned detector model; served locally without copying')
parser.add_argument('--ssg-assets-manifest',type=Path,help='Existing local qualification manifest; overlay only pinned SSG resources without copying or publishing them')
args=parser.parse_args()
assets=Path(args.root)/'wp-content/plugins/sherloq-browser/assets'
configuration=json.loads((assets/'dependency-config.json').read_text())
manifest=json.loads((assets/('dependency-manifest-'+configuration['manifest']+'.json')).read_text())
repository=Path(__file__).resolve().parents[1]
resource_root=repository/'web-assets'
candidate_data={}
candidate_chunks={}
candidate_chunk_files={}
candidate_modules=tuple(p.relative_to(args.candidate_engine).as_posix() for p in args.candidate_engine.rglob('*') if p.is_file() and p.suffix in ('.js','.mjs')) if args.candidate_engine else ()
if args.candidate_engine:
 for name in candidate_modules:
  path='unified-engine/src/'+name
  context='../'*(len(Path(name).parts)+1)+'runtime-context.js?v=batch-scientific-local'
  data=('import "'+context+'";\n').encode()+(args.candidate_engine/name).read_bytes()
  digest=hashlib.sha256(data).hexdigest();candidate_data[path]=data;candidate_chunks[digest]=data
  manifest['chunks'][digest]=len(data)
  manifest['files'][path]={'size':len(data),'sha256':digest,'chunks':[digest],'type':'text/javascript'}
 manifest['localFiles']=sorted(set(manifest.get('localFiles',[]))|set(candidate_data))
if args.ssg_assets_manifest:
 donor=json.loads(args.ssg_assets_manifest.read_text());donor_root=args.ssg_assets_manifest.parent/'public/web-assets';donor_chunks=donor_root/'chunks'
 for path,spec in donor['files'].items():
  if path.startswith(('individual-assets/m3/ssg/','unified-engine/vendor/ssg-vlfeat/','unified-engine/vendor/ssg-full/')):
   manifest['files'][path]=spec
   for chunk in spec['chunks']:
    source=donor_chunks/(chunk+'.bin')
    if not source.is_file() or source.stat().st_size!=donor['chunks'][chunk]:raise ValueError('Missing original SSG chunk '+chunk)
    manifest['chunks'][chunk]=donor['chunks'][chunk];candidate_chunk_files[chunk]=source
 catalog_path='individual-assets/individual-models.json'
 def catalog_bytes(table,chunks):return b''.join((chunks/(chunk+'.bin')).read_bytes() for chunk in table['files'][catalog_path]['chunks'])
 base_catalog=json.loads(catalog_bytes(manifest,resource_root/'chunks'));donor_catalog=json.loads(catalog_bytes(donor,donor_chunks))
 forest=donor_catalog['m3']['ssg-edges']
 if forest['sha256']!='b428fe9626dfd59ea3161e2b79786b2a4713e13770e8d75c80477b5805f57157' or forest['bytes']!=4266:raise ValueError('Unqualified original SSG forest manifest')
 base_catalog.setdefault('m3',{})['ssg-edges']=forest;catalog=json.dumps(base_catalog,separators=(',',':')).encode();catalog_sha=hashlib.sha256(catalog).hexdigest()
 candidate_data[catalog_path]=catalog;candidate_chunks[catalog_sha]=catalog;manifest['chunks'][catalog_sha]=len(catalog)
 manifest['files'][catalog_path]={'size':len(catalog),'sha256':catalog_sha,'chunks':[catalog_sha],'type':'application/json'}
 manifest['localFiles']=sorted(set(manifest.get('localFiles',[]))|{catalog_path}|{p for p in donor['files'] if p.startswith(('individual-assets/m3/ssg/','unified-engine/vendor/ssg-vlfeat/','unified-engine/vendor/ssg-full/'))})
if args.scientific_text_model:
 model=args.scientific_text_model.resolve();size=model.stat().st_size;digest=hashlib.sha256(model.read_bytes()).hexdigest()
 if size!=9929594 or digest!='090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f':raise ValueError('Scientific text detector identity mismatch')
 path='batch-models/PP-OCRv6_det_small.onnx';manifest['chunks'][digest]=size
 manifest['files'][path]={'size':size,'sha256':digest,'chunks':[digest],'type':'application/octet-stream'}
 manifest['slots']=sorted(set(manifest['slots'])|{'batch-models'});manifest['localFiles'].append(path)
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
configuration['workerVersion']='batch-local-scientific-1' if args.candidate_engine else 'batch-local-1'
if args.candidate_engine:configuration['workerType']='module'
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
  prefix='/wp-content/plugins/sherloq-browser/assets/'
  relative=path.removeprefix(prefix) if path.startswith(prefix) else None
  if args.scientific_text_model and (relative=='batch-models/PP-OCRv6_det_small.onnx' or path.endswith('/chunks/'+digest+'.bin')):
   self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(size));self.end_headers()
   with model.open('rb') as source:
    while data:=source.read(1024*1024):self.wfile.write(data)
   return
  if path.startswith('/__batch_assets__/chunks/') and Path(path).stem in candidate_chunks:
   data=candidate_chunks[Path(path).stem];self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if path.startswith('/__batch_assets__/chunks/') and Path(path).stem in candidate_chunk_files:
   source=candidate_chunk_files[Path(path).stem];self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(source.stat().st_size));self.end_headers()
   with source.open('rb') as stream:
    while data:=stream.read(1024*1024):self.wfile.write(data)
   return
  if relative in candidate_data:
   data=candidate_data[relative];self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(relative)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if args.candidate_engine and relative and '/' not in relative and relative!='dependency-config.json' and not relative.startswith('dependency-manifest-') and Path(relative).suffix in ('.js','.css','.html','.json'):
   source=repository/'web/wordpress/sherloq-browser/assets'/relative
   if source.is_file():
    data=source.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(source)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if args.candidate_engine and ((Path(path).name.startswith('batch-') and Path(path).suffix=='.js') or Path(path).name=='integrated-config.json'):
   source=repository/'web/wordpress/sherloq-browser/assets'/Path(path).name
   if source.is_file():
    data=source.read_bytes();self.send_response(200);self.send_header('Content-Type','application/json' if source.suffix=='.json' else 'text/javascript');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
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
