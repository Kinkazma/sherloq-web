#!/usr/bin/env python3
"""SHERLOQ offline archive reader. Standard library only; no external network.

Usage: python3 sherloq-local.py SHERLOQ.html [--no-browser]
The browser performs the calculations; this process only serves verified files
from an ordinary, uncompressed TAR, bound exclusively to 127.0.0.1.
"""
import argparse
import hashlib
import json
import mimetypes
import re
import tarfile
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


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
        self.shell = json.loads(self.read_small('offline-kit.json'))
        if digest(self.read_small('offline-kit.json')) != config['shellSha256']:
            raise ValueError('The archive is not the one selected for this HTML (application identity)')
        self.manifest = json.loads(self.read_small('manifest.json'))
        canonical = (json.dumps(self.manifest, sort_keys=True, separators=(',', ':'))+'\n').encode()
        if digest(canonical) != config['manifest'] or self.shell['manifest'] != config['manifest']:
            raise ValueError('The archive is not the one selected for this HTML (resources identity)')
        if self.manifest.get('schema') != 'sherloq.dependencies/1' or self.shell.get('schema') != 'sherloq.offline-shell/1':
            raise ValueError('Unsupported archive version')
        self.files = {}
        for name, meta in self.shell['files'].items():
            self.files[name] = ('app/'+name, meta)
        for name, meta in self.manifest['files'].items():
            if name in self.files:
                raise ValueError('Duplicate application/resource name')
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


def make_server(archive, config):
    prefix = '/' + config['token'] + '/'
    port = config['port']

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # No image data, browsing history or requests written to disk.

        def do_HEAD(self):
            self.do_GET()

        def do_POST(self):
            if self.path == prefix+'__stop' and self.headers.get('Host') == '127.0.0.1:'+str(self.server.server_port) and self.headers.get('Origin') in [None, 'http://127.0.0.1:'+str(self.server.server_port)]:
                self.reply(b'SHERLOQ stopped. You can close this page.', 'text/plain')
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            else:
                self.send_error(403)

        def do_GET(self):
            if self.headers.get('Host') != '127.0.0.1:'+str(self.server.server_port):
                self.send_error(403)
                return
            origin = self.headers.get('Origin')
            if origin and origin != 'http://127.0.0.1:'+str(self.server.server_port):
                self.send_error(403)
                return
            parsed = urlsplit(self.path)
            if not parsed.path.startswith(prefix):
                self.send_error(404)
                return
            name = unquote(parsed.path[len(prefix):])
            if not safe_path(name):
                self.send_error(400)
                return
            try:
                if name == '__launcher':
                    data=b"<!doctype html><meta charset=utf-8><h1>SHERLOQ local</h1><p>Terminez vos calculs avant de quitter. / Finish calculations before stopping.</p><a href='app.html'>SHERLOQ</a><form method='post' action='__stop'><button>Quitter / Stop</button></form>"
                    self.send_response(200)
                    self.send_header('Content-Type','text/html; charset=utf-8')
                    self.send_header('Content-Length',str(len(data)))
                    self.send_header('Content-Security-Policy',"default-src 'none'; form-action 'self'; frame-ancestors 'none'")
                    self.end_headers()
                    if self.command!='HEAD':self.wfile.write(data)
                    return
                if name == 'dependency-config.json':
                    data = json.dumps({'schema':'sherloq.dependency-config/1','enabled':False,'offline':True}).encode()
                    self.reply(data, 'application/json')
                    return
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
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")

        def reply(self, data, kind):
            self.send_response(200)
            self.headers_common(kind, len(data))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(data)

    return ThreadingHTTPServer(('127.0.0.1', port), Handler)


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
    args = parser.parse_args()
    c = load_config(args.html)
    path = Path(c['archivePath']).expanduser()
    if not path.is_absolute():
        path = args.html.resolve().parent / path
    archive = Archive(path, c)
    server = make_server(archive, c)
    url = f"http://127.0.0.1:{server.server_port}/{c['token']}/app.html"
    print('SHERLOQ local — '+url, flush=True)
    print('No Internet connection. Keep this window open; Ctrl+C stops the local application.', flush=True)
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
