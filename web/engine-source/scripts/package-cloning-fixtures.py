"""Deduplicate public small ORB reference buffers; large cases stay generatable."""
from pathlib import Path
import argparse, gzip, hashlib, io, json
parser=argparse.ArgumentParser();parser.add_argument('--algorithm',choices=['orb','akaze'],default='orb');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];source=root/('.build/cloning-study' if args.algorithm=='orb' else '.build/akaze-pipeline-study');out=root/('fixtures/cloning' if args.algorithm=='orb' else 'fixtures/akaze');out.mkdir(exist_ok=True)
native=json.loads((source/'reference.json').read_text())
cases=[row for row in json.loads((source/'api-reference.json').read_text()) if not row['image'].startswith('large-')]
cases += [row for row in json.loads((source/'original-reference.json').read_text()) if not row['image'].startswith('large-')]
payload=bytearray();by_hash={};files={}
def add(name):
    if name in files:return
    data=(source/name).read_bytes();digest=hashlib.sha256(data).hexdigest()
    if digest not in by_hash:
        while len(payload)%8:payload.append(0)
        by_hash[digest]={'offset':len(payload),'bytes':len(data),'sha256':digest};payload.extend(data)
    files[name]=by_hash[digest]
for row in cases:
    add(row.get('inputFile',row['image']+'.png'))
    if row['mask']!='all':add(row['image']+'-'+row['mask']+'-mask.png')
    if 'error' in row:continue
    for suffix in ['-points.f64','-filtered.f64','-lengths.u32','-groups.u32','.rgb']:add(row['prefix']+suffix)
primitives={}
if args.algorithm=='orb':
    primitives=json.loads((source/'primitives-reference.json').read_text())
    add('norm-primitives.f64')
    for case in primitives['stats']:add(case['file'])
compressed=io.BytesIO()
with gzip.GzipFile(filename='',mode='wb',fileobj=compressed,mtime=0) as f:f.write(payload)
data=compressed.getvalue();(out/'reference.bin.gz').write_bytes(data)
manifest={'schema':1,'algorithm':args.algorithm.upper(),'nativeSourceSha256':native['sourceSha256'],'numpy':native['numpy'],'opencv':native['opencv'],'source':'Generated synthetic '+args.algorithm.upper()+' images and native outputs; no private images or weights','payload':{'file':'reference.bin.gz','bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'compressedBytes':len(data),'compressedSha256':hashlib.sha256(data).hexdigest(),'uniqueBuffers':len(by_hash)},'files':files,'cases':cases,'primitives':primitives}
(out/'reference.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(len(cases),'pipelines;',len(by_hash),'unique buffers;',len(payload),'raw bytes;',len(data),'compressed bytes')
