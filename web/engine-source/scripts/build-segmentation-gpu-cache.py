"""Bound idle JSEP GPU buffer retention without changing shaders or tensors.

Patch only the pinned ORT1.30 bucket count table. Active and submitted buffers
are still managed by the original allocator and charged by the shared adapter.
The distinct native WebGPU provider's cache options do not configure JSEP.
"""
from pathlib import Path
import hashlib,json,re

root=Path(__file__).resolve().parents[1]
source=root/'vendor/segmentation/ort.all.min.mjs'
pinned=json.loads((root/'vendor/segmentation/PINNED.json').read_text())['files'][source.name]
data=source.read_bytes();sha=lambda b:hashlib.sha256(b).hexdigest()
assert len(data)==pinned['bytes'] and sha(data)==pinned['sha256']
text=data.decode()
# Exact source table, not an unverified replacement of arbitrary array literals.
upstream=root/'.build/ort130/package/lib/wasm/jsep/webgpu/gpu-data-manager.ts'
ts=upstream.read_text();section=ts.split('const bucketFreelist: Map<number, number> = new Map([',1)[1].split(']);',1)[0]
original=[[int(n),int(c)] for n,c in re.findall(r'\[(\d+),\s*(\d+)\]',section)]
assert len(original)==26 and original[0]==[64,250] and original[-1]==[167772160,6]
old=json.dumps(original,separators=(',',':'))
assert text.count('new Map('+old+')')==1
per_bucket=4*1024**2
bounded=[[size,min(count,per_bucket//size)] for size,count in original]
new=json.dumps(bounded,separators=(',',':'))
changed=text.replace('new Map('+old+')','new Map('+new+')').encode()
out=root/'.build/segmentation-ort-gpu-bounded-cache';out.mkdir(exist_ok=True)
(out/'ort.all.min.mjs').write_bytes(changed)
report=dict(schema=1,status='unqualified-runtime-candidate',upstreamVersion='1.30.0',
    scope='Only maximum idle buffers per size bucket reduced. Bucket sizes, active allocations, queue submission/release ordering, shaders, arithmetic, models and WASM unchanged. Shared GPU admission still512MiB; no ceiling increase. Each pool has a mathematical aggregate bound; storage and uniform lists are separate.',
    originalCounts=original,boundedCounts=bounded,perBucketMaximumBytes=per_bucket,
    maximumPerIdlePoolBytes=sum(size*count for size,count in bounded),
    maximumBothIdlePoolsBytes=2*sum(size*count for size,count in bounded),
    upstreamSha256=sha(data),upstreamAllocatorSourceSha256=sha(upstream.read_bytes()),
    scriptSha256=sha(Path(__file__).read_bytes()),files={'ort.all.min.mjs':dict(bytes=len(changed),sha256=sha(changed))})
(out/'build.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report),flush=True)
