#!/usr/bin/env python3
"""Describe and merge exact Mini resource additions; never build an installer.

Default mode hashes every operator. --metadata-only is a fast, explicitly
unverified planning mode and cannot write merged manifest/lock outputs.
"""
from pathlib import Path
import argparse,hashlib,json,re

STATE='07fbb94c9738f65bfb7c6e8335638ed892fad329c343d5b8aac0908a982d43fe'
PREFIX='individual-assets/trufor-mini/'
CHUNK=100_000_000
LICENSES={'LICENSE.txt':'07201e07e3d2c1ac55480037a87734fcccacbb0cd0e25a31e3b89ac7ffadf8b4',
          'LICENSE_CMX.txt':'687ff4d0ea13200541df7359799a08c2db626094ecacbb8a3fe63ffad177f2a1'}
RUNTIME_MODULES=('external-useful-operation.js','index.js','m2-native-source-client.js',
 'm2-npz-stream.js','m2-source-region-input.js','m2-worker-client.js','m2-worker-host.js',
 'npz.js','source-region-runtime.js','trufor-mini-analyzer.js','trufor-mini-backbone.js',
 'trufor-mini-decoder.js','trufor-mini-geometry.js','trufor-mini-noiseprint.js',
 'trufor-mini-npz.js','trufor-mini-render.js','trufor-mini-source-region-router.js',
 'trufor-mini-strict-analyzer.js','trufor-mini-strict-source-input.js')

