#!/usr/bin/env python3
"""Describe exact RITA resource additions without copying any model payload.

The plan is an input for the release owner's normal manifest/lock preparation;
it does not stage a release, create a plugin archive or modify an installation.
"""
import argparse
import hashlib
import json
from pathlib import Path


# Keep this allowlist explicit: a similarly named file must not silently become
# part of the reviewed runtime, and required modules must not disappear.
RITA_RUNTIME_MODULES = (
    'rita-analyzer.js',
    'rita-cache-plan.js',
    'rita-query-plan.js',
    'rita-render.js',
    'rita-segmented-network.js',
    'rita-source-tensors.js',
)
SHARED_RUNTIME_MODULES = (
    'gpu-buffer-ledger.js',
    'm2-worker-host.js',
    'neural-graph-pool.js',
    'neural-graph-worker.js',
    'neural-session-cache.js',
    'neural-tensor-store.js',
)


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            digest.update(block)
    return digest.hexdigest()


def build_plan(segments, notice, engine_source=None):
    catalog_path = segments/'manifest.json'
    catalog = json.loads(catalog_path.read_text())
    if catalog.get('checkpoint_sha256') != '50da42c81508dd3d0f150af4245f47af8c8c0b554a392527635b7e2245aa3299':
        raise ValueError('Unexpected RITA checkpoint identity')
    prefix = 'individual-assets/rita-native/'
    files, chunks = {}, {}
    def add(name, path, expected=None):
        if Path(name).name != name or name in {'.','..'} or '\\' in name:
            raise ValueError('Unsafe RITA resource filename')
        size, digest = path.stat().st_size, sha(path)
        if expected and (size != expected['bytes'] or digest != expected['sha256']):
            raise ValueError('RITA operator identity differs: '+name)
        if size > 100_000_000:
            raise ValueError('Operator exceeds a standard dependency chunk')
        logical = prefix+name
        chunks[digest] = size
        files[logical] = {'size':size,'sha256':digest,'chunks':[digest],
                         'type':'application/json' if path.suffix=='.json' else 'text/plain' if path.suffix=='.txt' else 'application/octet-stream'}
    add('manifest.json',catalog_path)
    for asset in catalog['assets'].values():
        add(asset['file'],segments/asset['file'],asset)
    add('NOTICE.txt',notice)
    runtime_sources = {}
    if engine_source:
        for name in sorted(RITA_RUNTIME_MODULES + SHARED_RUNTIME_MODULES):
            path = engine_source/'src'/name
            if not path.is_file():
                raise ValueError('Missing reviewed RITA runtime module: '+name)
            runtime_sources['unified-engine/src/'+name] = {'bytes':path.stat().st_size,'sha256':sha(path)}
    return {'schema':'sherloq.rita-resource-additions/1','publicationPerformed':False,
            'slot':'individual-assets','files':files,'chunks':chunks,
            'feature':{'id':'m2.rita','fr':'RITA','en':'RITA','group':'neural-detectors',
                       'protected':False,'dependsOn':['resource.neural-runtime'],
                       'resources':sorted(files),'tasks':[{'operation':'m2.rita'}]},
            'runtimeSources':runtime_sources,
            'rawCheckpointIsRuntimeDependency':False,
            'modelStorage':'Learned weights are embedded in the108 FP32 ONNX operators; do not add the raw checkpoint or a monolithic ONNX duplicate to offline dependencies.',
            'weightsLicense':{'spdx':'CC-BY-NC-SA-4.0','url':'https://creativecommons.org/licenses/by-nc-sa/4.0/'},
            'reconstruction':{'script':'web/engine-source/scripts/rita-rebuild.py',
                              'sourceCommit':catalog.get('source_commit','b50efcd5b4c41b8bfc69b0b10ce6230dcb67b983'),
                              'sourceSha256':catalog['source_sha256'],
                              'checkpointSha256':catalog['checkpoint_sha256']},
            'totals':{'graphs':len(catalog['assets']),'resourceFiles':len(files),
                      'logicalBytes':sum(file['size'] for file in files.values()),
                      'uniqueChunkBytes':sum(chunks.values())}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--segments',type=Path,required=True)
    parser.add_argument('--notice',type=Path,required=True)
    parser.add_argument('--engine-source',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    args = parser.parse_args()
    plan = build_plan(args.segments,args.notice,args.engine_source)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(plan,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'sha256':sha(args.output),**plan['totals']}))


if __name__=='__main__':
    main()
