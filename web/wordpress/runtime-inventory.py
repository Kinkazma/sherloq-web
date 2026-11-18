"""Canonical browser companions for a complete local source assembly.

Retain declared predecessor resources, add every current src/vendor companion,
and select one separately verified worker artifact. No Git or external checkout
is consulted and no model is synthesized or implicitly downloaded.
"""
import json
from pathlib import Path
import re

SUFFIXES={'.js','.mjs','.json','.wasm','.wgsl','.glsl','.vert','.frag','.onnx','.bin','.pack','.icc','.data','.mem','.ts'}
def selected_worker(engine):
    engine=Path(engine);selector=(engine/'src/engine-worker-entry.js').read_text()
    names=re.findall(r"['\"]\./(worker-bundle-[a-f0-9]+\.mjs)['\"]",selector)
    if len(set(names))!=1:return None
    build=json.loads((engine/'worker-bundle-build.json').read_text());name='src/'+names[0]
    rows=[row for row in build['artifacts'] if row['path']==name]
    if len(rows)!=1:raise ValueError('Selected worker absent from its build proof')
    return dict(rows[0])

def selected_library(engine):
    engine=Path(engine);path=engine/'src/engine-library-entry.js'
    if not path.is_file():return None
    names=re.findall(r"['\"]\./(engine-library-bundle-[a-f0-9]+\.mjs)['\"]",path.read_text())
    if len(set(names))!=1:return None
    build=json.loads((engine/'worker-bundle-build.json').read_text());name='src/'+names[0]
    rows=[row for row in build['artifacts'] if row['path']==name]
    if len(rows)!=1 or build.get('engineLibrary',{}).get('bundle')!=name:
        raise ValueError('Selected engine library absent from its build proof')
    return dict(rows[0])

def runtime_paths(engine):
    engine=Path(engine);selected=selected_worker(engine);active=Path(selected['path']).name if selected else None;library=selected_library(engine);active_library=Path(library['path']).name if library else None;names=set()
    # Existing explicit runtime slots cover native/experiments data and notices
    # that are intentionally outside the ordinary browser companion trees.
    lock=engine.parent/'wordpress/runtime-source-lock.json'
    if lock.is_file():
        for runtime in json.loads(lock.read_text())['runtimes']:
            if Path(runtime['destination']).name=='unified-engine':
                names.update(name for name in runtime['files'] if (engine/name).is_file())
    for directory in ['src','vendor']:
        for path in (engine/directory).rglob('*'):
            if not path.is_file():continue
            rel=path.relative_to(engine)
            if any(part.startswith('.') or part in {'node_modules','__pycache__'} for part in rel.parts):continue
            notice=any(word in path.name.lower() for word in ['license','notice','copyright']) or path.name=='README.ijg'
            native_magick_license = rel.parts[:4] == ('vendor', 'media', 'magick-native', 'licenses') and path.suffix.lower() == '.txt'
            if path.suffix.lower() in SUFFIXES or notice or native_magick_license:names.add(rel.as_posix())
    names.update(name for name in ['CONTRACT.md','LICENSE','NOTICE.md','package.json','package-lock.json','runtime-manifest.json','worker-bundle-build.json'] if (engine/name).is_file())
    return [engine/name for name in sorted(names) if not (re.fullmatch(r'worker-bundle-[a-f0-9]+\.mjs',Path(name).name) and Path(name).name!=active) and not (re.fullmatch(r'engine-library-bundle-[a-f0-9]+\.mjs',Path(name).name) and Path(name).name!=active_library)]