def encode(value):
    return (json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()

def digest(data):return hashlib.sha256(data).hexdigest()

def sha(path):
    h=hashlib.sha256()
    with path.open('rb')as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()

def safe_name(name):
    if not isinstance(name,str)or not name or Path(name).name!=name or name in{'.','..'}or'\\'in name:
        raise ValueError('Unsafe Mini resource filename')
    return name

def regular(path):
    if path.is_symlink()or not path.is_file():raise ValueError('Missing or symlinked source: '+path.name)
    return path

def build_plan(segments,engine_source=None,*,ui_version='0.33.0',metadata_only=False):
    if not re.fullmatch(r'\d+\.\d+\.\d+',ui_version):raise ValueError('Invalid UI version')
    segments=Path(segments);catalog_path=regular(segments/'manifest.json');catalog_raw=catalog_path.read_bytes();catalog=json.loads(catalog_raw)
    if catalog.get('schema')!=1 or catalog.get('method')!='trufor-mini'or catalog.get('stateSha256')!=STATE:
        raise ValueError('Unexpected frozen Mini state or schema')
    files={};chunks={};source_locks={'individual-assets':{},'unified-engine':{}};delivered_locks={'individual-assets':{},'unified-engine':{}}
    def add(logical,size,identity,mime):
        if size>CHUNK:raise ValueError('Mini addition exceeds one standard dependency chunk: '+logical)
        record={'size':size,'sha256':identity,'type':mime,'chunks':[identity]}
        if identity in chunks and chunks[identity]!=size:raise ValueError('Conflicting chunk extent')
        chunks[identity]=size;files[logical]=record
        return record
    def add_model(name,expected=None,raw=None):
        name=safe_name(name);path=regular(segments/name);size=path.stat().st_size
        if expected:
            identity=expected.get('sha256')
            if size!=expected.get('bytes')or not isinstance(identity,str)or not re.fullmatch('[a-f0-9]{64}',identity):raise ValueError('Mini model identity differs: '+name)
            if not metadata_only and sha(path)!=identity:raise ValueError('Mini model hash differs: '+name)
        else:
            raw=path.read_bytes()if raw is None else raw;identity=digest(raw)
        if name in LICENSES and identity!=LICENSES[name]:raise ValueError('Upstream Mini license changed: '+name)
        mime='application/json'if name.endswith('.json')else'text/plain'if name.endswith('.txt')else'application/octet-stream'
        add(PREFIX+name,size,identity,mime);relative='trufor-mini/'+name
        source_locks['individual-assets'][relative]=identity;delivered_locks['individual-assets'][relative]=identity
    add_model('manifest.json',raw=catalog_raw)
    names=set()
    for asset in catalog.get('assets',{}).values():
        name=safe_name(asset.get('file'))
        if name in names or not name.endswith('.onnx'):raise ValueError('Duplicate or non-ONNX Mini operator')
        names.add(name);add_model(name,asset)
    if not names:raise ValueError('Empty Mini operator catalogue')
    for name in LICENSES:add_model(name)
    model_resources=sorted(files);runtime_sources={};source_inventory=[]
    if engine_source:
        engine_source=Path(engine_source);prefix=('import "../../runtime-context.js?v='+ui_version+'";\n').encode()
        for name in RUNTIME_MODULES:
            relative='src/'+name;path=regular(engine_source/relative);raw=path.read_bytes()
            if b'runtime-context.js?v='in raw:raise ValueError('Expected raw canonical engine module: '+name)
            delivered=prefix+raw;logical='unified-engine/'+relative
            add(logical,len(delivered),digest(delivered),'text/javascript')
            runtime_sources[logical]={'source':'web/engine-source/'+relative,'rawBytes':len(raw),'rawSha256':digest(raw),'deliveredBytes':len(delivered),'deliveredSha256':digest(delivered),'transportPrefix':prefix.decode()}
            source_locks['unified-engine'][relative]=digest(raw);delivered_locks['unified-engine'][relative]=digest(delivered)
        inventory={engine_source/'src'/name for name in RUNTIME_MODULES}
        inventory|={engine_source/'scripts/export-trufor-mini.py'}
        inventory|=set((engine_source/'scripts').glob('compose-mini-*.py'))
        inventory|={p for p in(engine_source/'scripts/trufor-mini-reproduction').rglob('*')if p.is_file()and'__pycache__'not in p.parts}
        inventory|=set((engine_source/'tests').glob('trufor-mini*.test.mjs'))
        inventory|={engine_source/'tests/helpers/trufor-mini-strict-fixture.mjs'}
        for path in sorted(inventory):
            regular(path);source_inventory.append({'file':path.relative_to(engine_source).as_posix(),'bytes':path.stat().st_size,'sha256':sha(path)})
    return {'schema':'sherloq.trufor-mini-resource-additions/1','publicationPerformed':False,'bodyVerification':'metadata-only-unverified'if metadata_only else'verified-sha256',
      'stateSha256':STATE,'operatorManifestSha256':digest(catalog_raw),'files':files,'chunks':chunks,
      'feature':{'id':'m2.trufor-mini','fr':'TruFor Mini','en':'TruFor Mini','group':'neural-detectors','protected':False,'dependsOn':['resource.neural-runtime'],'resources':model_resources,'tasks':[{'operation':'m2.trufor-mini'}]},
      'runtimeSources':runtime_sources,'canonicalEngineSourceInventory':source_inventory,
      'lockFragments':{'runtime-source-lock.json':source_locks,'runtime-lock.json':delivered_locks},
      'mergePolicy':'Replace only the trufor-mini family and the explicit19 source companions; remove obsolete Mini resource names; preserve other files, including full TruFor and333. Derived worker, code identity, inventories and snapshot are regenerated separately.',
      'rawCheckpointIsRuntimeDependency':False,'localFilesAdded':sorted(name for name in runtime_sources if files[name]['size']<=128*1024),
      'totals':{'graphs':len(names),'modelResourceFiles':len(model_resources),'runtimeSourceModules':len(runtime_sources),'fragmentFiles':len(files),'logicalBytes':sum(r['size']for r in files.values()),'uniqueChunkBytes':sum(chunks.values())}}

def merge_manifest(base,plan):
    if base.get('schema')!='sherloq.dependencies/1'or'individual-assets'not in base.get('slots',[]):raise ValueError('Unsupported base dependency manifest')
    out=json.loads(json.dumps(base));files=out['files']
    for name in list(files):
        if name.startswith(PREFIX)and name not in plan['files']:files.pop(name)
    files.update(plan['files']);out['chunks'].update(plan['chunks'])
    used={h for row in files.values()for h in row['chunks']}
    if not used<=out['chunks'].keys():raise ValueError('Base manifest references missing chunk identities')
    out['chunks']={h:out['chunks'][h]for h in sorted(used)}
    out['localFiles']=sorted((set(out.get('localFiles',[]))&files.keys())|set(plan['localFilesAdded']))
    return out

def merge_lock(base,plan,kind):
    out=json.loads(json.dumps(base))
    for slot,records in plan['lockFragments'][kind].items():
        matches=[r for r in out.get('runtimes',[])if r.get('destination','').endswith('/'+slot)]
        if len(matches)!=1:raise ValueError('Expected exactly one locked slot: '+slot)
        files=matches[0]['files']
        if slot=='individual-assets':
            for name in list(files):
                if name.startswith('trufor-mini/')and name not in records:files.pop(name)
        files.update(records)
    return out

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--segments',type=Path,required=True);parser.add_argument('--engine-source',type=Path);parser.add_argument('--ui-version',default='0.33.0');parser.add_argument('--metadata-only',action='store_true');parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--base-manifest',type=Path);parser.add_argument('--source-lock',type=Path);parser.add_argument('--runtime-lock',type=Path);parser.add_argument('--merged-output',type=Path,help='Fresh output directory; never rewrites input manifests or locks')
    args=parser.parse_args();merge_args=[args.base_manifest,args.source_lock,args.runtime_lock,args.merged_output]
    if any(merge_args)and not all(merge_args):parser.error('Merging requires all four manifest/lock/output options')
    if args.merged_output and(args.metadata_only or not args.engine_source):parser.error('Merging requires verified model bodies and --engine-source')
    if args.merged_output and args.merged_output.exists():parser.error('--merged-output must be a fresh directory')
    if args.output.resolve().is_relative_to(args.segments.resolve()):parser.error('Plan output cannot overwrite the operator directory')
    if args.engine_source and args.output.resolve().is_relative_to(args.engine_source.resolve()):parser.error('Plan output cannot overwrite canonical engine sources')
    for path in [args.base_manifest,args.source_lock,args.runtime_lock]:
        if path and args.output.resolve()==path.resolve():parser.error('Plan output cannot overwrite an input')
    plan=build_plan(args.segments,args.engine_source,ui_version=args.ui_version,metadata_only=args.metadata_only)
    merged=None
    if args.merged_output:
        merged={'web-assets/manifest-template.json':merge_manifest(json.loads(args.base_manifest.read_text()),plan),
          'web/wordpress/runtime-source-lock.json':merge_lock(json.loads(args.source_lock.read_text()),plan,'runtime-source-lock.json'),
          'web/wordpress/runtime-lock.json':merge_lock(json.loads(args.runtime_lock.read_text()),plan,'runtime-lock.json')}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(encode(plan))
    if merged:
        for name,value in merged.items():
            target=args.merged_output/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(encode(value))
    print(json.dumps({'planSha256':sha(args.output),'bodyVerification':plan['bodyVerification'],**plan['totals']}))

if __name__=='__main__':main()
