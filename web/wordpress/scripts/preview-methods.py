#!/usr/bin/env python3
"""Serve an isolated local method-development UI without copying model weights.

The first asset root wins. Use a previously qualified, complete runtime as the
fallback and put new local model resources under --resources. No deployment or
modification of an existing test server is performed.
"""
import argparse
import json
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fallback', type=Path, required=True)
    parser.add_argument('--resources', type=Path)
    parser.add_argument('--staged', type=Path)
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    primary = Path(__file__).resolve().parents[1] / 'sherloq-browser/assets'
    engine_source = Path(__file__).resolve().parents[2] / 'engine-source'
    roots = ([args.staged.resolve()] if args.staged else []) + [primary, args.fallback.resolve()]
    for root in roots:
        if not root.is_dir():
            raise SystemExit('Missing asset root: ' + str(root))

    class Handler(SimpleHTTPRequestHandler):
        protocol_version = 'HTTP/1.1'

        def translate_path(self, path):
            parts = Path(unquote(urlsplit(path).path).lstrip('/')).parts
            if any(p in ('.', '..') for p in parts):
                return str(primary / '.invalid-request')
            relative = Path(*parts) if parts else Path('app.html')
            if parts and parts[0] == 'integration-resources' and args.resources:
                return str(args.resources.resolve().joinpath(*parts[1:]))
            if parts and parts[0] == 'engine-source':
                source = engine_source.joinpath(*parts[1:])
                if source.is_file():
                    return str(source)
                # Large pinned runtime binaries stay in the qualified delivery.
                binary = args.fallback.resolve().joinpath('unified-engine', *parts[1:])
                return str(binary if binary.is_file() else source)
            for root in roots:
                target = root / relative
                if target.is_file():
                    return str(target)
            return str(primary / relative)

        def list_directory(self, path):
            self.send_error(404)
            return None

        def end_headers(self):
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def guess_type(self, path):
            if path.endswith(('.js', '.mjs')):
                return 'text/javascript'
            if path.endswith('.wasm'):
                return 'application/wasm'
            return super().guess_type(path)

    class Server(ThreadingHTTPServer):
        request_queue_size = 128
        daemon_threads = True

    server = Server(('127.0.0.1', args.port), Handler)
    receipt = {'url': 'http://127.0.0.1:' + str(server.server_port) + '/app.html#lang=fr',
               'pid': os.getpid(), 'assetRoots': [str(p) for p in roots],
               'resources': str(args.resources.resolve()) if args.resources else None,
               'scope': 'local method integration only; no production deployment'}
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    print(receipt['url'], flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
